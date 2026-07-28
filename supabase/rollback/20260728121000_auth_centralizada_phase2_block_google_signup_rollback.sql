-- =============================================================
-- ROLLBACK da Fase 2 (auth centralizada — bloquear Google criando conta)
-- Restaura o handle_new_user() anterior (sem bloqueio de provider).
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );

  IF LOWER(NEW.email) IN ('reenan.rash@gmail.com', 'renan.rash@gmail.com') THEN
    _role := 'admin';
  ELSE
    _role := 'tecnico';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$function$;
