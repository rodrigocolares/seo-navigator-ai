
-- Extend scans with async pipeline fields
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS progress int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_discovered int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_processed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pages_failed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS current_url text,
  ADD COLUMN IF NOT EXISTS estimated_remaining_seconds int,
  ADD COLUMN IF NOT EXISTS crawler_mode text NOT NULL DEFAULT 'async',
  ADD COLUMN IF NOT EXISTS retry_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_error text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scans_crawler_mode_check') THEN
    ALTER TABLE public.scans ADD CONSTRAINT scans_crawler_mode_check
      CHECK (crawler_mode IN ('sync','async'));
  END IF;
END $$;

-- profiles.plan
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'free';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_plan_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check
      CHECK (plan IN ('free','pro','business','enterprise'));
  END IF;
END $$;

-- scan_jobs queue
CREATE TABLE IF NOT EXISTS public.scan_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  job_type text NOT NULL CHECK (job_type IN ('discover_urls','crawl_page','calculate_scores','generate_ai_report','finalize_scan')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','retrying','cancelled')),
  priority int NOT NULL DEFAULT 100,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  locked_at timestamptz,
  locked_by text,
  run_after timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scan_jobs TO authenticated;
GRANT ALL ON public.scan_jobs TO service_role;

ALTER TABLE public.scan_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own scan_jobs" ON public.scan_jobs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS scan_jobs_dispatch_idx
  ON public.scan_jobs (status, run_after, priority)
  WHERE status IN ('queued','retrying');
CREATE INDEX IF NOT EXISTS scan_jobs_scan_idx ON public.scan_jobs (scan_id);

-- scan_job_logs
CREATE TABLE IF NOT EXISTS public.scan_job_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.scan_jobs(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message text NOT NULL,
  context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.scan_job_logs TO authenticated;
GRANT ALL ON public.scan_job_logs TO service_role;

ALTER TABLE public.scan_job_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read logs for own scans" ON public.scan_job_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_id AND s.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS scan_job_logs_scan_idx ON public.scan_job_logs (scan_id, created_at DESC);

-- Atomic job claim: returns claimed jobs
CREATE OR REPLACE FUNCTION public.claim_scan_jobs(_limit int, _worker text)
RETURNS SETOF public.scan_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.scan_jobs
    WHERE status IN ('queued','retrying')
      AND run_after <= now()
      AND (locked_at IS NULL OR locked_at < now() - interval '5 minutes')
    ORDER BY priority ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.scan_jobs sj
  SET status = 'running',
      locked_at = now(),
      locked_by = _worker,
      started_at = COALESCE(sj.started_at, now()),
      attempts = sj.attempts + 1,
      updated_at = now()
  FROM picked
  WHERE sj.id = picked.id
  RETURNING sj.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_scan_jobs(int, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_scan_jobs(int, text) TO service_role;
