
# Crawler Assíncrono com Fila — SEO Insight AI

Evoluir o crawler atual (que roda dentro da requisição) para um pipeline baseado em fila persistente, worker acionado por cron a cada minuto, com progresso em tempo quase real, cancelamento e retry. O crawler síncrono é mantido como fallback (`crawler_mode = 'sync' | 'async'`, default `async`).

## 1. Banco de dados (1 migração)

### Alterações em `scans`
Adicionar colunas (sem quebrar dados atuais):
- `progress` int default 0 (0–100)
- `pages_discovered` int default 0
- `pages_processed` int default 0
- `pages_failed` int default 0
- `started_at`, `completed_at`, `failed_at`, `cancelled_at` timestamptz
- `current_url` text
- `estimated_remaining_seconds` int
- `crawler_mode` text default `'async'` check in (`'sync'`,`'async'`)
- `retry_count` int default 0
- `ai_error` text

Manter `status` existente mas ampliar valores aceitos: `queued | running | crawling | analyzing | completed | failed | cancelled`. Novos scans nascem `queued`.

### Nova tabela `scan_jobs`
Campos: `id`, `scan_id`, `user_id`, `job_type` (`discover_urls|crawl_page|calculate_scores|generate_ai_report|finalize_scan`), `status` (`queued|running|completed|failed|retrying|cancelled`), `priority` int, `payload` jsonb, `attempts` int, `max_attempts` int default 3, `locked_at`, `locked_by` text, `started_at`, `completed_at`, `failed_at`, `error_message`, `run_after` timestamptz default `now()` (para backoff), timestamps.

Índices: `(status, run_after, priority)`, `(scan_id)`, `(locked_at)`.

### Nova tabela `scan_job_logs`
`id`, `scan_id`, `job_id` (null), `level` (`info|warn|error`), `message`, `context` jsonb, `created_at`.

### GRANTs + RLS
- `scan_jobs`: SELECT para `authenticated` (via `user_id = auth.uid()`), `ALL` para `service_role`. Sem INSERT/UPDATE cliente — só worker.
- `scan_job_logs`: SELECT para dono via scan; ALL service_role.

## 2. Novo módulo backend

### `src/lib/scan-queue.server.ts` (server-only)
- `enqueueJob(scanId, type, payload, priority)`
- `claimJobs(limit)` — `UPDATE ... SET locked_at, locked_by, status='running' WHERE status IN ('queued','retrying') AND run_after<=now() AND (locked_at IS NULL OR locked_at < now()-interval '5 min') RETURNING *` com `LIMIT` e `FOR UPDATE SKIP LOCKED` via RPC.
- `completeJob`, `failJob(withRetry)`, `logJobEvent`.
- Concurrency guard: ao claim, checar `count(*) scan_jobs where user_id=X and status='running'` ≤ 2 por usuário.

### `src/lib/scan-worker.server.ts`
Handlers por `job_type`:
1. **discover_urls**: fetch robots.txt + sitemap.xml + home links; normaliza; deduplica; respeita `total_pages_limit`; enfileira N `crawl_page` jobs; atualiza `pages_discovered`.
2. **crawl_page**: analisa uma URL (reaproveita `analyzePage` extraído de `seo-analyzer.server.ts`), grava em `scan_pages`+`scan_issues`, incrementa `pages_processed`/`pages_failed`, atualiza `progress` e `current_url`. Rate-limit por domínio (delay 500–1000ms). Se todas as páginas concluídas, enfileira `calculate_scores`.
3. **calculate_scores**: `computeScores` sobre `scan_pages`+`scan_issues`, `scans.scores`; enfileira `generate_ai_report`.
4. **generate_ai_report**: chama `generateAIReport`; salva `ai_report`; em falha grava `ai_error` mas segue.
5. **finalize_scan**: `status='completed'`, `completed_at`, `progress=100`.

Retry: status 429/5xx/network → `status='retrying'`, `run_after = now() + interval` (backoff 30s, 2min, 5min).

### `src/routes/api/public/hooks/process-scan.ts` (server route)
- Auth: header `x-worker-secret` == `process.env.WORKER_SECRET`.
- Batch: claim até 5 jobs, executa em série, retorna JSON `{processed, results}`.
- Bounded per-request (~50s cap) — cron chama a cada minuto e o próximo tick continua.

