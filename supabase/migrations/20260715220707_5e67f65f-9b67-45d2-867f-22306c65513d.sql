
-- =========================================
-- CHECKLISTS
-- =========================================
CREATE TYPE public.checklist_status AS ENUM ('rascunho', 'finalizado');
CREATE TYPE public.foto_categoria AS ENUM (
  'etiqueta', 'leds', 'fonte', 'teste_cabeado', 'teste_wifi', 'outro'
);

CREATE TABLE public.checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.checklist_status NOT NULL DEFAULT 'rascunho',
  os text,
  cliente text,
  cidade text,
  modelo text,
  serial text,
  cto_porta text,
  data_atendimento date,
  hora_atendimento time,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb,
  codigo_validacao text UNIQUE,
  finalizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklists_tecnico ON public.checklists(tecnico_id);
CREATE INDEX idx_checklists_status ON public.checklists(status);
CREATE INDEX idx_checklists_created ON public.checklists(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklists TO authenticated;
GRANT ALL ON public.checklists TO service_role;

ALTER TABLE public.checklists ENABLE ROW LEVEL SECURITY;

-- SELECT: próprio dono OU admin
CREATE POLICY "checklists_select_own_or_admin"
ON public.checklists FOR SELECT TO authenticated
USING (auth.uid() = tecnico_id OR public.has_role(auth.uid(), 'admin'));

-- INSERT: apenas como próprio dono, em status rascunho
CREATE POLICY "checklists_insert_own_draft"
ON public.checklists FOR INSERT TO authenticated
WITH CHECK (auth.uid() = tecnico_id AND status = 'rascunho');

-- UPDATE: apenas dono e apenas se estava rascunho (impede admin/tecnico de mexer em finalizado)
CREATE POLICY "checklists_update_own_draft"
ON public.checklists FOR UPDATE TO authenticated
USING (auth.uid() = tecnico_id AND status = 'rascunho')
WITH CHECK (auth.uid() = tecnico_id);

-- DELETE: apenas dono e apenas se rascunho
CREATE POLICY "checklists_delete_own_draft"
ON public.checklists FOR DELETE TO authenticated
USING (auth.uid() = tecnico_id AND status = 'rascunho');

CREATE TRIGGER trg_checklists_updated_at
BEFORE UPDATE ON public.checklists
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para gerar código de validação ao finalizar
CREATE OR REPLACE FUNCTION public.set_checklist_finalization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'finalizado' AND (OLD.status IS DISTINCT FROM 'finalizado') THEN
    NEW.finalizado_em := now();
    IF NEW.codigo_validacao IS NULL THEN
      NEW.codigo_validacao := 'WBF-' ||
        to_char(now(), 'YYYYMMDD') || '-' ||
        upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_checklists_finalize
BEFORE UPDATE ON public.checklists
FOR EACH ROW EXECUTE FUNCTION public.set_checklist_finalization();

-- =========================================
-- CHECKLIST FOTOS
-- =========================================
CREATE TABLE public.checklist_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id uuid NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  tecnico_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria public.foto_categoria NOT NULL DEFAULT 'outro',
  storage_path text NOT NULL,
  legenda text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fotos_checklist ON public.checklist_fotos(checklist_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_fotos TO authenticated;
GRANT ALL ON public.checklist_fotos TO service_role;

ALTER TABLE public.checklist_fotos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fotos_select_own_or_admin"
ON public.checklist_fotos FOR SELECT TO authenticated
USING (auth.uid() = tecnico_id OR public.has_role(auth.uid(), 'admin'));

-- INSERT/UPDATE/DELETE apenas se o checklist do dono ainda for rascunho
CREATE POLICY "fotos_insert_own_draft"
ON public.checklist_fotos FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = tecnico_id
  AND EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = checklist_id AND c.tecnico_id = auth.uid() AND c.status = 'rascunho'
  )
);

CREATE POLICY "fotos_delete_own_draft"
ON public.checklist_fotos FOR DELETE TO authenticated
USING (
  auth.uid() = tecnico_id
  AND EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = checklist_id AND c.tecnico_id = auth.uid() AND c.status = 'rascunho'
  )
);

-- =========================================
-- STORAGE POLICIES: bucket 'evidencias' (privado, criado via tool)
-- objetos organizados como: <tecnico_id>/<checklist_id>/<arquivo>
-- =========================================
CREATE POLICY "evidencias_select_own_or_admin"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'evidencias'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin')
  )
);

CREATE POLICY "evidencias_insert_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'evidencias'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "evidencias_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'evidencias'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
