
-- Promote correct admin email and fix trigger typo
UPDATE public.user_roles SET role='admin' WHERE user_id='8c9020e6-62e8-4e70-bced-d4d2af64b009';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  );

  IF LOWER(NEW.email) IN ('reenan.rash@gmail.com', 'renan.rash@gmail.com') THEN
    _role := 'admin';
  ELSE
    _role := 'tecnico';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$function$;

-- Allow admin to delete any checklist (including finalized test data)
DROP POLICY IF EXISTS checklists_delete_admin ON public.checklists;
CREATE POLICY checklists_delete_admin ON public.checklists
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admin to delete related fotos as well
DROP POLICY IF EXISTS checklist_fotos_delete_admin ON public.checklist_fotos;
CREATE POLICY checklist_fotos_delete_admin ON public.checklist_fotos
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
