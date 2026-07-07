-- scan_jobs is a server-managed queue: only the backend worker (service_role) writes to it.
-- Revoke write privileges from authenticated to make the intent explicit at the grants layer,
-- in addition to the existing fail-closed RLS (SELECT-only policy).
REVOKE INSERT, UPDATE, DELETE ON public.scan_jobs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scan_jobs FROM anon;