
-- Fase 3: atomicidade dos snapshots + unicidade de diagnósticos por sessão.

-- 1) Unicidade estrita: um único snapshot por (checklist_id, version).
--    Impede colisões de version em regenerações concorrentes.
ALTER TABLE public.checklist_document_snapshots
  ADD CONSTRAINT uq_snapshots_checklist_version UNIQUE (checklist_id, version);

-- 2) Unicidade de diagnóstico por sessão dentro do mesmo atendimento (case_id).
--    Aplica no banco a duplicidade que a rota já verificava em código.
ALTER TABLE public.checklist_diagnostic_reports
  ADD CONSTRAINT uq_diagnostic_case_session UNIQUE (case_id, diagnostic_session_id);

-- 3) RPC atômica para criar uma nova versão de snapshot:
--    - Trava lógica por checklist_id (advisory xact lock);
--    - Marca versão ativa anterior como 'replaced' e vincula replaced_by_snapshot_id;
--    - Insere a nova versão como 'active' com version = MAX(version)+1;
--    - Tudo em uma única transação.
CREATE OR REPLACE FUNCTION public.create_snapshot_version(
  _checklist_id uuid,
  _snapshot_data jsonb,
  _document_hash text,
  _public_token text,
  _finalized_at timestamptz,
  _created_by uuid
)
RETURNS TABLE (id uuid, version int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev_id uuid;
  _prev_version int;
  _next_version int;
  _new_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_checklist_id::text, 42));

  SELECT s.id, s.version
    INTO _prev_id, _prev_version
    FROM public.checklist_document_snapshots s
   WHERE s.checklist_id = _checklist_id
   ORDER BY s.version DESC
   LIMIT 1;

  _next_version := COALESCE(_prev_version, 0) + 1;

  IF _prev_id IS NOT NULL THEN
    UPDATE public.checklist_document_snapshots
       SET public_status = 'replaced'
     WHERE id = _prev_id
       AND public_status = 'active';
  END IF;

  INSERT INTO public.checklist_document_snapshots (
    checklist_id, version, public_token, public_status,
    snapshot_data, document_hash, finalized_at, created_by
  ) VALUES (
    _checklist_id, _next_version, _public_token, 'active',
    _snapshot_data, _document_hash, _finalized_at, _created_by
  )
  RETURNING checklist_document_snapshots.id INTO _new_id;

  IF _prev_id IS NOT NULL THEN
    UPDATE public.checklist_document_snapshots
       SET replaced_by_snapshot_id = _new_id
     WHERE id = _prev_id;
  END IF;

  id := _new_id;
  version := _next_version;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_snapshot_version(uuid, jsonb, text, text, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_snapshot_version(uuid, jsonb, text, text, timestamptz, uuid) TO service_role;
