CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
  _provider_id uuid;
  _is_owner boolean;
BEGIN
  SELECT id INTO _provider_id FROM public.providers WHERE slug = 'webifibra';
  _is_owner := lower(COALESCE(NEW.email, '')) IN (
    'reenan.rash@gmail.com',
    'renan.rash@gmail.com',
    'renanparkofthedeath@gmail.com'
  );
  INSERT INTO public.profiles (id, email, full_name, city, provider_id, platform_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'city', '')), ''),
    _provider_id,
    _is_owner
  ) ON CONFLICT (id) DO NOTHING;
  IF _is_owner THEN _role := 'admin'; ELSE _role := 'tecnico'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

INSERT INTO public.user_cities (user_id, city)
SELECT p.id, t2.city_label
FROM public.profiles p
JOIN public.city_territories t1 ON t1.city_key = public.norm_city(p.city)
JOIN public.city_territories t2 ON t2.territory_code = t1.territory_code
WHERE p.city IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.user_cities uc WHERE uc.user_id = p.id)
ON CONFLICT DO NOTHING;

UPDATE public.profiles p
   SET cities_configured_at = now()
 WHERE p.cities_configured_at IS NULL
   AND EXISTS (SELECT 1 FROM public.user_cities uc WHERE uc.user_id = p.id);

CREATE OR REPLACE FUNCTION public.enforce_checklist_city_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.tecnico_id THEN RETURN NEW; END IF;
  IF NEW.cidade IS NULL OR btrim(NEW.cidade) = '' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.city_territories WHERE city_key = public.norm_city(NEW.cidade)) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_cities uc WHERE uc.user_id = auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF public.user_can_access_city(auth.uid(), NEW.cidade) THEN RETURN NEW; END IF;
  IF public.has_city_exception(auth.uid(), NEW.cidade, NEW.os) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'city_outside_territory' USING ERRCODE = '42501';
END;
$function$;