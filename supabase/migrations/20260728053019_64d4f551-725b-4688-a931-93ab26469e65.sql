
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS rmap_code text;

CREATE UNIQUE INDEX IF NOT EXISTS checklists_rmap_code_unique
  ON public.checklists (provider_id, rmap_code)
  WHERE rmap_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_rmap_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year integer;
  _cto text;
  _base text;
  _existing integer;
  _code text;
BEGIN
  IF NEW.tipo::text <> 'remapeamento_cto' THEN RETURN NEW; END IF;
  IF NEW.status::text <> 'finalizado' THEN RETURN NEW; END IF;
  IF NEW.rmap_code IS NOT NULL THEN RETURN NEW; END IF;

  _cto := upper(regexp_replace(
    coalesce(NULLIF(btrim(NEW.dados #>> '{identificacao,cto_codigo}'), ''), 'SEM-CTO'),
    '[^A-Za-z0-9]+', '', 'g'
  ));
  _year := extract(year from coalesce(NEW.finalizado_em, now()))::integer;
  _base := 'RMAP-' || _year::text || '-' || _cto;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.provider_id::text || ':' || _base, 3777));

  SELECT count(*) INTO _existing
    FROM public.checklists
   WHERE provider_id = NEW.provider_id
     AND rmap_code LIKE _base || '%';

  IF _existing = 0 THEN
    _code := _base;
  ELSE
    _code := _base || '-' || lpad((_existing + 1)::text, 3, '0');
  END IF;

  NEW.rmap_code := _code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_rmap_code ON public.checklists;
CREATE TRIGGER trg_assign_rmap_code
  BEFORE INSERT OR UPDATE ON public.checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_rmap_code();

-- Backfill de códigos para finalizados sem rmap_code
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.checklists
     WHERE tipo::text = 'remapeamento_cto'
       AND status::text = 'finalizado'
       AND rmap_code IS NULL
     ORDER BY finalizado_em NULLS LAST
  LOOP
    UPDATE public.checklists SET updated_at = updated_at WHERE id = r.id;
  END LOOP;
END $$;
