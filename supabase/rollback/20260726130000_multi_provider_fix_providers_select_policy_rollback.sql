-- =============================================================
-- ROLLBACK — reverte a policy de SELECT de `providers` para a versão
-- original da Fase 1 (aberta a qualquer autenticado).
--
-- Fica FORA de supabase/migrations/ de propósito: só deve ser copiado
-- para migrations/ (com timestamp novo) se alguém decidir reverter
-- manualmente esta correção.
-- =============================================================

DROP POLICY IF EXISTS "providers_select_own_or_global_admin" ON public.providers;

CREATE POLICY "providers_select_authenticated"
  ON public.providers FOR SELECT
  TO authenticated
  USING (true);
