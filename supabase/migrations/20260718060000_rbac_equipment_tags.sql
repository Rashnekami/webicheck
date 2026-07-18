-- =============================================================
-- Perfis de leitura/supervisão + rastreabilidade de trocas de ONT
-- =============================================================

-- Novos papéis. As policies abaixo comparam role::text para que esta migration
-- não dependa do uso imediato dos novos valores do enum na mesma transação.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'visualizador';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role::text = 'admin'
    ) THEN true
    WHEN _permission IN ('dashboard:view', 'checklist:view_all', 'equipment:view')
      AND EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = _user_id AND role::text IN ('visualizador', 'supervisor')
      ) THEN true
    ELSE false
  END
$$;

REVOKE ALL ON FUNCTION public.has_permission(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;

-- Código curto e crescente para a etiqueta colada no equipamento retirado.
-- Seis dígitos evitam esgotar a numeração quando o produto crescer.
CREATE SEQUENCE IF NOT EXISTS public.equipment_tag_seq START 1;
GRANT USAGE, SELECT ON SEQUENCE public.equipment_tag_seq TO authenticated, service_role;

ALTER TABLE public.checklists
  ADD COLUMN IF NOT EXISTS equipment_tag_code text;

UPDATE public.checklists
SET equipment_tag_code = 'TE' || lpad(nextval('public.equipment_tag_seq')::text, 6, '0')
WHERE status = 'finalizado'
  AND troca_realizada IS TRUE
  AND equipment_tag_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_checklists_equipment_tag_code
  ON public.checklists (equipment_tag_code)
  WHERE equipment_tag_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklists_removed_ont_serial
  ON public.checklists (serial_ont_retirada)
  WHERE serial_ont_retirada IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklists_installed_ont_serial
  ON public.checklists (serial_ont_instalada)
  WHERE serial_ont_instalada IS NOT NULL;

-- Mantém os códigos já existentes de checklist e acrescenta a etiqueta TE.
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
    IF NEW.numero_publico IS NULL THEN
      NEW.numero_publico := 'WEBICHECK' || to_char(now(), 'YYYY') ||
        lpad(nextval('public.checklist_numero_seq')::text, 4, '0');
    END IF;
    IF NEW.troca_realizada IS TRUE AND NEW.equipment_tag_code IS NULL THEN
      IF nullif(btrim(NEW.serial_ont_retirada), '') IS NULL
        OR nullif(btrim(NEW.serial_ont_instalada), '') IS NULL THEN
        RAISE EXCEPTION 'swap_serials_required' USING ERRCODE = '23514';
      END IF;
      NEW.equipment_tag_code := 'TE' ||
        lpad(nextval('public.equipment_tag_seq')::text, 6, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Leitura ampla é concedida por capacidade. Escrita continua obedecendo às
-- policies existentes: visualizador e supervisor jamais ganham UPDATE/DELETE.
DROP POLICY IF EXISTS "checklists_select_own_or_admin" ON public.checklists;
CREATE POLICY "checklists_select_by_permission"
ON public.checklists FOR SELECT TO authenticated
USING (
  auth.uid() = tecnico_id
  OR public.has_permission(auth.uid(), 'checklist:view_all')
);

DROP POLICY IF EXISTS "fotos_select_own_or_admin" ON public.checklist_fotos;
CREATE POLICY "fotos_select_by_permission"
ON public.checklist_fotos FOR SELECT TO authenticated
USING (
  auth.uid() = tecnico_id
  OR public.has_permission(auth.uid(), 'checklist:view_all')
);

DROP POLICY IF EXISTS "Admin lê todos os perfis" ON public.profiles;
CREATE POLICY "Perfis visíveis para fiscalização"
ON public.profiles FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'checklist:view_all')
);

DROP POLICY IF EXISTS "Diag reports readable by owner or admin"
  ON public.checklist_diagnostic_reports;
CREATE POLICY "Diag reports readable by permitted users"
ON public.checklist_diagnostic_reports FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'checklist:view_all')
  OR EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = checklist_diagnostic_reports.checklist_id
      AND c.tecnico_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "snapshots_select_owner_or_admin"
  ON public.checklist_document_snapshots;
CREATE POLICY "snapshots_select_by_permission"
ON public.checklist_document_snapshots FOR SELECT TO authenticated
USING (
  public.has_permission(auth.uid(), 'checklist:view_all')
  OR EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = checklist_document_snapshots.checklist_id
      AND c.tecnico_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Webi diag read own or admin" ON storage.objects;
CREATE POLICY "Webi diag read by permitted users"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'webi-diagnostic-reports'
  AND (
    public.has_permission(auth.uid(), 'checklist:view_all')
    OR EXISTS (
      SELECT 1
      FROM public.checklist_diagnostic_reports r
      JOIN public.checklists c ON c.id = r.checklist_id
      WHERE r.storage_path = storage.objects.name
        AND c.tecnico_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "evidencias_select_own_or_admin" ON storage.objects;
CREATE POLICY "evidencias_select_by_permission"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'evidencias'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_permission(auth.uid(), 'checklist:view_all')
  )
);
