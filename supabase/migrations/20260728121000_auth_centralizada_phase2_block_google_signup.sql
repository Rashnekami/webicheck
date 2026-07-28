-- =============================================================
-- Auth centralizada — FASE 2: bloquear Google criando conta nova
--
-- Antes desta migration, `handle_new_user()` rodava para QUALQUER
-- inserção em auth.users (inclusive um primeiro login Google de alguém
-- nunca cadastrado) e criava profile+role automaticamente. Isso é
-- exatamente o "auto-cadastro via Google" que o pedido de auth
-- centralizada proíbe.
--
-- A partir de agora:
-- - self-signup por e-mail/senha não existe mais na UI (aba "Cadastrar"
--   removida) — a única via de auth.users novo por e-mail/senha é
--   adminCreateUser (server function, service_role), que já insere
--   profiles/user_roles explicitamente. O trigger fica idempotente
--   (ON CONFLICT DO NOTHING) para nunca duplicar quando essa via é usada.
-- - Google só deve AUTENTICAR uma conta cujo e-mail já bate com um
--   auth.users existente e é vinculado automaticamente pelo próprio
--   Supabase Auth (mesmo user_id, nova identity) — isso NÃO passa por
--   este trigger, porque não há INSERT novo em auth.users.
--   IMPORTANTE (config fora de SQL): isso depende de "Automatic Linking"
--   estar habilitado no Supabase Auth (Dashboard > Authentication >
--   Providers > e-mails duplicados entre provedores). Sem isso ligado,
--   o Supabase pode recusar o login OAuth com e-mail duplicado em vez de
--   vincular — comportamento seguro (não cria conta), mas quem já tem
--   Google + login/senha só consegue usar Google depois desse toggle.
-- - Se o e-mail do Google NÃO bate com nenhum auth.users existente,
--   chega um INSERT novo aqui com provider='google' -> este trigger
--   agora BLOQUEIA (RAISE EXCEPTION), a transação inteira é revertida e
--   nenhum auth.users/profile é criado.
-- =============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _provider TEXT;
BEGIN
  _provider := NEW.raw_app_meta_data ->> 'provider';

  IF _provider = 'google' THEN
    RAISE EXCEPTION
      'google_signup_blocked: nenhuma conta existente vinculada a este e-mail Google. Peça a um administrador/supervisor para vincular seu acesso.'
      USING ERRCODE = '42501';
  END IF;

  -- Só sobra e-mail/senha aqui, e hoje isso só acontece via
  -- adminCreateUser (service_role). ON CONFLICT: idempotente caso a
  -- aplicação já tenha inserido o profile antes do trigger disparar.
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'tecnico')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$function$;
