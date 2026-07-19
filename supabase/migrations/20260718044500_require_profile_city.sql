-- Cidade obrigatória na experiência do usuário.
-- A coluna permanece anulável para que contas antigas possam entrar apenas na
-- tela de conclusão e informar a cidade sem intervenção administrativa.

UPDATE public.profiles
SET city = NULL
WHERE city IS NOT NULL AND btrim(city) = '';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_city_valid;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_city_valid
  CHECK (city IS NULL OR char_length(btrim(city)) BETWEEN 2 AND 120);

-- Novas contas por e-mail já recebem a cidade escolhida no cadastro. Contas
-- criadas por OAuth sem esse metadado serão direcionadas ao onboarding.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name, city)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'city', '')), '')
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
