CREATE OR REPLACE FUNCTION public.set_checklist_finalization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _public_prefix text;
  _validation_prefix text;
  _n bigint;
BEGIN
  IF NEW.status = 'finalizado' AND (OLD.status IS DISTINCT FROM 'finalizado') THEN
    NEW.finalizado_em := now();

    SELECT p.public_code_prefix, p.validation_code_prefix
      INTO _public_prefix, _validation_prefix
      FROM public.providers p
     WHERE p.id = NEW.provider_id;
    _public_prefix     := COALESCE(_public_prefix, 'WEBICHECK');
    _validation_prefix := COALESCE(_validation_prefix, 'WBF');

    IF NEW.codigo_validacao IS NULL THEN
      NEW.codigo_validacao := _validation_prefix || '-' ||
        to_char(now(), 'YYYYMMDD') || '-' ||
        upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;

    IF NEW.numero_publico IS NULL THEN
      IF NEW.provider_id IS NULL THEN
        _n := nextval('public.checklist_numero_seq');
      ELSE
        INSERT INTO public.provider_checklist_counters (provider_id, last_number)
        VALUES (NEW.provider_id, 1)
        ON CONFLICT (provider_id) DO UPDATE
          SET last_number = public.provider_checklist_counters.last_number + 1,
              updated_at  = now()
        RETURNING last_number INTO _n;
      END IF;

      NEW.numero_publico := _public_prefix || to_char(now(), 'YYYY') || lpad(_n::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;