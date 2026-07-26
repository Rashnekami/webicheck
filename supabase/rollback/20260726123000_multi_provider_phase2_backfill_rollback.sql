-- =============================================================
-- ROLLBACK da Fase 2 (multi-provider — backfill)
--
-- Fica FORA de supabase/migrations/ de propósito — mesmo motivo do
-- rollback da Fase 1: nunca deve ser aplicado automaticamente por um
-- `supabase db push`, só copiado para migrations/ manualmente quando
-- alguém decidir reverter.
--
-- Efeito: devolve provider_id para NULL em toda linha que a Fase 2
-- preencheu com o id da Webifibra — nas tabelas operacionais e em
-- profiles (inclusive as que tinham sido setadas para Webifibra, exceto
-- o dono/admin global, que já estava NULL e permanece NULL).
--
-- Pressuposto: nenhuma escrita legítima de provider_id ocorreu desde a
-- Fase 2 (verdade hoje, pois as Fases 3+ — subdomínio/login/RLS — ainda
-- não foram implementadas). Se este rollback for aplicado depois de
-- qualquer fase seguinte já estar em produção, revise antes: ele reverte
-- TODA linha com provider_id = Webifibra, incluindo dados legítimos
-- criados depois do backfill.
-- =============================================================

DO $$
DECLARE
  _webifibra_id uuid;
BEGIN
  SELECT id INTO _webifibra_id FROM public.providers WHERE slug = 'webifibra';
  IF _webifibra_id IS NULL THEN
    RAISE NOTICE 'provider webifibra não encontrado — nada a reverter.';
    RETURN;
  END IF;

  UPDATE public.checklists SET provider_id = NULL WHERE provider_id = _webifibra_id;
  UPDATE public.checklist_fotos SET provider_id = NULL WHERE provider_id = _webifibra_id;
  UPDATE public.checklist_diagnostic_reports SET provider_id = NULL WHERE provider_id = _webifibra_id;
  UPDATE public.checklist_document_snapshots SET provider_id = NULL WHERE provider_id = _webifibra_id;
  UPDATE public.checklist_public_access_logs SET provider_id = NULL WHERE provider_id = _webifibra_id;
  UPDATE public.webi_integration_tokens SET provider_id = NULL WHERE provider_id = _webifibra_id;
  UPDATE public.profiles SET provider_id = NULL WHERE provider_id = _webifibra_id;
END $$;
