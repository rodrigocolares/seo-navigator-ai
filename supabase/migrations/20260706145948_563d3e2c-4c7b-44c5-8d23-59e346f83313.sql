
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile upsert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Scans
CREATE TYPE public.scan_status AS ENUM ('queued','crawling','analyzing','completed','failed');

CREATE TABLE public.scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  host TEXT NOT NULL,
  max_pages INT NOT NULL DEFAULT 20,
  status public.scan_status NOT NULL DEFAULT 'queued',
  error_message TEXT,
  pages_crawled INT NOT NULL DEFAULT 0,
  scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_report JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scans_user_created_idx ON public.scans(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scans TO authenticated;
GRANT ALL ON public.scans TO service_role;
ALTER TABLE public.scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scans read"   ON public.scans FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own scans insert" ON public.scans FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own scans update" ON public.scans FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own scans delete" ON public.scans FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Scan pages
CREATE TABLE public.scan_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status_code INT,
  response_ms INT,
  size_bytes INT,
  content_type TEXT,
  title TEXT,
  meta_description TEXT,
  canonical TEXT,
  robots_meta TEXT,
  lang TEXT,
  viewport TEXT,
  h1_count INT,
  h2_count INT,
  word_count INT,
  images_total INT,
  images_missing_alt INT,
  links_internal INT,
  links_external INT,
  has_og BOOLEAN DEFAULT false,
  has_schema BOOLEAN DEFAULT false,
  is_https BOOLEAN DEFAULT false,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scan_pages_scan_idx ON public.scan_pages(scan_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_pages TO authenticated;
GRANT ALL ON public.scan_pages TO service_role;
ALTER TABLE public.scan_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own pages read" ON public.scan_pages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_pages.scan_id AND s.user_id = auth.uid()));
CREATE POLICY "own pages write" ON public.scan_pages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_pages.scan_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_pages.scan_id AND s.user_id = auth.uid()));

-- Issues
CREATE TYPE public.severity AS ENUM ('low','medium','high');

CREATE TABLE public.scan_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  page_id UUID REFERENCES public.scan_pages(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity public.severity NOT NULL DEFAULT 'medium',
  title TEXT NOT NULL,
  description TEXT,
  recommendation TEXT,
  impact TEXT,
  effort TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX scan_issues_scan_idx ON public.scan_issues(scan_id, severity);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_issues TO authenticated;
GRANT ALL ON public.scan_issues TO service_role;
ALTER TABLE public.scan_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own issues read" ON public.scan_issues FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_issues.scan_id AND s.user_id = auth.uid()));
CREATE POLICY "own issues write" ON public.scan_issues FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_issues.scan_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.scans s WHERE s.id = scan_issues.scan_id AND s.user_id = auth.uid()));
