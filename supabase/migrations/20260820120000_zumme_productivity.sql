-- Produtividade técnica vinda do Zumme (dashboard "PRODUTIVIDADE TÉCNICA").
-- Entrada manual por competência enquanto não existe API. Totalmente aditiva:
-- nenhuma tabela existente é alterada.

-- ---------------------------------------------------------------- apelidos
-- O nome do técnico no Zumme é texto livre e varia de grafia
-- ("Dominy Henrique de Souza" x "JHONATAN HENRIQUE SANTOS NASCIMENTO").
-- O apelido casa o nome do Zumme com o profile uma única vez.
CREATE TABLE public.zumme_technician_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  -- Guardado já normalizado (maiúsculas, sem acento, espaços colapsados).
  zumme_name text NOT NULL CHECK (length(btrim(zumme_name)) BETWEEN 2 AND 200),
  employee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, zumme_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zumme_technician_aliases TO authenticated;
GRANT ALL ON public.zumme_technician_aliases TO service_role;
ALTER TABLE public.zumme_technician_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zta_feedback_access" ON public.zumme_technician_aliases
  FOR ALL TO authenticated
  USING (provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()))
  WITH CHECK (provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()));

-- ------------------------------------------------------------- lançamentos
CREATE TABLE public.zumme_productivity_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  competence text NOT NULL CHECK (competence ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- NULL = linha agregada da equipe (cards do topo sem filtro de técnico).
  employee_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source_name text NOT NULL,
  cities text[] NOT NULL DEFAULT '{}',
  total_os integer NOT NULL CHECK (total_os >= 0),
  avg_per_day numeric CHECK (avg_per_day IS NULL OR avg_per_day >= 0),
  -- "TEMPO MÉDIO DE FINALIZAÇÃO": guarda o texto original do Zumme e os
  -- minutos derivados, para conferência posterior contra a tela.
  avg_completion_raw text,
  avg_completion_minutes integer CHECK (avg_completion_minutes IS NULL OR avg_completion_minutes >= 0),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ocr')),
  notes text,
  entered_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Um lançamento por técnico por competência; e um único agregado de equipe.
CREATE UNIQUE INDEX zpe_unique_employee
  ON public.zumme_productivity_entries (provider_id, competence, employee_id)
  WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX zpe_unique_team
  ON public.zumme_productivity_entries (provider_id, competence)
  WHERE employee_id IS NULL;
CREATE INDEX zpe_lookup
  ON public.zumme_productivity_entries (provider_id, employee_id, competence DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zumme_productivity_entries TO authenticated;
GRANT ALL ON public.zumme_productivity_entries TO service_role;
ALTER TABLE public.zumme_productivity_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zpe_feedback_access" ON public.zumme_productivity_entries
  FOR ALL TO authenticated
  USING (provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()))
  WITH CHECK (provider_id = public.current_provider_id()
     AND public.has_technical_feedback_access(auth.uid()));

CREATE TRIGGER trg_zpe_updated_at BEFORE UPDATE ON public.zumme_productivity_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ------------------------------------------------------ quebra por assunto
CREATE TABLE public.zumme_productivity_breakdown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.zumme_productivity_entries(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('assunto','motivo_fechamento')),
  label text NOT NULL,
  category text NOT NULL DEFAULT 'outro' CHECK (category IN (
    'suporte_tecnico','instalacao','mudanca_endereco','visita_tecnica',
    'retencao','upgrade','outro')),
  quantity integer NOT NULL CHECK (quantity >= 0),
  percent numeric CHECK (percent IS NULL OR (percent >= 0 AND percent <= 100)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, kind, label)
);
CREATE INDEX zpb_entry ON public.zumme_productivity_breakdown (entry_id, kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zumme_productivity_breakdown TO authenticated;
GRANT ALL ON public.zumme_productivity_breakdown TO service_role;
ALTER TABLE public.zumme_productivity_breakdown ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.owns_zumme_entry(_entry_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.zumme_productivity_entries e
    WHERE e.id = _entry_id
      AND e.provider_id = public.current_provider_id()
      AND public.has_technical_feedback_access(auth.uid())
  )
$$;

CREATE POLICY "zpb_via_entry" ON public.zumme_productivity_breakdown
  FOR ALL TO authenticated
  USING (public.owns_zumme_entry(entry_id))
  WITH CHECK (public.owns_zumme_entry(entry_id));
