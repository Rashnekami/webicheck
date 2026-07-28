-- Auth hardening v2 — aditivo, sem remover Google nem mudar user_id.
--
-- 1) must_change_password: credencial interna (login/senha) recém-criada
--    ou resetada obriga o técnico a trocar a senha no primeiro acesso.
--    Não afeta quem já tem senha: só passa a ser exigido a partir de
--    criações/resets feitos DEPOIS desta migration.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

-- 2) Geração automática de login (TEC01, TEC02...) por provedor, pra não
--    depender mais do admin digitar o login à mão. Único por provedor
--    (mesmo espaço de nomes de provider_login_accounts.login).
CREATE OR REPLACE FUNCTION public.generate_next_technician_login(_provider_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _next int;
  _candidate text;
BEGIN
  SELECT COALESCE(MAX(substring(login FROM '^tec(\d+)$')::int), 0) + 1
    INTO _next
    FROM public.provider_login_accounts
   WHERE provider_id = _provider_id
     AND login ~ '^tec\d+$';

  _candidate := 'tec' || lpad(_next::text, 2, '0');

  WHILE EXISTS (
    SELECT 1 FROM public.provider_login_accounts
     WHERE provider_id = _provider_id AND lower(login) = _candidate
  ) LOOP
    _next := _next + 1;
    _candidate := 'tec' || lpad(_next::text, 2, '0');
  END LOOP;

  RETURN _candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_technician_login(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_technician_login(uuid) TO authenticated, service_role;

-- 3) Google nunca cria conta nova. Antes, handle_new_user() rodava para
--    QUALQUER inserção em auth.users, inclusive um primeiro login Google
--    de um e-mail nunca visto — criando profile+role automaticamente
--    (e jogando a pessoa no provedor 'webifibra' como técnico). A partir
--    de agora:
--    - self-signup por e-mail/senha continua funcionando exatamente
--      igual (a UI que o expõe é removida à parte, mas o trigger
--      continua aceitando o provider 'email' — quem cria conta via
--      admin.createUser, como createTechnicianCredential, também usa
--      esse caminho e continua funcionando sem mudança).
--    - Google (`raw_app_meta_data->>'provider' = 'google'`) SEM conta
--      auth.users pré-existente com o mesmo e-mail é BLOQUEADO
--      (RAISE EXCEPTION), revertendo a transação inteira — nenhum
--      auth.users/profile novo é criado.
--    - Quem JÁ usa Google hoje não é afetado: o auth.users dessa pessoa
--      já existe, então este trigger nem dispara de novo no login dela.
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
  _auth_provider text;
BEGIN
  _auth_provider := NEW.raw_app_meta_data ->> 'provider';

  IF _auth_provider = 'google' THEN
    RAISE EXCEPTION
      'google_signup_blocked: nenhuma conta existente vinculada a este e-mail Google. Peça a um administrador/supervisor para vincular seu acesso.'
      USING ERRCODE = '42501';
  END IF;

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
