-- Fase 1: Base de integração Google (GSC + GA4)

-- 1) google_connections: conta Google conectada por usuário, com tokens criptografados
CREATE TABLE public.google_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_account_email TEXT NOT NULL,
  google_account_sub TEXT,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_iv TEXT NOT NULL,
  refresh_iv TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_account_email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_connections TO authenticated;
GRANT ALL ON public.google_connections TO service_role;
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own google connections"
  ON public.google_connections FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2) google_search_console_sites: propriedades GSC do usuário
CREATE TABLE public.google_search_console_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.google_connections(id) ON DELETE CASCADE,
  site_url TEXT NOT NULL,
  permission_level TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, site_url)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_search_console_sites TO authenticated;
GRANT ALL ON public.google_search_console_sites TO service_role;
ALTER TABLE public.google_search_console_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own gsc sites"
  ON public.google_search_console_sites FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) google_analytics_properties: propriedades GA4 do usuário
CREATE TABLE public.google_analytics_properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES public.google_connections(id) ON DELETE CASCADE,
  account_id TEXT,
  account_name TEXT,
  property_id TEXT NOT NULL,
  property_name TEXT,
  display_name TEXT,
  currency_code TEXT,
  time_zone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, property_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_analytics_properties TO authenticated;
GRANT ALL ON public.google_analytics_properties TO service_role;
ALTER TABLE public.google_analytics_properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own ga4 properties"
  ON public.google_analytics_properties FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) domain_integrations: vincula domínio analisado -> propriedades Google
CREATE TABLE public.domain_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  search_console_site_id UUID REFERENCES public.google_search_console_sites(id) ON DELETE SET NULL,
  ga4_property_id UUID REFERENCES public.google_analytics_properties(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domain_integrations TO authenticated;
GRANT ALL ON public.domain_integrations TO service_role;
ALTER TABLE public.domain_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own domain integrations"
  ON public.domain_integrations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5) google_sync_logs: histórico de sincronizações
CREATE TABLE public.google_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.google_connections(id) ON DELETE CASCADE,
  integration_type TEXT NOT NULL,
  domain TEXT,
  status TEXT NOT NULL,
  records_synced INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.google_sync_logs TO authenticated;
GRANT ALL ON public.google_sync_logs TO service_role;
ALTER TABLE public.google_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own sync logs"
  ON public.google_sync_logs FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users insert their own sync logs"
  ON public.google_sync_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- updated_at trigger reutilizável
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_google_connections_updated_at
  BEFORE UPDATE ON public.google_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_gsc_sites_updated_at
  BEFORE UPDATE ON public.google_search_console_sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ga4_props_updated_at
  BEFORE UPDATE ON public.google_analytics_properties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_domain_integrations_updated_at
  BEFORE UPDATE ON public.domain_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
