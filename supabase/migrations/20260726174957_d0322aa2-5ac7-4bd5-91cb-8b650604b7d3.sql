
-- Promover login interno do Renan
UPDATE public.profiles SET platform_admin = true
WHERE email = 'renan@webifibra.webicheck.local';

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM public.profiles
WHERE email = 'renan@webifibra.webicheck.local'
ON CONFLICT DO NOTHING;

DELETE FROM public.user_roles
WHERE user_id IN (SELECT id FROM public.profiles WHERE email = 'renan@webifibra.webicheck.local')
  AND role <> 'admin'::public.app_role;

-- Providers: leitura ampla dos ativos para seleção no cadastro
DROP POLICY IF EXISTS providers_read_own ON public.providers;
CREATE POLICY providers_read_active
  ON public.providers
  FOR SELECT
  TO authenticated
  USING (status = 'active' OR public.is_platform_admin(auth.uid()) OR id = public.current_provider_id());

-- Providers: dono da plataforma pode editar/criar qualquer provedor
DROP POLICY IF EXISTS providers_admin_update ON public.providers;
CREATE POLICY providers_platform_update
  ON public.providers
  FOR UPDATE
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE POLICY providers_platform_insert
  ON public.providers
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- Permitir que o usuário atualize seu próprio provider_id se ainda estiver vazio (no completar cadastro)
-- Já existe policy de update de próprio perfil — nada a fazer.
