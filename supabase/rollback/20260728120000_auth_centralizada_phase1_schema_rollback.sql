-- =============================================================
-- ROLLBACK da Fase 1 (auth centralizada — schema aditivo)
--
-- Fica FORA de supabase/migrations/ de propósito (mesma convenção do
-- rollback multi-provider). Só copiar para migrations/ com timestamp
-- novo se for preciso reverter de fato.
--
-- Não reverte 'supervisor' do enum app_role: Postgres não permite
-- remover um valor de enum sem recriar o tipo inteiro. Se algum
-- profile já tiver essa role atribuída, resolva isso manualmente
-- antes de tentar recriar o enum.
-- =============================================================

DROP FUNCTION IF EXISTS public.generate_next_login(UUID);

DROP INDEX IF EXISTS public.profiles_login_unique;
DROP INDEX IF EXISTS public.profiles_auth_email_unique;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS login,
  DROP COLUMN IF EXISTS auth_email,
  DROP COLUMN IF EXISTS must_change_password,
  DROP COLUMN IF EXISTS credentials_created_by,
  DROP COLUMN IF EXISTS credentials_created_at;
