-- Postit! / GR v4
-- O criador envia o compromisso sem prazo. O responsável principal aceita
-- e escolhe a primeira data; a segunda e a terceira só podem ser definidas
-- quando a data vigente chegar, durante a revisão da GR.

ALTER TYPE public.postit_status
  ADD VALUE IF NOT EXISTS 'pending_acceptance' BEFORE 'open';
ALTER TYPE public.postit_status
  ADD VALUE IF NOT EXISTS 'rejected' AFTER 'cancelled';

ALTER TABLE public.postit_items
  ALTER COLUMN initial_due_date DROP NOT NULL,
  ALTER COLUMN current_due_date DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by_person_id uuid
    REFERENCES public.postit_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by_person_id uuid
    REFERENCES public.postit_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.postit_people
  ADD COLUMN IF NOT EXISTS is_gr_conductor boolean NOT NULL DEFAULT false;

ALTER TABLE public.postit_items
  ADD COLUMN IF NOT EXISTS opened_by_person_id uuid
    REFERENCES public.postit_people(id) ON DELETE SET NULL;

UPDATE public.postit_items
SET opened_by_person_id = creator_person_id
WHERE opened_by_person_id IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_postit_gr_conductor_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.is_gr_conductor AND (
    SELECT count(*)
    FROM public.postit_people p
    WHERE p.provider_id = NEW.provider_id
      AND p.active
      AND p.is_gr_conductor
      AND p.id <> NEW.id
  ) >= 2 THEN
    RAISE EXCEPTION 'Cada provedor pode ter no máximo dois condutores de GR.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_postit_gr_conductor_limit
  ON public.postit_people;
CREATE TRIGGER enforce_postit_gr_conductor_limit
BEFORE INSERT OR UPDATE OF is_gr_conductor, active, provider_id
ON public.postit_people
FOR EACH ROW
EXECUTE FUNCTION public.enforce_postit_gr_conductor_limit();

-- Joseph inicia como condutor quando já existe no diretório. A administração
-- pode manter, substituir ou indicar o segundo perfil pela tela de pessoas.
UPDATE public.postit_people p
SET is_gr_conductor = true
WHERE p.id IN (
  SELECT DISTINCT ON (candidate.provider_id) candidate.id
  FROM public.postit_people candidate
  WHERE candidate.active
    AND lower(candidate.full_name) LIKE '%joseph%'
  ORDER BY candidate.provider_id, candidate.created_at
);

CREATE INDEX IF NOT EXISTS postit_people_gr_conductor_idx
  ON public.postit_people(provider_id, is_gr_conductor)
  WHERE active AND is_gr_conductor;

ALTER TABLE public.postit_deadline_history
  ADD COLUMN IF NOT EXISTS meeting_id uuid
    REFERENCES public.postit_meetings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision_type text NOT NULL DEFAULT 'gr_review';

DO $$ BEGIN
  ALTER TABLE public.postit_deadline_history
    ADD CONSTRAINT postit_deadline_history_decision_type_check
    CHECK (decision_type IN ('initial_acceptance', 'gr_review'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.postit_items.initial_due_date IS
  'Primeira data assumida pelo responsável ao aceitar o post-it.';
COMMENT ON COLUMN public.postit_items.current_due_date IS
  'Prazo vigente. Começa nulo enquanto o post-it aguarda aceite.';
COMMENT ON COLUMN public.postit_deadline_history.decision_type IS
  'initial_acceptance para o primeiro prazo; gr_review para o segundo e terceiro.';
COMMENT ON COLUMN public.postit_people.is_gr_conductor IS
  'Até dois perfis que podem conduzir e registrar decisões de uma GR no dia agendado.';
COMMENT ON COLUMN public.postit_items.opened_by_person_id IS
  'Pessoa que executou a abertura, inclusive quando abriu em nome de outro participante.';
