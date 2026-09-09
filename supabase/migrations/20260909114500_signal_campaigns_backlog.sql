-- Evolução do Painel de Sinais: backlog permanente por campanha, escopo por provedor e estatísticas por PON.

CREATE TABLE IF NOT EXISTS public.signal_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  city text NOT NULL CHECK (city IN ('Telêmaco Borba','Imbaú','Tibagi')),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'building' CHECK (status IN ('building','active','closed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  baseline_locked_at timestamptz,
  closed_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS signal_campaigns_one_open_per_city_idx
ON public.signal_campaigns(provider_id, city)
WHERE status IN ('building','active');

ALTER TABLE public.signal_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signal_campaigns_provider_admin_all ON public.signal_campaigns;
CREATE POLICY signal_campaigns_provider_admin_all ON public.signal_campaigns FOR ALL TO authenticated
USING (provider_id = public.current_provider_id() AND public.has_role(auth.uid(),'admin'))
WITH CHECK (provider_id = public.current_provider_id() AND public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_campaigns TO authenticated;

CREATE TABLE IF NOT EXISTS public.signal_campaign_cases (
  campaign_id uuid NOT NULL REFERENCES public.signal_campaigns(id) ON DELETE CASCADE,
  signal_case_id uuid NOT NULL REFERENCES public.signal_cases(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  city text NOT NULL,
  board text,
  port text,
  baseline_signal_1310 numeric(7,2) NOT NULL,
  baseline_signal_1490 numeric(7,2) NOT NULL,
  baseline_difference_db numeric(7,2) NOT NULL,
  baseline_issue_kind text NOT NULL,
  baseline_severity text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(campaign_id, signal_case_id)
);

CREATE INDEX IF NOT EXISTS signal_campaign_cases_campaign_board_idx
ON public.signal_campaign_cases(campaign_id, board, port);
ALTER TABLE public.signal_campaign_cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signal_campaign_cases_provider_admin_all ON public.signal_campaign_cases;
CREATE POLICY signal_campaign_cases_provider_admin_all ON public.signal_campaign_cases FOR ALL TO authenticated
USING (provider_id = public.current_provider_id() AND public.has_role(auth.uid(),'admin'))
WITH CHECK (provider_id = public.current_provider_id() AND public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_campaign_cases TO authenticated;

ALTER TABLE public.signal_imports ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.signal_campaigns(id) ON DELETE SET NULL;
ALTER TABLE public.signal_cases ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.signal_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS signal_imports_campaign_idx ON public.signal_imports(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS signal_cases_campaign_idx ON public.signal_cases(campaign_id, status, severity);

CREATE TABLE IF NOT EXISTS public.signal_pon_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  import_id uuid NOT NULL REFERENCES public.signal_imports(id) ON DELETE CASCADE,
  city text NOT NULL,
  olt text,
  board text NOT NULL,
  port text NOT NULL,
  total_onus integer NOT NULL CHECK (total_onus >= 0),
  flagged_onus integer NOT NULL CHECK (flagged_onus >= 0),
  critical_onus integer NOT NULL DEFAULT 0 CHECK (critical_onus >= 0),
  flagged_percent numeric(6,2) NOT NULL DEFAULT 0,
  median_signal_1490 numeric(7,2),
  median_difference_db numeric(7,2),
  infra_suspect boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(import_id, board, port)
);
ALTER TABLE public.signal_pon_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS signal_pon_stats_provider_admin_all ON public.signal_pon_stats;
CREATE POLICY signal_pon_stats_provider_admin_all ON public.signal_pon_stats FOR ALL TO authenticated
USING (provider_id = public.current_provider_id() AND public.has_role(auth.uid(),'admin'))
WITH CHECK (provider_id = public.current_provider_id() AND public.has_role(auth.uid(),'admin'));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_pon_stats TO authenticated;
CREATE INDEX IF NOT EXISTS signal_pon_stats_provider_city_board_idx ON public.signal_pon_stats(provider_id, city, board, flagged_percent DESC);

CREATE OR REPLACE FUNCTION public.save_signal_pon_stats(_import_id uuid, _stats jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  _provider_id uuid := public.current_provider_id();
  _owner_id uuid := auth.uid();
  _import_provider uuid;
  _record jsonb;
BEGIN
  IF _owner_id IS NULL OR _provider_id IS NULL OR NOT public.has_role(_owner_id, 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores vinculados a provedor podem salvar estatísticas PON';
  END IF;

  SELECT provider_id INTO _import_provider FROM public.signal_imports WHERE id = _import_id;
  IF _import_provider IS DISTINCT FROM _provider_id THEN
    RAISE EXCEPTION 'Importação inválida para o provedor atual';
  END IF;

  DELETE FROM public.signal_pon_stats WHERE import_id = _import_id;
  FOR _record IN SELECT value FROM jsonb_array_elements(coalesce(_stats, '[]'::jsonb))
  LOOP
    INSERT INTO public.signal_pon_stats(
      provider_id, import_id, city, olt, board, port,
      total_onus, flagged_onus, critical_onus, flagged_percent,
      median_signal_1490, median_difference_db, infra_suspect
    ) VALUES (
      _provider_id, _import_id, _record->>'city', nullif(_record->>'olt',''),
      coalesce(nullif(_record->>'board',''), '—'), coalesce(nullif(_record->>'port',''), '—'),
      greatest(coalesce((_record->>'total_onus')::integer,0),0),
      greatest(coalesce((_record->>'flagged_onus')::integer,0),0),
      greatest(coalesce((_record->>'critical_onus')::integer,0),0),
      greatest(coalesce((_record->>'flagged_percent')::numeric,0),0),
      nullif(_record->>'median_signal_1490','')::numeric,
      nullif(_record->>'median_difference_db','')::numeric,
      coalesce((_record->>'infra_suspect')::boolean,false)
    )
    ON CONFLICT (import_id, board, port) DO UPDATE SET
      total_onus = EXCLUDED.total_onus,
      flagged_onus = EXCLUDED.flagged_onus,
      critical_onus = EXCLUDED.critical_onus,
      flagged_percent = EXCLUDED.flagged_percent,
      median_signal_1490 = EXCLUDED.median_signal_1490,
      median_difference_db = EXCLUDED.median_difference_db,
      infra_suspect = EXCLUDED.infra_suspect;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.save_signal_pon_stats(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_signal_pon_stats(uuid, jsonb) TO authenticated;
