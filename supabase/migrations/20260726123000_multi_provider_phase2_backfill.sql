-- =============================================================
-- Multi-provider — FASE 2: backfill
-- 100% dos dados existentes passam a pertencer à Webifibra.
-- profiles.provider_id fica NULL apenas para o dono/admin global já
-- promovido explicitamente na migration 20260715230000
-- (user_id = 8c9020e6-62e8-4e70-bced-d4d2af64b009, e-mail
-- renan.rash@gmail.com / reenan.rash@gmail.com). UUID não inventado:
-- é o mesmo já usado naquela migration. Qualquer OUTRO usuário com
-- role='admin' recebe provider_id = Webifibra normalmente.
-- Idempotente: só toca linhas com provider_id IS NULL.
-- =============================================================

DO $$
DECLARE
  _webifibra_id uuid;
  _owner_user_id uuid := '8c9020e6-62e8-4e70-bced-d4d2af64b009';
BEGIN
  SELECT id INTO _webifibra_id FROM public.providers WHERE slug = 'webifibra';
  IF _webifibra_id IS NULL THEN
    RAISE EXCEPTION 'provider webifibra não encontrado — aplique a migration da Fase 1 antes desta.';
  END IF;

  -- Tabelas operacionais: todo registro existente é Webifibra.
  UPDATE public.checklists SET provider_id = _webifibra_id WHERE provider_id IS NULL;
  UPDATE public.checklist_fotos SET provider_id = _webifibra_id WHERE provider_id IS NULL;
  UPDATE public.checklist_diagnostic_reports SET provider_id = _webifibra_id WHERE provider_id IS NULL;
  UPDATE public.checklist_document_snapshots SET provider_id = _webifibra_id WHERE provider_id IS NULL;
  UPDATE public.checklist_public_access_logs SET provider_id = _webifibra_id WHERE provider_id IS NULL;
  UPDATE public.webi_integration_tokens SET provider_id = _webifibra_id WHERE provider_id IS NULL;

  -- profiles: Webifibra para todos, EXCETO o dono/admin global (_owner_user_id).
  -- Outros admins (se existirem) recebem Webifibra normalmente, sem ficar globais.
  UPDATE public.profiles p
     SET provider_id = _webifibra_id
   WHERE p.provider_id IS NULL
     AND p.id <> _owner_user_id;
END $$;
