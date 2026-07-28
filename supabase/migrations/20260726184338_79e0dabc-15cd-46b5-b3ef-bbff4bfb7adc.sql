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