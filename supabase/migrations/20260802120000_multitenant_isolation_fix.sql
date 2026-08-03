-- Correção de isolamento entre provedores (pré-requisito para vender
-- acesso a ISPs diferentes na mesma instalação).
--
-- Problema de fundo: has_role(user, 'admin') responde "esta pessoa é
-- admin?", NUNCA "admin de qual provedor?". Onde as policies usaram
-- has_role sozinho, um admin de qualquer provedor cliente enxergava
-- dados de TODOS os provedores. Nas policies de checklists isso já
-- estava certo (escopado por provider_id), mas as tabelas filhas
-- (fotos, contra-provas, diagnósticos) e as de pessoas (profiles,
-- user_cities) ficaram sem o escopo.
--
-- Migration puramente restritiva: nada que já era permitido dentro do
-- mesmo provedor deixa de funcionar. Só corta acesso que atravessava
-- a fronteira entre provedores.

-- ---------------------------------------------------------------
-- 1. Checklists — exceção de cidade também precisa respeitar provedor
-- ---------------------------------------------------------------
-- has_city_exception(user, cidade, os) casa por (técnico, cidade, OS).
-- O número de OS é sequência interna de cada provedor, então dois ISPs
-- atuando na mesma cidade colidem em OS mais cedo ou mais tarde — e a
-- cláusula estava FORA do teste de provider_id, virando uma porta de
-- leitura entre provedores. Movida para dentro.
DROP POLICY IF EXISTS checklists_select_own_or_admin ON public.checklists;
CREATE POLICY checklists_select_own_or_admin ON public.checklists FOR SELECT
USING (
  auth.uid() = tecnico_id
  OR public.is_platform_admin(auth.uid())
  OR (provider_id = public.current_provider_id() AND (
        public.has_role(auth.uid(),'admin'::public.app_role)
     OR public.has_role(auth.uid(),'almoxarifado'::public.app_role)
     OR public.has_role(auth.uid(),'noc'::public.app_role)
     OR public.has_role(auth.uid(),'supervisor'::public.app_role)
     OR public.user_can_access_city(auth.uid(), cidade)
     OR public.has_city_exception(auth.uid(), cidade, os)
  ))
);

-- ---------------------------------------------------------------
-- 2. Fotos — eram legíveis por admin de QUALQUER provedor
-- ---------------------------------------------------------------
-- São fotos de casa de cliente, equipamento instalado e endereço:
-- o vazamento mais sensível dos três.
DROP POLICY IF EXISTS fotos_select_own_or_admin ON public.checklist_fotos;
CREATE POLICY fotos_select_own_or_admin ON public.checklist_fotos FOR SELECT
USING (
  auth.uid() = tecnico_id
  OR public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = checklist_fotos.checklist_id
      AND c.provider_id = public.current_provider_id()
      AND (
           public.has_role(auth.uid(),'admin'::public.app_role)
        OR public.has_role(auth.uid(),'supervisor'::public.app_role)
        OR public.has_role(auth.uid(),'noc'::public.app_role)
        OR public.has_role(auth.uid(),'almoxarifado'::public.app_role)
        OR public.user_can_access_city(auth.uid(), c.cidade)
        OR public.has_city_exception(auth.uid(), c.cidade, c.os)
      )
  )
);

-- ---------------------------------------------------------------
-- 3. Contra-provas — mesmo furo do admin global
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS counterproof_read_owner_or_admin ON public.customer_counterproofs;
CREATE POLICY counterproof_read_owner_or_admin ON public.customer_counterproofs FOR SELECT
USING (
  tecnico_id = auth.uid()
  OR public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = customer_counterproofs.checklist_id
      AND c.provider_id = public.current_provider_id()
      AND (
           public.has_role(auth.uid(),'admin'::public.app_role)
        OR public.has_role(auth.uid(),'supervisor'::public.app_role)
        OR public.has_role(auth.uid(),'noc'::public.app_role)
        OR public.user_can_access_city(auth.uid(), c.cidade)
        OR public.has_city_exception(auth.uid(), c.cidade, c.os)
      )
  )
);

