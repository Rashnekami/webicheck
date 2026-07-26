ALTER TABLE public.customer_counterproofs
  ADD COLUMN IF NOT EXISTS client_checklist_version text,
  ADD COLUMN IF NOT EXISTS client_checklist jsonb;

COMMENT ON COLUMN public.customer_counterproofs.client_checklist_version
  IS 'Versão do questionário respondido pelo cliente.';
COMMENT ON COLUMN public.customer_counterproofs.client_checklist
  IS 'Snapshot imutável das perguntas e respostas Sim/Não do cliente.';

CREATE OR REPLACE FUNCTION public.protect_customer_counterproof()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.status = 'validated' THEN
    IF NEW.status <> 'annulled'
      OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.provider_id IS DISTINCT FROM OLD.provider_id
      OR NEW.checklist_id IS DISTINCT FROM OLD.checklist_id
      OR NEW.case_id IS DISTINCT FROM OLD.case_id
      OR NEW.tecnico_id IS DISTINCT FROM OLD.tecnico_id
      OR NEW.code IS DISTINCT FROM OLD.code
      OR NEW.public_token IS DISTINCT FROM OLD.public_token
      OR NEW.client_phone_e164 IS DISTINCT FROM OLD.client_phone_e164
      OR NEW.identity_storage_path IS DISTINCT FROM OLD.identity_storage_path
      OR NEW.identity_sha256 IS DISTINCT FROM OLD.identity_sha256
      OR NEW.signature_data_url IS DISTINCT FROM OLD.signature_data_url
      OR NEW.client_checklist_version IS DISTINCT FROM OLD.client_checklist_version
      OR NEW.client_checklist IS DISTINCT FROM OLD.client_checklist
      OR NEW.validated_at IS DISTINCT FROM OLD.validated_at THEN
      RAISE EXCEPTION 'counterproof_immutable';
    END IF;
  ELSIF OLD.status = 'annulled' THEN
    RAISE EXCEPTION 'counterproof_immutable';
  END IF;
  RETURN NEW;
END;
$$;