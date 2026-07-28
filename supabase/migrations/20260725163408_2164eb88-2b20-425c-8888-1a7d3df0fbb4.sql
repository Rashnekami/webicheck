-- Rastreabilidade patrimonial das ONTs retiradas em campo.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'almoxarifado';

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS exchange_ticket_code text;

CREATE TABLE IF NOT EXISTS public.ont_exchange_ticket_counters (
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  ticket_year integer NOT NULL CHECK (ticket_year BETWEEN 2020 AND 2200),
  last_value integer NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  PRIMARY KEY (provider_id, ticket_year)
);

CREATE TABLE IF NOT EXISTS public.ont_exchange_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  case_id uuid NOT NULL,
  checklist_id uuid REFERENCES public.checklists(id) ON DELETE SET NULL,
  ticket_code text NOT NULL,
  revision_number integer NOT NULL DEFAULT 1,
  service_order text,
  client_name text,
  city text,
  technician_id uuid,
  technician_name text,
  removed_model text,
  removed_serial text,
  installed_model text,
  installed_serial text,
  reason text NOT NULL DEFAULT 'Não informado',
  exchanged_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, case_id),
  UNIQUE (provider_id, ticket_code)
);

CREATE INDEX IF NOT EXISTS idx_ont_exchange_tickets_provider_date
  ON public.ont_exchange_tickets(provider_id, exchanged_at DESC);
CREATE INDEX IF NOT EXISTS idx_ont_exchange_tickets_removed_serial
  ON public.ont_exchange_tickets(provider_id, removed_serial);

ALTER TABLE public.ont_exchange_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Provider warehouse can read ONT exchanges"
  ON public.ont_exchange_tickets;
CREATE POLICY "Provider warehouse can read ONT exchanges"
ON public.ont_exchange_tickets
FOR SELECT TO authenticated
USING (
  provider_id = public.current_provider_id()
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text IN ('admin', 'almoxarifado')
  )
);

REVOKE ALL ON public.ont_exchange_ticket_counters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.ont_exchange_tickets FROM PUBLIC, anon;
GRANT SELECT ON public.ont_exchange_tickets TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_ont_exchange_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year integer;
  _next integer;
  _code text;
  _reason text;
  _technician_name text;
  _existing public.ont_exchange_tickets;
BEGIN
  IF NEW.status::text <> 'finalizado'
     OR NEW.troca_realizada IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  -- Serializa duas finalizações simultâneas do mesmo atendimento.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.provider_id::text || ':' || NEW.case_id::text, 2026)
  );

  SELECT * INTO _existing
  FROM public.ont_exchange_tickets
  WHERE provider_id = NEW.provider_id AND case_id = NEW.case_id
  FOR UPDATE;

  _reason := COALESCE(
    NULLIF(btrim(NEW.dados #>> '{resultado_final,motivo}'), ''),
    NULLIF(btrim(NEW.dados ->> 'relato'), ''),
    'Não informado'
  );
  SELECT NULLIF(btrim(full_name), '') INTO _technician_name
  FROM public.profiles WHERE id = NEW.tecnico_id;

  IF _existing.id IS NOT NULL THEN
    _code := _existing.ticket_code;
    UPDATE public.ont_exchange_tickets SET
      checklist_id = NEW.id,
      revision_number = NEW.revision_number,
      service_order = NEW.os,
      client_name = NEW.cliente,
      city = NEW.cidade,
      technician_id = NEW.tecnico_id,
      technician_name = _technician_name,
      removed_model = COALESCE(NEW.modelo_ont_retirada, NEW.modelo),
      removed_serial = COALESCE(NEW.serial_ont_retirada, NEW.serial),
      installed_model = NEW.modelo_ont_instalada,
      installed_serial = NEW.serial_ont_instalada,
      reason = _reason,
      updated_at = now()
    WHERE id = _existing.id;
  ELSE
    _year := EXTRACT(YEAR FROM COALESCE(NEW.finalizado_em, now()))::integer;
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.provider_id::text || ':' || _year::text, 2026)
    );
    INSERT INTO public.ont_exchange_ticket_counters(provider_id, ticket_year, last_value)
    VALUES (NEW.provider_id, _year, 1)
    ON CONFLICT (provider_id, ticket_year)
    DO UPDATE SET last_value = public.ont_exchange_ticket_counters.last_value + 1
    RETURNING last_value INTO _next;

    _code := 'T' || _year::text || lpad(_next::text, 2, '0');
    INSERT INTO public.ont_exchange_tickets (
      provider_id, case_id, checklist_id, ticket_code, revision_number,
      service_order, client_name, city, technician_id, technician_name,
      removed_model, removed_serial, installed_model, installed_serial,
      reason, exchanged_at
    ) VALUES (
      NEW.provider_id, NEW.case_id, NEW.id, _code, NEW.revision_number,
      NEW.os, NEW.cliente, NEW.cidade, NEW.tecnico_id, _technician_name,
      COALESCE(NEW.modelo_ont_retirada, NEW.modelo),
      COALESCE(NEW.serial_ont_retirada, NEW.serial),
      NEW.modelo_ont_instalada, NEW.serial_ont_instalada,
      _reason, COALESCE(NEW.finalizado_em, now())
    );
  END IF;

  NEW.exchange_ticket_code := _code;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_ont_exchange_ticket() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_assign_ont_exchange_ticket ON public.checklists;
CREATE TRIGGER trg_assign_ont_exchange_ticket
BEFORE INSERT OR UPDATE OF status, troca_realizada, dados, revision_number
ON public.checklists
FOR EACH ROW
EXECUTE FUNCTION public.assign_ont_exchange_ticket();

-- Gera tickets para trocas já finalizadas, preservando a ordem histórica.
DO $$
DECLARE
  _checklist_id uuid;
BEGIN
  FOR _checklist_id IN
    SELECT id
    FROM public.checklists
    WHERE status::text = 'finalizado'
      AND troca_realizada IS TRUE
      AND exchange_ticket_code IS NULL
    ORDER BY COALESCE(finalizado_em, created_at), id
  LOOP
    UPDATE public.checklists
    SET troca_realizada = troca_realizada
    WHERE id = _checklist_id;
  END LOOP;
END;
$$;