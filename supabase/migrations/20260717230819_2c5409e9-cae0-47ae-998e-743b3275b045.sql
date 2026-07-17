
DROP POLICY IF EXISTS "Webi diag insert by authenticated" ON storage.objects;

CREATE POLICY "Webi diag insert by owner or admin"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'webi-diagnostic-reports'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.checklists c
      WHERE c.tecnico_id = auth.uid()
        AND c.case_id::text = split_part(storage.objects.name, '/', 1)
    )
  )
);
