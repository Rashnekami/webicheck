-- =============================================================
-- Multi-provider — correção de policy: restringe leitura de `providers`
--
-- Aditiva: não altera 20260726120000/20260726123000, só substitui a
-- policy de SELECT criada na Fase 1 (que liberava toda a tabela para
-- qualquer autenticado). Nenhuma outra tabela/coluna é tocada.
-- Ainda não implementa subdomínio (Fase 4) nem RLS por provider nas
-- tabelas operacionais (Fase 5).
--
-- Regra: só enxerga todas as linhas quem for admin global de verdade
-- (profiles.provider_id IS NULL E has_role(auth.uid(),'admin')). Um
-- profile com provider_id NULL mas sem role='admin' NÃO recebe
-- privilégio global. Qualquer outro usuário só vê a linha do próprio
-- provider_id.
-- =============================================================

DROP POLICY IF EXISTS "providers_select_authenticated" ON public.providers;

CREATE POLICY "providers_select_own_or_global_admin"
  ON public.providers FOR SELECT
  TO authenticated
  USING (
    (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.provider_id IS NULL
      )
      AND public.has_role(auth.uid(), 'admin')
    )
    OR
    id = (SELECT p.provider_id FROM public.profiles p WHERE p.id = auth.uid())
  );