### `src/lib/scan-queue.functions.ts`
Server functions autenticadas (usa `requireSupabaseAuth`):
- `startAsyncScan({url, maxPages, mode})` — cria scan `queued`, enfileira `discover_urls`, retorna `{id}`. Dispara `fetch()` fire-and-forget ao endpoint worker para iniciar imediatamente (não espera).
- `getScanProgress({id})` — retorna `{status, progress, pages_discovered, pages_processed, pages_failed, current_url, estimated_remaining_seconds, jobs_pending}`.
- `cancelScan({id})` — valida dono, `status='cancelled'`, marca jobs pendentes como `cancelled`.

O fluxo síncrono atual (`startScan`) continua disponível como fallback quando `mode='sync'`.

## 3. Segredo e cron

- Solicitar `WORKER_SECRET` via `generate_secret` (32 chars).
- Após aprovação da migração, criar cron job com `supabase--insert`:
  ```sql
  select cron.schedule('seo-worker', '* * * * *', $$
    select net.http_post(
      url:='https://project--39b46734-a72b-41c8-bb5e-5fbfaf45b349.lovable.app/api/public/hooks/process-scan',
      headers:='{"Content-Type":"application/json","x-worker-secret":"<gerado>"}'::jsonb,
      body:='{}'::jsonb
    );
  $$);
  ```

## 4. Frontend

### `src/routes/_authenticated/dashboard.tsx`
Trocar `startScan` por `startAsyncScan`. Toast "Análise adicionada à fila" + redireciona.

### `src/routes/_authenticated/scans.$id.tsx`
- Quando `status ∈ {queued, running, crawling, analyzing}`:
  - Novo componente `ScanProgressPanel` com polling a cada 4s via `getScanProgress` (React Query `refetchInterval`).
  - Mostra barra, contadores, URL atual, tempo estimado, botão **Cancelar análise** (mutation `cancelScan`).
- Ao entrar em `completed`, para o polling e renderiza relatório completo (comportamento atual).
- Estado `cancelled` e `failed` com mensagens amigáveis. Se `ai_error`, banner "Análise concluída, mas o parecer IA não pôde ser gerado."

### `src/components/ScanProgressPanel.tsx` (novo)
Card com progresso, contadores, URL corrente, ETA, botão cancelar.

## 5. Compatibilidade e escala

- Histórico, comparação e exportação leem `scans/scan_pages/scan_issues` — inalterados.
- Limites de páginas expandidos no seletor do dashboard: 15, 50, 100, 250, 500 (default por plano armazenado em `profiles.plan`, opcional; MVP libera até 500 para todos).
- Adicionar `profiles.plan` text default `'free'` com CHECK — opcional nesta migração (incluído).

## 6. Detalhes técnicos

- Todo código server-only fica em `*.server.ts`; server-functions em `*.functions.ts` (imports server-only só dentro de handlers, conforme `tanstack-serverfn-splitting`).
- Worker route lê `process.env.WORKER_SECRET` dentro do handler.
- Locks: `locked_at + locked_by` com timeout de 5 min para permitir recuperação.
- Concurrency: no `crawl_page`, checar `pages_processed + pages_failed < total_pages_limit` antes de fetch para permitir cancelamento em meio ao lote.
- ETA: `((pages_discovered - pages_processed) * avg_ms) / 1000`, avg computado dos scan_pages já persistidos.

## 7. Passos de execução

1. `supabase--migration` (colunas em scans + tabelas scan_jobs, scan_job_logs + grants + RLS + índices + profiles.plan).
2. `secrets--generate_secret` `WORKER_SECRET`.
3. Criar módulos server + server route + server functions.
4. Atualizar `dashboard.tsx` e `scans.$id.tsx` + novo `ScanProgressPanel`.
5. `supabase--insert` para agendar cron do worker (após migração aprovada).
6. Validar com preview: iniciar scan, ver progresso, cancelar.

## Critérios de aceite atendidos

- Retorno rápido no start; scan `queued` → `running` → `completed/failed/cancelled`.
- Progresso em tempo quase real via polling 4s.
- Cancelamento durante execução.
- Falhas de páginas individuais isoladas; retry com backoff em 429/5xx.
- RLS mantida; exportação/comparação continuam funcionando.
- Fallback sync preservado via `crawler_mode`.
