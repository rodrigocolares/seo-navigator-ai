# Integração Google Search Console + GA4

O escopo pedido é grande (~10 tabelas, OAuth per-user, 2 provedores, sync, IA, comparação, exportação). Vou entregar em fases, começando pelo alicerce (OAuth + conectar/listar propriedades + vincular ao domínio + sincronização básica). As fases seguintes ficam prontas para serem implementadas em turnos separados sem retrabalho.

## Decisão que preciso confirmar antes de começar

**Como autenticar o usuário no Google?** As duas opções são incompatíveis — a escolha define o fluxo inteiro.

**Opção A — OAuth per-user com credenciais Google próprias (recomendada, é o que o pedido descreve)**
Cada usuário do SEO Insight conecta a *própria* conta Google e enxerga apenas *suas* propriedades GSC / GA4. Para isso preciso que você:
1. Crie um projeto no Google Cloud Console, ative as APIs "Search Console API" e "Google Analytics Data API".
2. Configure a tela de consentimento OAuth (External), adicionando os escopos `webmasters.readonly` e `analytics.readonly`.
3. Crie credenciais **OAuth 2.0 Client ID → Web application** e cadastre como *Authorized redirect URI* a URL pública do app: `https://<seu-dominio>/api/public/google/callback` (informo a URL exata quando estivermos publicados; para preview usamos `project--<id>-dev.lovable.app`).
4. Me passe `GOOGLE_OAUTH_CLIENT_ID` e `GOOGLE_OAUTH_CLIENT_SECRET` — abro o form seguro do `add_secret`.

**Opção B — Connector Lovable do Search Console (só um Google, sem GA4)**
Já existe um connector gerenciado do GSC, mas ele autentica *sua* conta Google (workspace), não a de cada usuário — todos veriam as mesmas propriedades. E não cobre GA4. Só faz sentido se o produto for single-tenant / uso interno.

Assumo **Opção A** no plano abaixo. Se preferir B, me diga e reduzo o escopo.

## Fase 1 — Fundação (este ciclo)

**Backend**
- Migração criando: `google_connections`, `google_search_console_sites`, `google_analytics_properties`, `domain_integrations`, `google_sync_logs`. Todas com RLS por `user_id`, GRANTs corretos, tokens armazenados **criptografados** (AES-GCM com `GOOGLE_TOKEN_ENCRYPTION_KEY` gerado por `generate_secret`).
- Server routes públicas (bypass auth por design, protegidas por `state` assinado):
  - `GET /api/public/google/callback` — recebe `code`, troca por tokens, salva criptografado, redireciona para `/integrations`.
- Server functions autenticadas (`requireSupabaseAuth`):
  - `startGoogleOAuth({ scopes })` — devolve URL de consentimento (Google login), state assinado com `user_id`.
  - `listGoogleConnections()`, `disconnectGoogle({ connectionId })`.
  - `listSearchConsoleSites({ connectionId })`, `listAnalyticsProperties({ connectionId })` — chamam APIs Google usando `access_token` (com refresh automático se expirado).
  - `linkDomainIntegration({ domain, gscSiteId, ga4PropertyId })`.
- Helper server-only `google-tokens.server.ts`: criptografia, refresh de token, chamada autenticada às APIs Google.

**Frontend**
- Nova rota `/integrations` (dentro de `_authenticated`) com 2 cards (GSC / GA4): status, email conectado, propriedades, botões Conectar / Sincronizar / Desconectar / Configurar.
- Item "Integrações" no menu.
- Modal "Configurar Integração": selecionar site GSC + propriedade GA4 por domínio.
- CTA na página de análise quando o domínio não tem integração.

**Segredos necessários** (`add_secret` depois da sua confirmação):
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_TOKEN_ENCRYPTION_KEY` (gerado automaticamente)
- `GOOGLE_OAUTH_STATE_SECRET` (gerado automaticamente)

## Fase 2 — Sincronização

- Tabelas de dados: `gsc_query_performance`, `gsc_page_performance`, `gsc_device_performance`, `gsc_country_performance`, `gsc_sitemaps`, `ga4_organic_summary`, `ga4_landing_pages`, `ga4_pages`, `ga4_channels`, `ga4_source_medium`, `ga4_devices`.
- Server functions `syncSearchConsoleData` / `syncGA4Data` (períodos 7/28/90 dias).
- Botão "Sincronizar agora" em `/integrations` + registro em `google_sync_logs`.
- Cron diário via `pg_cron` + rota `/api/public/hooks/sync-google` (auth via `apikey` header).

## Fase 3 — Consumo (IA + UI + export)

- Aba "Dados Google" na página de análise, com sub-abas Search Console / Analytics / Oportunidades / Cruzamento.
- Tabela `google_seo_opportunities` gerada pelo cruzamento crawler × GSC × GA4.
- Prompt da IA atualizado para receber métricas Google e produzir diagnóstico separado (técnico / indexação / tráfego / oportunidades / ações prioritárias).
- `/compare` estendido com métricas GSC/GA4.
- Centro de exportação: novos checkboxes, seções no PDF, abas no Excel, arquivos CSV, nós no JSON.

## Detalhes técnicos importantes

- **RLS + GRANTs em toda tabela nova.** Tokens **nunca** trafegam ao frontend nem entram em logs.
- **Refresh automático:** todo call helper checa `expires_at`, refaz `POST oauth2.googleapis.com/token` com `refresh_token` se faltar < 60s.
- **State CSRF:** o `state` do OAuth é `HMAC(user_id + nonce + ts)` validado no callback — evita sequestro de fluxo.
- **API GA4 vs GSC:** GA4 usa `analyticsdata.googleapis.com/v1beta/properties/{id}:runReport`; GSC usa `searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query`. Ambas chamadas HTTP diretas com `Authorization: Bearer <access_token>` — sem SDK (SDKs Google são Node-only e não funcionam no runtime Worker do TanStack Start).
- **Callback público:** `/api/public/google/callback` bypassa auth por design; a segurança vem da assinatura HMAC do `state` que carrega o `user_id`.

## O que preciso de você para começar

1. **Confirma Opção A** (per-user OAuth com suas próprias credenciais Google).
2. **Confirma começar pela Fase 1** (Fundação: OAuth + conectar + listar + vincular). Fases 2 e 3 nos próximos turnos.
3. Depois que você confirmar, te mando o passo-a-passo exato para criar as credenciais no Google Cloud Console e a URL de redirect exata para colar lá. Só depois disso rodo `add_secret` para receber `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`.

Se quiser trocar a ordem das fases, cortar algo (ex.: começar só com GSC), ou combinar Fase 2 na mesma leva, me diga agora.
