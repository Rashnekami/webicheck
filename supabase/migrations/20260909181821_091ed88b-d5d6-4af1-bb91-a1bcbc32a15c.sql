
CREATE TABLE IF NOT EXISTS public.signal_panel_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);

GRANT SELECT ON public.signal_panel_access TO authenticated;
GRANT ALL ON public.signal_panel_access TO service_role;

ALTER TABLE public.signal_panel_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS signal_panel_access_read ON public.signal_panel_access;
CREATE POLICY signal_panel_access_read ON public.signal_panel_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (provider_id = public.current_provider_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

CREATE OR REPLACE FUNCTION public.has_signal_panel_access(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::app_role
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _user_id AND platform_admin = true
  ) OR EXISTS (
    SELECT 1 FROM public.signal_panel_access WHERE user_id = _user_id
  )
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['signal_imports','signal_cases','signal_measurements','signal_case_events','signal_ai_analyses','signal_pon_stats','signal_campaigns','signal_campaign_cases']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_provider_access_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (provider_id = public.current_provider_id() AND (public.has_role(auth.uid(), ''admin''::app_role) OR public.has_signal_panel_access(auth.uid()))) WITH CHECK (provider_id = public.current_provider_id() AND (public.has_role(auth.uid(), ''admin''::app_role) OR public.has_signal_panel_access(auth.uid())))',
      t || '_provider_access_all', t);
  END LOOP;
END $$;
