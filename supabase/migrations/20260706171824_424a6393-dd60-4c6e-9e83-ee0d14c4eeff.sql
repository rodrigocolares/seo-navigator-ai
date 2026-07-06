
REVOKE EXECUTE ON FUNCTION public.claim_scan_jobs(int, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_scan_jobs(int, text) TO service_role;