-- ---------------------------------------------------------------
-- 4. Relatórios de diagnóstico — mesmo furo
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "Diag reports readable by owner or admin" ON public.checklist_diagnostic_reports;
CREATE POLICY "Diag reports readable by owner or admin" ON public.checklist_diagnostic_reports FOR SELECT
USING (
  public.is_platform_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.checklists c
    WHERE c.id = checklist_diagnostic_reports.checklist_id
      AND (
        c.tecnico_id = auth.uid()
        OR (c.provider_id = public.current_provider_id() AND (
              public.has_role(auth.uid(),'admin'::public.app_role)
           OR public.has_role(auth.uid(),'supervisor'::public.app_role)
           OR public.has_role(auth.uid(),'noc'::public.app_role)
           OR public.user_can_access_city(auth.uid(), c.cidade)
           OR public.has_city_exception(auth.uid(), c.cidade, c.os)
        ))
      )
  )
);

-- ---------------------------------------------------------------
-- 5. Perfis — supervisor enxergava por cidade, sem olhar provedor
-- ---------------------------------------------------------------
-- Supervisor do ISP B que cobre Curitiba lia (e alterava) os perfis
-- dos técnicos do ISP A em Curitiba.
DROP POLICY IF EXISTS "Supervisor lê perfis do seu escopo" ON public.profiles;
CREATE POLICY "Supervisor lê perfis do seu escopo" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'supervisor'::public.app_role)
    AND provider_id = public.current_provider_id()
    AND (
      supervisor_id = auth.uid()
      OR (city IS NOT NULL AND public.supervisor_covers_city(auth.uid(), city))
      OR id = auth.uid()
    )
  );

-- O WITH CHECK (true) da versão anterior era o pior ponto do banco:
-- permitia gravar QUALQUER valor em QUALQUER coluna da linha alcançada,
-- inclusive platform_admin e provider_id.
DROP POLICY IF EXISTS "Supervisor atualiza perfis do seu escopo" ON public.profiles;
CREATE POLICY "Supervisor atualiza perfis do seu escopo" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'supervisor'::public.app_role)
    AND provider_id = public.current_provider_id()
    AND (
      supervisor_id = auth.uid()
      OR (city IS NOT NULL AND public.supervisor_covers_city(auth.uid(), city))
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(),'supervisor'::public.app_role)
    AND provider_id = public.current_provider_id()
  );

-- ---------------------------------------------------------------
-- 6. Trava de escalada de privilégio (defesa em profundidade)
-- ---------------------------------------------------------------
-- Mesmo com as policies corrigidas, platform_admin e provider_id são
-- colunas que jamais devem ser alteradas por quem está autenticado
-- como usuário comum — nenhuma tela do produto faz isso. Trigger
-- garante isso independentemente de qualquer policy futura ficar
-- permissiva demais de novo.
CREATE OR REPLACE FUNCTION public.guard_profile_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role (funções de servidor com chave de serviço) não tem
  -- auth.uid(); é por ali que o produto cria/vincula credencial.
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF public.is_platform_admin(auth.uid()) THEN RETURN NEW; END IF;

  IF NEW.platform_admin IS DISTINCT FROM OLD.platform_admin THEN
    RAISE EXCEPTION 'platform_admin_change_denied' USING ERRCODE = '42501';
  END IF;
  IF NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN
    RAISE EXCEPTION 'provider_change_denied' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_privilege_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privilege_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privilege_columns();

-- ---------------------------------------------------------------
-- 7. user_cities — admin de qualquer provedor mexia em qualquer um
-- ---------------------------------------------------------------
-- Não é leitura de dado de cliente, mas permitia adulterar o território
-- dos técnicos de outro provedor (negar acesso, ou abrir cidade).
DROP POLICY IF EXISTS user_cities_select ON public.user_cities;
CREATE POLICY user_cities_select ON public.user_cities FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR (
      (public.has_role(auth.uid(),'admin'::public.app_role)
       OR public.has_role(auth.uid(),'supervisor'::public.app_role))
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_cities.user_id
          AND p.provider_id = public.current_provider_id()
      )
    )
  );

DROP POLICY IF EXISTS user_cities_insert_own ON public.user_cities;
CREATE POLICY user_cities_insert_own ON public.user_cities FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR (
      public.has_role(auth.uid(),'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_cities.user_id
          AND p.provider_id = public.current_provider_id()
      )
    )
  );

DROP POLICY IF EXISTS user_cities_delete_own ON public.user_cities;
CREATE POLICY user_cities_delete_own ON public.user_cities FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin(auth.uid())
    OR (
      public.has_role(auth.uid(),'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = user_cities.user_id
          AND p.provider_id = public.current_provider_id()
      )
    )
  );
