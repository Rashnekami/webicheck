-- Postit! / GR v2
-- Diretório independente do CheckTecnico, hierarquia com múltiplos líderes,
-- dois responsáveis por compromisso e pauta gerencial semanal.

CREATE TABLE IF NOT EXISTS public.postit_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.postit_departments(id) ON DELETE SET NULL,
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 2 AND 120),
  email text,
  position_title text NOT NULL DEFAULT 'Colaborador'
    CHECK (length(trim(position_title)) BETWEEN 2 AND 100),
  role public.postit_member_role NOT NULL DEFAULT 'member',
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS postit_people_provider_user_idx
  ON public.postit_people(provider_id, user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS postit_people_provider_email_idx
  ON public.postit_people(provider_id, lower(email))
  WHERE email IS NOT NULL AND trim(email) <> '';
CREATE INDEX IF NOT EXISTS postit_people_department_idx
  ON public.postit_people(provider_id, department_id, active);

CREATE TABLE IF NOT EXISTS public.postit_reporting_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  subordinate_person_id uuid NOT NULL REFERENCES public.postit_people(id) ON DELETE CASCADE,
  leader_person_id uuid NOT NULL REFERENCES public.postit_people(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (subordinate_person_id <> leader_person_id),
  UNIQUE (provider_id, subordinate_person_id, leader_person_id)
);

CREATE INDEX IF NOT EXISTS postit_reporting_subordinate_idx
  ON public.postit_reporting_lines(provider_id, subordinate_person_id);
CREATE INDEX IF NOT EXISTS postit_reporting_leader_idx
  ON public.postit_reporting_lines(provider_id, leader_person_id);

ALTER TABLE public.postit_items
  ALTER COLUMN responsible_user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS creator_person_id uuid REFERENCES public.postit_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_assignee_person_id uuid REFERENCES public.postit_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_person_id uuid REFERENCES public.postit_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_meeting_id uuid REFERENCES public.postit_meetings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'meeting';

DO $$ BEGIN
  ALTER TABLE public.postit_items
    ADD CONSTRAINT postit_items_source_type_check
    CHECK (source_type IN ('meeting', 'sector', 'managerial', 'sporadic', 'standalone'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.postit_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  postit_id uuid NOT NULL REFERENCES public.postit_items(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.postit_people(id) ON DELETE CASCADE,
  assignment_order smallint NOT NULL DEFAULT 1 CHECK (assignment_order BETWEEN 1 AND 2),
  assigned_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (postit_id, person_id),
  UNIQUE (postit_id, assignment_order)
);

CREATE INDEX IF NOT EXISTS postit_assignees_person_idx
  ON public.postit_assignees(provider_id, person_id, postit_id);

-- Aceita os tipos antigos e os novos para manter reuniões já criadas.
ALTER TABLE public.postit_meetings
  DROP CONSTRAINT IF EXISTS postit_meetings_meeting_type_check;
ALTER TABLE public.postit_meetings
  ADD CONSTRAINT postit_meetings_meeting_type_check
  CHECK (meeting_type IN ('general', 'managerial', 'sector', 'sporadic'));
ALTER TABLE public.postit_meetings
  ADD COLUMN IF NOT EXISTS review_meeting_id uuid REFERENCES public.postit_meetings(id) ON DELETE SET NULL;

-- Converte os membros atuais para o novo diretório sem perder acessos.
INSERT INTO public.postit_people (
  provider_id, user_id, department_id, full_name, email, position_title, role, active, created_by
)
SELECT
  m.provider_id,
  m.user_id,
  m.department_id,
  COALESCE(NULLIF(trim(p.full_name), ''), split_part(p.email, '@', 1), 'Pessoa'),
  NULLIF(lower(trim(p.email)), ''),
  CASE m.role
    WHEN 'admin' THEN 'Administrador'
    WHEN 'director' THEN 'Diretoria'
    WHEN 'manager' THEN 'Gestor'
    WHEN 'leader' THEN 'Líder'
    ELSE 'Colaborador'
  END,
  m.role,
  m.active,
  m.created_by
FROM public.postit_members m
JOIN public.profiles p ON p.id = m.user_id
ON CONFLICT (provider_id, user_id) WHERE user_id IS NOT NULL
DO UPDATE SET
  department_id = EXCLUDED.department_id,
  full_name = EXCLUDED.full_name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  active = EXCLUDED.active,
  updated_at = now();

INSERT INTO public.postit_reporting_lines (
  provider_id, subordinate_person_id, leader_person_id, created_by
)
SELECT
  m.provider_id,
  subordinate.id,
  leader.id,
  m.created_by
FROM public.postit_members m
JOIN public.postit_people subordinate
  ON subordinate.provider_id = m.provider_id AND subordinate.user_id = m.user_id
JOIN public.postit_people leader
  ON leader.provider_id = m.provider_id AND leader.user_id = m.supervisor_user_id
WHERE m.supervisor_user_id IS NOT NULL
ON CONFLICT (provider_id, subordinate_person_id, leader_person_id) DO NOTHING;

UPDATE public.postit_items item
SET
  creator_person_id = (
    SELECT person.id FROM public.postit_people person
    WHERE person.provider_id = item.provider_id
      AND person.user_id = item.creator_user_id
    LIMIT 1
  ),
  primary_assignee_person_id = (
    SELECT person.id FROM public.postit_people person
    WHERE person.provider_id = item.provider_id
      AND person.user_id = item.responsible_user_id
    LIMIT 1
  ),
  manager_person_id = (
    SELECT person.id FROM public.postit_people person
    WHERE person.provider_id = item.provider_id
      AND person.user_id = item.manager_user_id
    LIMIT 1
  )
WHERE item.creator_person_id IS NULL;

INSERT INTO public.postit_assignees (
  provider_id, postit_id, person_id, assignment_order, assigned_by
)
SELECT
  item.provider_id,
  item.id,
  person.id,
  1,
  item.creator_user_id
FROM public.postit_items item
JOIN public.postit_people person
  ON person.provider_id = item.provider_id
 AND person.user_id = item.responsible_user_id
ON CONFLICT (postit_id, person_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.postit_person_id_for_user(_user_id uuid, _provider_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.postit_people
  WHERE provider_id = _provider_id
    AND user_id = _user_id
    AND active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.postit_has_access(_user_id uuid, _provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR (
      public.has_role(_user_id, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id AND p.provider_id = _provider_id AND p.active
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.postit_people p
      WHERE p.user_id = _user_id AND p.provider_id = _provider_id AND p.active
    )
    OR EXISTS (
      SELECT 1 FROM public.postit_members m
      WHERE m.user_id = _user_id AND m.provider_id = _provider_id AND m.active
    );
$$;

CREATE OR REPLACE FUNCTION public.postit_can_manage(_user_id uuid, _provider_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR (
      public.has_role(_user_id, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id AND p.provider_id = _provider_id AND p.active
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.postit_people p
      WHERE p.user_id = _user_id
        AND p.provider_id = _provider_id
        AND p.active
        AND p.role IN ('manager', 'director', 'admin')
    );
$$;

CREATE OR REPLACE FUNCTION public.postit_can_see_item(
  _user_id uuid,
  _provider_id uuid,
  _postit_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(_user_id)
    OR (
      public.has_role(_user_id, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = _user_id AND p.provider_id = _provider_id AND p.active
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.postit_people person
      WHERE person.provider_id = _provider_id
        AND person.user_id = _user_id
        AND person.active
        AND (
          person.role IN ('director', 'admin')
          OR EXISTS (
            SELECT 1 FROM public.postit_items item
            WHERE item.id = _postit_id
              AND item.provider_id = _provider_id
              AND (
                item.creator_user_id = _user_id
                OR item.manager_user_id = _user_id
                OR item.creator_person_id = person.id
                OR item.manager_person_id = person.id
                OR EXISTS (
                  SELECT 1 FROM public.postit_assignees a
                  WHERE a.postit_id = item.id AND a.person_id = person.id
                )
              )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.postit_person_id_for_user(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.postit_can_see_item(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.postit_person_id_for_user(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.postit_can_see_item(uuid, uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.postit_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postit_reporting_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postit_assignees ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.postit_people, public.postit_reporting_lines, public.postit_assignees
  FROM anon, authenticated;
GRANT SELECT ON public.postit_people, public.postit_reporting_lines, public.postit_assignees
  TO authenticated;

DROP POLICY IF EXISTS postit_people_select ON public.postit_people;
CREATE POLICY postit_people_select ON public.postit_people
  FOR SELECT TO authenticated
  USING (public.postit_has_access(auth.uid(), provider_id));

DROP POLICY IF EXISTS postit_reporting_lines_select ON public.postit_reporting_lines;
CREATE POLICY postit_reporting_lines_select ON public.postit_reporting_lines
  FOR SELECT TO authenticated
  USING (public.postit_has_access(auth.uid(), provider_id));

DROP POLICY IF EXISTS postit_assignees_select ON public.postit_assignees;
CREATE POLICY postit_assignees_select ON public.postit_assignees
  FOR SELECT TO authenticated
  USING (public.postit_can_see_item(auth.uid(), provider_id, postit_id));

DROP POLICY IF EXISTS postit_items_select ON public.postit_items;
CREATE POLICY postit_items_select ON public.postit_items
  FOR SELECT TO authenticated
  USING (public.postit_can_see_item(auth.uid(), provider_id, id));

DROP POLICY IF EXISTS postit_deadline_history_select ON public.postit_deadline_history;
CREATE POLICY postit_deadline_history_select ON public.postit_deadline_history
  FOR SELECT TO authenticated
  USING (public.postit_can_see_item(auth.uid(), provider_id, postit_id));

DROP POLICY IF EXISTS postit_comments_select ON public.postit_comments;
CREATE POLICY postit_comments_select ON public.postit_comments
  FOR SELECT TO authenticated
  USING (public.postit_can_see_item(auth.uid(), provider_id, postit_id));

DROP POLICY IF EXISTS postit_attachments_select ON public.postit_attachments;
CREATE POLICY postit_attachments_select ON public.postit_attachments
  FOR SELECT TO authenticated
  USING (public.postit_can_see_item(auth.uid(), provider_id, postit_id));

DROP POLICY IF EXISTS postit_events_select ON public.postit_events;
CREATE POLICY postit_events_select ON public.postit_events
  FOR SELECT TO authenticated
  USING (
    (postit_id IS NOT NULL AND public.postit_can_see_item(auth.uid(), provider_id, postit_id))
    OR (postit_id IS NULL AND public.postit_has_access(auth.uid(), provider_id))
  );

DROP POLICY IF EXISTS postit_notifications_select ON public.postit_notifications;
CREATE POLICY postit_notifications_select ON public.postit_notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = auth.uid()
    AND public.postit_has_access(auth.uid(), provider_id)
  );

DROP TRIGGER IF EXISTS update_postit_people_updated_at ON public.postit_people;
CREATE TRIGGER update_postit_people_updated_at
BEFORE UPDATE ON public.postit_people
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT ALL ON public.postit_people, public.postit_reporting_lines, public.postit_assignees
  TO service_role;

COMMENT ON TABLE public.postit_people IS
  'Diretório próprio do Postit. A pessoa pode existir antes do primeiro login e é vinculada ao perfil pelo e-mail.';
COMMENT ON TABLE public.postit_reporting_lines IS
  'Relações muitos-para-muitos entre liderado e líderes.';
COMMENT ON TABLE public.postit_assignees IS
  'Até duas pessoas responsáveis por compromisso, em ordem de responsabilidade.';
