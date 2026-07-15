
-- ============================================================
-- Snapshots imutáveis do documento do checklist (link público)
-- ============================================================
CREATE TABLE public.checklist_document_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  checklist_id UUID NOT NULL REFERENCES public.checklists(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  public_token TEXT NOT NULL UNIQUE,
  public_status TEXT NOT NULL DEFAULT 'active'
    CHECK (public_status IN ('active', 'revoked', 'replaced')),
  snapshot_data JSONB NOT NULL,
  document_hash TEXT NOT NULL,
  finalized_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  replaced_by_snapshot_id UUID REFERENCES public.checklist_document_snapshots(id) ON DELETE SET NULL,
  view_count INTEGER NOT NULL DEFAULT 0,
  last_viewed_at TIMESTAMPTZ,
  UNIQUE (checklist_id, version)
);

CREATE INDEX idx_snapshots_checklist_id ON public.checklist_document_snapshots(checklist_id);
CREATE INDEX idx_snapshots_public_token ON public.checklist_document_snapshots(public_token);
CREATE INDEX idx_snapshots_status ON public.checklist_document_snapshots(public_status);

GRANT SELECT, INSERT, UPDATE ON public.checklist_document_snapshots TO authenticated;
GRANT ALL ON public.checklist_document_snapshots TO service_role;

ALTER TABLE public.checklist_document_snapshots ENABLE ROW LEVEL SECURITY;

-- Técnicos veem snapshots dos próprios checklists; admins veem tudo
CREATE POLICY "snapshots_select_owner_or_admin"
  ON public.checklist_document_snapshots FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.id = checklist_document_snapshots.checklist_id
        AND c.tecnico_id = auth.uid()
    )
  );

-- Só admin pode revogar/regenerar (o INSERT em produção passa pelo service_role via server function)
CREATE POLICY "snapshots_insert_admin"
  ON public.checklist_document_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "snapshots_update_admin"
  ON public.checklist_document_snapshots FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- Logs de acesso público
-- ============================================================
CREATE TABLE public.checklist_public_access_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id UUID NOT NULL REFERENCES public.checklist_document_snapshots(id) ON DELETE CASCADE,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (event_type IN ('view','download_pdf','download_image','share')),
  user_agent_summary TEXT,
  ip_hash TEXT,
  referer_domain TEXT
);

CREATE INDEX idx_access_logs_snapshot ON public.checklist_public_access_logs(snapshot_id);
CREATE INDEX idx_access_logs_accessed_at ON public.checklist_public_access_logs(accessed_at DESC);

GRANT SELECT ON public.checklist_public_access_logs TO authenticated;
GRANT ALL ON public.checklist_public_access_logs TO service_role;

ALTER TABLE public.checklist_public_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "access_logs_select_admin"
  ON public.checklist_public_access_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
