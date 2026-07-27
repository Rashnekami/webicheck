-- =============================================================
-- ROLLBACK da Fase 1 (multi-provider — schema aditivo)
--
-- Fica FORA de supabase/migrations/ de propósito: um `supabase db push`
-- normal só aplica o que está em migrations/, então este arquivo nunca
-- roda sozinho. Só deve ser copiado para migrations/ (com timestamp
-- novo, maior que o último aplicado) no momento em que alguém decidir
-- de fato reverter a Fase 1.
--
-- Efeito: remove por completo o que a Fase 1 criou — índices, colunas
-- provider_id (e os dados nelas, via DROP COLUMN), trigger, policy e a
-- tabela providers. Funciona mesmo que o rollback da Fase 2 não tenha
-- sido aplicado antes (DROP COLUMN já leva os dados junto).
-- =============================================================

DROP INDEX IF EXISTS public.idx_profiles_provider;
DROP INDEX IF EXISTS public.idx_checklists_provider;
DROP INDEX IF EXISTS public.idx_fotos_provider;
DROP INDEX IF EXISTS public.idx_diag_provider;
DROP INDEX IF EXISTS public.idx_snapshots_provider;
DROP INDEX IF EXISTS public.idx_access_logs_provider;
DROP INDEX IF EXISTS public.idx_wit_provider;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.checklists DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.checklist_fotos DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.checklist_diagnostic_reports DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.checklist_document_snapshots DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.checklist_public_access_logs DROP COLUMN IF EXISTS provider_id;
ALTER TABLE public.webi_integration_tokens DROP COLUMN IF EXISTS provider_id;

DROP TRIGGER IF EXISTS trg_providers_updated_at ON public.providers;
DROP POLICY IF EXISTS "providers_select_authenticated" ON public.providers;
DROP TABLE IF EXISTS public.providers;
