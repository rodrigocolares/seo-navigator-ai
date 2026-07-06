
CREATE TABLE public.export_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  format TEXT NOT NULL,
  report_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.export_logs TO authenticated;
GRANT ALL ON public.export_logs TO service_role;

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own export logs"
  ON public.export_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own export logs"
  ON public.export_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX export_logs_user_scan_idx ON public.export_logs (user_id, scan_id, created_at DESC);
