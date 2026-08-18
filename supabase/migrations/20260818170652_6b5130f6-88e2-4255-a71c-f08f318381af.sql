CREATE OR REPLACE FUNCTION public.has_whistleblower_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT platform_admin FROM public.profiles WHERE id = _user_id), false)
      OR EXISTS (SELECT 1 FROM public.whistleblower_access WHERE user_id = _user_id)
      OR public.has_role(_user_id, 'rh'::public.app_role)
$function$;

CREATE OR REPLACE FUNCTION public.has_technical_feedback_access(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT platform_admin FROM public.profiles WHERE id = _user_id), false)
      OR EXISTS (SELECT 1 FROM public.technical_feedback_access WHERE user_id = _user_id)
      OR public.has_role(_user_id, 'rh'::public.app_role)
$function$;

DELETE FROM public.user_roles WHERE user_id = '22ac3903-a0c1-47cc-a6b5-d51a10f3dc16';
INSERT INTO public.user_roles (user_id, role) VALUES ('22ac3903-a0c1-47cc-a6b5-d51a10f3dc16', 'rh'::public.app_role) ON CONFLICT DO NOTHING;