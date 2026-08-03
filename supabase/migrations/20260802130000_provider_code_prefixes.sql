-- Códigos de checklist por provedor.
--
-- Hoje os dois códigos gerados na finalização são fixos e da Webifibra:
--   numero_publico    = 'WEBICHECK' || YYYY || 0001
--   codigo_validacao  = 'WBF-' || YYYYMMDD || '-' || 8 hex
-- Numa instalação vendida a outros ISPs, o checklist do "Fibra Sul" sairia
-- com código WEBICHECK — nome de um concorrente no documento dele.
--
-- REGRA DESTA MIGRATION: a Webifibra não muda em NADA. Mesmos prefixos,
-- mesma continuidade de numeração (o contador dela é semeado com o maior
-- número já emitido). Só os provedores novos passam a ter identidade
-- própria. Documento já emitido nunca é reescrito.

-- ---------------------------------------------------------------
-- 1. Prefixos por provedor
-- ---------------------------------------------------------------
ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS public_code_prefix text,
  ADD COLUMN IF NOT EXISTS validation_code_prefix text;

-- Webifibra: exatamente o que já usa hoje.
UPDATE public.providers
   SET public_code_prefix     = COALESCE(public_code_prefix, 'WEBICHECK'),
       validation_code_prefix = COALESCE(validation_code_prefix, 'WBF')
 WHERE slug = 'webifibra';

-- Demais provedores (atuais e futuros sem prefixo definido): deriva do
-- slug. Ex.: slug "fibra-sul" -> FIBRASUL / FIB.
UPDATE public.providers
   SET public_code_prefix = COALESCE(
         public_code_prefix,
         upper(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g'))
       ),
       validation_code_prefix = COALESCE(
         validation_code_prefix,
         upper(left(regexp_replace(slug, '[^a-zA-Z0-9]', '', 'g'), 3))
       )
 WHERE public_code_prefix IS NULL OR validation_code_prefix IS NULL;

-- ---------------------------------------------------------------
-- 2. Numeração independente por provedor
-- ---------------------------------------------------------------
-- Sem isso o "Fibra Sul" começaria em FIBRASUL20260847 (o contador é
-- global hoje) — primeiro documento de um cliente novo nascendo com
-- numeração de milhar não passa confiança.
CREATE TABLE IF NOT EXISTS public.provider_checklist_counters (
  provider_id uuid PRIMARY KEY REFERENCES public.providers(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_checklist_counters ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.provider_checklist_counters TO authenticated;
GRANT ALL ON public.provider_checklist_counters TO service_role;

DROP POLICY IF EXISTS provider_counters_select ON public.provider_checklist_counters;
CREATE POLICY provider_counters_select ON public.provider_checklist_counters
  FOR SELECT TO authenticated
  USING (provider_id = public.current_provider_id() OR public.is_platform_admin(auth.uid()));

-- Semeia cada provedor com o maior número que ele já emitiu, para a
-- numeração CONTINUAR de onde parou (crítico para a Webifibra) em vez de
-- reiniciar e colidir com documento já entregue a cliente.
INSERT INTO public.provider_checklist_counters (provider_id, last_number)
SELECT p.id,
       COALESCE(MAX((substring(c.numero_publico from '(\d{4})$'))::bigint), 0)
  FROM public.providers p
  LEFT JOIN public.checklists c
         ON c.provider_id = p.id
        AND c.numero_publico IS NOT NULL
 GROUP BY p.id
    ON CONFLICT (provider_id) DO NOTHING;

-- ---------------------------------------------------------------
-- 3. Geração dos códigos usando o prefixo e o contador do provedor
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_checklist_finalization()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _public_prefix text;
  _validation_prefix text;
  _n bigint;
BEGIN
  IF NEW.status = 'finalizado' AND (OLD.status IS DISTINCT FROM 'finalizado') THEN
    NEW.finalizado_em := now();

    -- Sem provider_id (dado legado) mantém o comportamento antigo.
    SELECT p.public_code_prefix, p.validation_code_prefix
      INTO _public_prefix, _validation_prefix
      FROM public.providers p
     WHERE p.id = NEW.provider_id;
    _public_prefix     := COALESCE(_public_prefix, 'WEBICHECK');
    _validation_prefix := COALESCE(_validation_prefix, 'WBF');

    IF NEW.codigo_validacao IS NULL THEN
      NEW.codigo_validacao := _validation_prefix || '-' ||
        to_char(now(), 'YYYYMMDD') || '-' ||
        upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    END IF;

    IF NEW.numero_publico IS NULL THEN
      IF NEW.provider_id IS NULL THEN
        -- Caminho legado: sequência global, como antes.
        _n := nextval('public.checklist_numero_seq');
      ELSE
        INSERT INTO public.provider_checklist_counters (provider_id, last_number)
        VALUES (NEW.provider_id, 1)
        ON CONFLICT (provider_id) DO UPDATE
          SET last_number = public.provider_checklist_counters.last_number + 1,
              updated_at  = now()
        RETURNING last_number INTO _n;
      END IF;

      NEW.numero_publico := _public_prefix || to_char(now(), 'YYYY') ||
        lpad(_n::text, 4, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------
-- 4. Prefixo automático para provedor NOVO (criado depois desta migration)
-- ---------------------------------------------------------------
-- Os UPDATEs da seção 1 só cobrem os provedores que já existiam no
-- momento em que a migration rodou. Sem este trigger, um provedor
-- criado depois — pela tela /plataforma ou por qualquer outro caminho —
-- nasceria com public_code_prefix NULL, e set_checklist_finalization()
-- cairia no fallback 'WEBICHECK': o ISP novo emitiria documento com o
-- nome de outro provedor. A tela pode continuar mandando o prefixo
-- explícito (o admin escolhe); aqui só cobre quem não escolheu.
CREATE OR REPLACE FUNCTION public.derive_provider_code_prefixes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.public_code_prefix IS NULL THEN
    NEW.public_code_prefix := upper(regexp_replace(NEW.slug, '[^a-zA-Z0-9]', '', 'g'));
  END IF;
  IF NEW.validation_code_prefix IS NULL THEN
    NEW.validation_code_prefix := upper(left(regexp_replace(NEW.slug, '[^a-zA-Z0-9]', '', 'g'), 3));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_provider_code_prefixes ON public.providers;
CREATE TRIGGER trg_derive_provider_code_prefixes
BEFORE INSERT ON public.providers
FOR EACH ROW EXECUTE FUNCTION public.derive_provider_code_prefixes();
