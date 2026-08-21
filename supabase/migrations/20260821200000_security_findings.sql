-- Correções dos achados de segurança do scanner do Supabase.
-- Aditiva: nenhuma tabela alterada, nenhum dado tocado.
--
-- NOTA SOBRE OS ACHADOS DE "BUCKET SEM POLICY":
-- whistleblower-evidence, customer-counterproof-evidence, map-snapshots e
-- database_export_25_07_26 são acessados EXCLUSIVAMENTE pelo servidor com a
-- service role, que ignora RLS, e entregues ao usuário por URL assinada gerada
-- depois de uma checagem explícita de permissão no código. A ausência de policy
-- é a configuração correta: default-deny significa que nenhum cliente com anon
-- ou authenticated alcança esses arquivos diretamente. Criar policy de leitura
-- para "resolver" o alerta ABRIRIA um caminho de acesso que hoje não existe e
-- deixaria o sistema menos seguro. Por isso não são criadas policies para eles.

-- ---------------------------------------------------------------- CRÍTICO
-- ont_exchange_ticket_counters já tinha REVOKE ALL de PUBLIC/anon/authenticated,
-- o que na prática impede o PostgREST de ler ou escrever. Faltava o RLS ligado,
-- que é a segunda camada e o que o scanner cobra. Espelha exatamente o padrão de
-- intervention_code_counters.
ALTER TABLE public.ont_exchange_ticket_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ont_ticket_counters_service_only" ON public.ont_exchange_ticket_counters;
CREATE POLICY "ont_ticket_counters_service_only"
  ON public.ont_exchange_ticket_counters
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON public.ont_exchange_ticket_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ont_exchange_ticket_counters TO service_role;

-- --------------------------------------------- vazamento entre provedores
-- provider_branding_authenticated_read deixava QUALQUER usuário autenticado ler
-- a marca de TODOS os provedores. O caminho do arquivo começa com o provider_id,
-- então dá para escopar sem mudar nada de como o app grava.
DROP POLICY IF EXISTS "provider_branding_authenticated_read" ON storage.objects;
CREATE POLICY "provider_branding_own_provider_read"
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'provider-branding'
    AND (
      public.is_platform_admin(auth.uid())
      OR (storage.foldername(name))[1] = public.current_provider_id()::text
    )
  );

-- ------------------------------------------------------- SECURITY DEFINER
-- Nenhuma rota pública chama RPC como anon: todas as rotas de
-- /api/public/* usam supabaseAdmin (service role). Portanto anon não precisa
-- de EXECUTE em nenhuma função, e mantê-lo é superfície de ataque à toa.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                    -- SECURITY DEFINER
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon;', fn.sig);
  END LOOP;
END $$;

-- Funções de trigger nunca precisam de EXECUTE para authenticated: elas rodam
-- no contexto do trigger, não por chamada do PostgREST.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.prorettype = 'trigger'::regtype
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated;', fn.sig);
  END LOOP;
END $$;
