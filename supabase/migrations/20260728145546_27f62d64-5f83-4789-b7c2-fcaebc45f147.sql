CREATE POLICY "laudos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'intervencao-laudos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "laudos_select_scope" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'intervencao-laudos'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_platform_admin(auth.uid())
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
      OR public.has_role(auth.uid(), 'noc'::public.app_role)
    )
  );
