
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT platform_admin FROM public.profiles WHERE id = _user_id), false)
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "checklists_delete_platform_admin" ON public.checklists;
CREATE POLICY "checklists_delete_platform_admin" ON public.checklists
  FOR DELETE
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "checklist_fotos_delete_platform_admin" ON public.checklist_fotos;
CREATE POLICY "checklist_fotos_delete_platform_admin" ON public.checklist_fotos
  FOR DELETE USING (public.is_platform_admin(auth.uid()));

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS accent_color text,
  ADD COLUMN IF NOT EXISTS pdf_template text NOT NULL DEFAULT 'dark-neon';

ALTER TABLE public.providers
  DROP CONSTRAINT IF EXISTS providers_pdf_template_check;
ALTER TABLE public.providers
  ADD CONSTRAINT providers_pdf_template_check
  CHECK (pdf_template IN ('dark-neon','light-classic'));

DROP POLICY IF EXISTS "provider_branding_authenticated_read" ON storage.objects;
CREATE POLICY "provider_branding_authenticated_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'provider-branding');

DROP POLICY IF EXISTS "provider_branding_platform_admin_write" ON storage.objects;
CREATE POLICY "provider_branding_platform_admin_write" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'provider-branding' AND public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "provider_branding_platform_admin_update" ON storage.objects;
CREATE POLICY "provider_branding_platform_admin_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'provider-branding' AND public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "provider_branding_platform_admin_delete" ON storage.objects;
CREATE POLICY "provider_branding_platform_admin_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'provider-branding' AND public.is_platform_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.provider_login_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  login text NOT NULL,
  password_hash text NOT NULL,
  supabase_email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_login_accounts_provider_login_unique
  ON public.provider_login_accounts (provider_id, lower(login));

CREATE UNIQUE INDEX IF NOT EXISTS provider_login_accounts_user_id_unique
  ON public.provider_login_accounts (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.provider_login_accounts TO authenticated;
GRANT ALL ON public.provider_login_accounts TO service_role;

ALTER TABLE public.provider_login_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "provider_login_accounts_select_admin" ON public.provider_login_accounts;
CREATE POLICY "provider_login_accounts_select_admin" ON public.provider_login_accounts
  FOR SELECT TO authenticated USING (
    public.is_platform_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND provider_id = public.current_provider_id()
    )
  );

DROP POLICY IF EXISTS "provider_login_accounts_no_direct_write" ON public.provider_login_accounts;
CREATE POLICY "provider_login_accounts_no_direct_write" ON public.provider_login_accounts
  FOR INSERT TO authenticated WITH CHECK (false);

DROP TRIGGER IF EXISTS provider_login_accounts_set_updated_at ON public.provider_login_accounts;
CREATE TRIGGER provider_login_accounts_set_updated_at
  BEFORE UPDATE ON public.provider_login_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
