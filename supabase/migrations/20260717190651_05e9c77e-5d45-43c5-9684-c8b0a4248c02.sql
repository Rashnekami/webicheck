
CREATE POLICY "Webi diag read own or admin"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'webi-diagnostic-reports'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.checklist_diagnostic_reports r
        JOIN public.checklists c ON c.id = r.checklist_id
        WHERE r.storage_path = storage.objects.name
          AND c.tecnico_id = auth.uid()
      )
    )
  );

CREATE POLICY "Webi diag insert by authenticated"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'webi-diagnostic-reports');
