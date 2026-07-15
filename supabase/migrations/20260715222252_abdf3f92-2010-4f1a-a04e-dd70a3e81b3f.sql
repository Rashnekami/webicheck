
-- Assinatura do técnico (data URL PNG)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS assinatura text;

-- Numeração pública dos checklists
ALTER TABLE public.checklists ADD COLUMN IF NOT EXISTS numero_publico text UNIQUE;

CREATE SEQUENCE IF NOT EXISTS public.checklist_numero_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.checklist_numero_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_checklist_finalization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finalizado' AND (OLD.status IS DISTINCT FROM 'finalizado') THEN
    NEW.finalizado_em := now();
    IF NEW.codigo_validacao IS NULL THEN
      NEW.codigo_validacao := 'WBF-' ||
        to_char(now(), 'YYYYMMDD') || '-' ||
        upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;
    IF NEW.numero_publico IS NULL THEN
      NEW.numero_publico := 'WEBICHECK' || to_char(now(), 'YYYY') ||
        lpad(nextval('public.checklist_numero_seq')::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
