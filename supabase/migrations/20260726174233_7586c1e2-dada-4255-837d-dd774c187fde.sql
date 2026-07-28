
-- 1) Promover a conta Google real do Renan a dono da plataforma
UPDATE public.profiles
SET platform_admin = true
WHERE lower(email) IN ('renanparkofthedeath@gmail.com','renan.rash@gmail.com');

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles
WHERE lower(email) IN ('renanparkofthedeath@gmail.com','renan.rash@gmail.com')
ON CONFLICT DO NOTHING;

-- Remove papéis não-admin desses usuários
DELETE FROM public.user_roles
WHERE user_id IN (SELECT id FROM public.profiles WHERE lower(email) IN ('renanparkofthedeath@gmail.com','renan.rash@gmail.com'))
  AND role <> 'admin'::public.app_role;

-- 2) Trigger de novo usuário reconhecendo ambos emails do dono
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
  _provider_id uuid;
  _is_owner boolean;
BEGIN
  SELECT id INTO _provider_id FROM public.providers WHERE slug = 'webifibra';
  _is_owner := lower(COALESCE(NEW.email, '')) IN ('renan.rash@gmail.com','renanparkofthedeath@gmail.com');
  INSERT INTO public.profiles (id, email, full_name, city, provider_id, platform_admin)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(btrim(COALESCE(NEW.raw_user_meta_data ->> 'city', '')), ''),
    _provider_id,
    _is_owner
  ) ON CONFLICT (id) DO NOTHING;
  IF _is_owner THEN _role := 'admin'; ELSE _role := 'tecnico'; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 3) Isolamento por provedor nas policies de checklists e profiles
DROP POLICY IF EXISTS checklists_select_own_or_admin ON public.checklists;
CREATE POLICY checklists_select_own_or_admin
  ON public.checklists
  FOR SELECT
  USING (
    auth.uid() = tecnico_id
    OR public.is_platform_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND provider_id = public.current_provider_id())
    OR (public.has_role(auth.uid(), 'almoxarifado'::public.app_role) AND provider_id = public.current_provider_id())
  );

DROP POLICY IF EXISTS checklists_delete_admin ON public.checklists;
CREATE POLICY checklists_delete_admin
  ON public.checklists
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND provider_id = public.current_provider_id()
  );

DROP POLICY IF EXISTS "Admin lê todos os perfis" ON public.profiles;
CREATE POLICY "Admin lê perfis do provedor"
  ON public.profiles
  FOR SELECT
  USING (
    public.is_platform_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND provider_id = public.current_provider_id())
  );

DROP POLICY IF EXISTS "Admin atualiza qualquer perfil" ON public.profiles;
CREATE POLICY "Admin atualiza perfis do provedor"
  ON public.profiles
  FOR UPDATE
  USING (
    public.is_platform_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin'::public.app_role) AND provider_id = public.current_provider_id())
  );
