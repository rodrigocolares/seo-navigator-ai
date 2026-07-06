
ALTER TYPE public.scan_status ADD VALUE IF NOT EXISTS 'running';
ALTER TYPE public.scan_status ADD VALUE IF NOT EXISTS 'cancelled';
