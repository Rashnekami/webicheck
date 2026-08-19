-- Canal Ético — correções de segurança.
-- 1) has_whistleblower_access passa a ser escopada por provedor.
-- 2) Rate limit por ação com teto configurável já existente; nada muda no schema.

-- A concessão via whistleblower_access é por (provider_id, user_id), mas a
-- função ignorava o provider_id: quem tinha acesso em um provedor passava no
-- teste em qualquer outro. As policies de whistleblower_reports também filtram
-- provider_id = current_provider_id(), então não houve vazamento — mas a função
-- sozinha é enganosa e vai ser reusada sem o segundo filtro.
CREATE OR REPLACE FUNCTION public.has_whistleblower_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT platform_admin FROM public.profiles WHERE id = _user_id), false)
      OR EXISTS (
           SELECT 1 FROM public.whistleblower_access wa
           JOIN public.profiles p ON p.id = wa.user_id
           WHERE wa.user_id = _user_id
             AND wa.provider_id = p.provider_id
         )
      OR public.has_role(_user_id, 'rh'::public.app_role)
$function$;

CREATE OR REPLACE FUNCTION public.has_technical_feedback_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT platform_admin FROM public.profiles WHERE id = _user_id), false)
      OR EXISTS (
           SELECT 1 FROM public.technical_feedback_access tfa
           JOIN public.profiles p ON p.id = tfa.user_id
           WHERE tfa.user_id = _user_id
             AND tfa.provider_id = p.provider_id
         )
      OR public.has_role(_user_id, 'rh'::public.app_role)
$function$;
