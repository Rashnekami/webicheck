-- 1) Novos tipos de checklist (incremental, não destrutivo)
ALTER TYPE public.checklist_tipo ADD VALUE IF NOT EXISTS 'rompimento';
ALTER TYPE public.checklist_tipo ADD VALUE IF NOT EXISTS 'readequacao';
ALTER TYPE public.checklist_tipo ADD VALUE IF NOT EXISTS 'melhoria_sinal';

-- 2) Código da intervenção
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS intervention_code text;
CREATE INDEX IF NOT EXISTS checklists_intervention_code_idx ON public.checklists (provider_id, intervention_code);

-- 3) Contadores por provedor + tipo + ano
CREATE TABLE IF NOT EXISTS public.intervention_code_counters (
  provider_id uuid NOT NULL,
  tipo text NOT NULL,
  code_year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, tipo, code_year)
);
GRANT ALL ON public.intervention_code_counters TO service_role;
ALTER TABLE public.intervention_code_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counters_service_only" ON public.intervention_code_counters
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Trigger de numeração
CREATE OR REPLACE FUNCTION public.assign_intervention_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _prefix text;
  _year integer;
  _next integer;
BEGIN
  IF NEW.status::text <> 'finalizado' THEN RETURN NEW; END IF;
  IF NEW.intervention_code IS NOT NULL THEN RETURN NEW; END IF;

  _prefix := CASE NEW.tipo::text
    WHEN 'rompimento' THEN 'RPT'
    WHEN 'readequacao' THEN 'RDEA'
    WHEN 'melhoria_sinal' THEN 'MSIG'
    ELSE NULL
  END;
  IF _prefix IS NULL THEN RETURN NEW; END IF;

  _year := extract(year from coalesce(NEW.finalizado_em, now()))::integer;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.provider_id::text || ':' || _prefix || ':' || _year::text, 4211)
  );

  INSERT INTO public.intervention_code_counters(provider_id, tipo, code_year, last_value)
  VALUES (NEW.provider_id, NEW.tipo::text, _year, 1)
  ON CONFLICT (provider_id, tipo, code_year)
  DO UPDATE SET last_value = public.intervention_code_counters.last_value + 1
  RETURNING last_value INTO _next;

  NEW.intervention_code := _prefix || '-' || _year::text || '-' || lpad(_next::text, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_intervention_code ON public.checklists;
CREATE TRIGGER trg_assign_intervention_code
  BEFORE INSERT OR UPDATE ON public.checklists
  FOR EACH ROW EXECUTE FUNCTION public.assign_intervention_code();
