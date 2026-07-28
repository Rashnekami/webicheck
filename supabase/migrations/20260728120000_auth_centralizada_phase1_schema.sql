-- =============================================================
-- Auth centralizada — FASE 1: schema aditivo
--
-- Nenhuma tabela/policy existente é alterada de forma destrutiva.
-- Nenhum usuário Google existente perde acesso, muda de user_id ou é
-- duplicado por esta migration: ela só adiciona colunas/estruturas.
-- =============================================================

-- Novo papel 'supervisor' (só pode ser adicionado fora de bloco que já
-- usa o valor na mesma transação — migration isolada, ok em PG12+).
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';

-- Login curto (ex.: TEC01) usado no formulário de login local, e o
-- e-mail sintético correspondente (ex.: tec01@<provider-slug>.internal)
-- que vira o `auth.users.email` real por baixo do Supabase Auth.
-- Ambos NULLABLE: contas 100% Google continuam sem nenhum dos dois até
-- um admin gerar as credenciais (Fase 2 / backfill).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login TEXT,
  ADD COLUMN IF NOT EXISTS auth_email TEXT,
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS credentials_created_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS credentials_created_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_unique
  ON public.profiles (lower(login))
  WHERE login IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_email_unique
  ON public.profiles (lower(auth_email))
  WHERE auth_email IS NOT NULL;

-- Gera o próximo login sequencial disponível para um provider
-- (TEC01, TEC02, ...). SECURITY DEFINER porque a leitura precisa
-- enxergar todos os profiles do provider para não colidir, mesmo
-- chamada por um client sujeito a RLS mais restritiva no futuro.
CREATE OR REPLACE FUNCTION public.generate_next_login(_provider_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prefix TEXT := 'TEC';
  _next INT;
  _candidate TEXT;
BEGIN
  SELECT COALESCE(MAX(substring(login FROM '^TEC(\d+)$')::INT), 0) + 1
    INTO _next
    FROM public.profiles
   WHERE (_provider_id IS NULL AND provider_id IS NULL)
      OR (_provider_id IS NOT NULL AND provider_id = _provider_id)
   AND login ~ '^TEC\d+$';

  IF _next IS NULL THEN
    _next := 1;
  END IF;

  _candidate := _prefix || lpad(_next::text, 2, '0');

  -- Sanidade extra contra corrida rara: se já existir, incrementa até achar livre.
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE lower(login) = lower(_candidate)) LOOP
    _next := _next + 1;
    _candidate := _prefix || lpad(_next::text, 2, '0');
  END LOOP;

  RETURN _candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_login(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_login(UUID) TO service_role;

COMMENT ON COLUMN public.profiles.login IS
  'Login curto (TEC01...) usado na tela local de login. NULL até um admin/supervisor gerar credenciais.';
COMMENT ON COLUMN public.profiles.auth_email IS
  'E-mail sintético (login@<provider-slug>.internal) usado como auth.users.email para permitir signInWithPassword com login curto. Nunca é o e-mail de contato real (esse continua em profiles.email).';
COMMENT ON COLUMN public.profiles.must_change_password IS
  'true logo após a criação/reset de credenciais por um admin: bloqueia o uso do sistema até a troca de senha no primeiro acesso.';
