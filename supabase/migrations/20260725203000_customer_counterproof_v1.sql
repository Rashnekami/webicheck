-- Contra-Prova Digital do Cliente — V1
-- Estrutura aditiva: preserva checklists, revisões e documentos existentes.

CREATE SEQUENCE IF NOT EXISTS public.customer_counterproof_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.customer_counterproofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL,
  tecnico_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE,
  public_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','opened','validated','annulled')),
  checklist_code text NOT NULL,
  client_name text,
  service_order text,
  client_phone_e164 text,
  first_opened_at timestamptz,
  validated_at timestamptz,
  validated_ip text,
  validated_user_agent text,
  identity_storage_path text,
  identity_sha256 text,
  signature_data_url text,
  terms_version text,
  annulled_at timestamptz,
  annulled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  annulment_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_counterproof_one_active_per_checklist
  ON public.customer_counterproofs(checklist_id)
  WHERE status IN ('pending','opened','validated');
CREATE INDEX IF NOT EXISTS idx_counterproof_checklist ON public.customer_counterproofs(checklist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_counterproof_case ON public.customer_counterproofs(case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_counterproof_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  counterproof_id uuid NOT NULL REFERENCES public.customer_counterproofs(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('created','phone_registered','whatsapp_opened','opened','evidence_uploaded','validated','annulled')),
  actor_type text NOT NULL CHECK (actor_type IN ('technician','client','admin','system')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_counterproof_events_counterproof ON public.customer_counterproof_events(counterproof_id, created_at);

CREATE OR REPLACE FUNCTION public.set_customer_counterproof_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'CP' || to_char(now(), 'YYYY') || lpad(nextval('public.customer_counterproof_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_customer_counterproof_code ON public.customer_counterproofs;
CREATE TRIGGER trg_customer_counterproof_code BEFORE INSERT ON public.customer_counterproofs
FOR EACH ROW EXECUTE FUNCTION public.set_customer_counterproof_code();

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
      OR NEW.validated_at IS DISTINCT FROM OLD.validated_at THEN
      RAISE EXCEPTION 'counterproof_immutable';
    END IF;
  ELSIF OLD.status = 'annulled' THEN
    RAISE EXCEPTION 'counterproof_immutable';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_customer_counterproof_immutable ON public.customer_counterproofs;
CREATE TRIGGER trg_customer_counterproof_immutable BEFORE UPDATE ON public.customer_counterproofs
FOR EACH ROW EXECUTE FUNCTION public.protect_customer_counterproof();

ALTER TABLE public.customer_counterproofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_counterproof_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.customer_counterproofs, public.customer_counterproof_events TO authenticated;
GRANT ALL ON public.customer_counterproofs, public.customer_counterproof_events TO service_role;

CREATE POLICY counterproof_read_owner_or_admin ON public.customer_counterproofs FOR SELECT TO authenticated
USING (tecnico_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY counterproof_events_read_owner_or_admin ON public.customer_counterproof_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.customer_counterproofs c WHERE c.id = counterproof_id AND (c.tecnico_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

INSERT INTO storage.buckets (id, name, public)
VALUES ('customer-counterproof-evidence', 'customer-counterproof-evidence', false)
ON CONFLICT (id) DO NOTHING;
