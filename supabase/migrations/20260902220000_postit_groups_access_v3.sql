-- Postit! / GR v3
-- Escopos por setor, grupos e cidades, dois responsáveis por setor/grupo,
-- cobertura temporária (férias) e isolamento de post-its entre equipes.

ALTER TABLE public.postit_people
  ADD COLUMN IF NOT EXISTS city_names text[] NOT NULL DEFAULT '{}'::text[];

CREATE TABLE IF NOT EXISTS public.postit_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.postit_departments(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 100),
  city_names text[] NOT NULL DEFAULT '{}'::text[],
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, department_id, name)
);

CREATE TABLE IF NOT EXISTS public.postit_person_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.postit_people(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.postit_groups(id) ON DELETE CASCADE,
  is_leader boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, person_id, group_id)
);

CREATE TABLE IF NOT EXISTS public.postit_department_leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.postit_departments(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.postit_people(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, department_id, person_id)
);

CREATE TABLE IF NOT EXISTS public.postit_visibility_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.postit_groups(id) ON DELETE CASCADE,
  grantee_person_id uuid NOT NULL REFERENCES public.postit_people(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 2 AND 300),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS postit_groups_department_idx
  ON public.postit_groups(provider_id, department_id, active);
CREATE INDEX IF NOT EXISTS postit_person_groups_person_idx
  ON public.postit_person_groups(provider_id, person_id, group_id);
CREATE INDEX IF NOT EXISTS postit_person_groups_group_idx
  ON public.postit_person_groups(provider_id, group_id, is_leader);
CREATE INDEX IF NOT EXISTS postit_department_leaders_department_idx
  ON public.postit_department_leaders(provider_id, department_id);
CREATE INDEX IF NOT EXISTS postit_visibility_grants_active_idx
  ON public.postit_visibility_grants(provider_id, grantee_person_id, group_id, active);

ALTER TABLE public.postit_items
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.postit_groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS postit_items_group_idx
  ON public.postit_items(provider_id, group_id, status, current_due_date);

-- Aproveita a cidade já existente no perfil para iniciar o novo cadastro.
UPDATE public.postit_people person
SET city_names = ARRAY[trim(profile.city)]
FROM public.profiles profile
WHERE profile.id = person.user_id
  AND profile.city IS NOT NULL
  AND trim(profile.city) <> ''
  AND cardinality(person.city_names) = 0;

CREATE OR REPLACE FUNCTION public.postit_limit_two_department_leaders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.postit_department_leaders row
    WHERE row.provider_id = NEW.provider_id
      AND row.department_id = NEW.department_id
      AND row.id <> NEW.id
  ) >= 2 THEN
    RAISE EXCEPTION 'Cada setor pode ter no máximo dois responsáveis.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS postit_department_leaders_max_two
  ON public.postit_department_leaders;
CREATE TRIGGER postit_department_leaders_max_two
BEFORE INSERT OR UPDATE ON public.postit_department_leaders
FOR EACH ROW EXECUTE FUNCTION public.postit_limit_two_department_leaders();

CREATE OR REPLACE FUNCTION public.postit_limit_two_group_leaders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_leader AND (
    SELECT count(*)
    FROM public.postit_person_groups row
    WHERE row.provider_id = NEW.provider_id
      AND row.group_id = NEW.group_id
      AND row.is_leader
      AND row.id <> NEW.id
  ) >= 2 THEN
    RAISE EXCEPTION 'Cada grupo pode ter no máximo dois líderes ou supervisores.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS postit_person_groups_max_two_leaders
  ON public.postit_person_groups;
CREATE TRIGGER postit_person_groups_max_two_leaders
BEFORE INSERT OR UPDATE ON public.postit_person_groups
FOR EACH ROW EXECUTE FUNCTION public.postit_limit_two_group_leaders();

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
        SELECT 1 FROM public.profiles profile
        WHERE profile.id = _user_id
          AND profile.provider_id = _provider_id
          AND profile.active
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.postit_people person
      JOIN public.postit_items item
        ON item.id = _postit_id AND item.provider_id = _provider_id
      WHERE person.provider_id = _provider_id
        AND person.user_id = _user_id
        AND person.active
        AND (
          person.role IN ('director', 'admin')
          OR item.creator_user_id = _user_id
          OR item.manager_user_id = _user_id
          OR item.creator_person_id = person.id
          OR item.manager_person_id = person.id
          OR EXISTS (
            SELECT 1 FROM public.postit_assignees assignee
            WHERE assignee.postit_id = item.id AND assignee.person_id = person.id
          )
          OR (
            item.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.postit_person_groups membership
              WHERE membership.group_id = item.group_id
                AND membership.person_id = person.id
                AND membership.is_leader
            )
          )
          OR (
            item.group_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM public.postit_visibility_grants grant_row
              WHERE grant_row.provider_id = _provider_id
                AND grant_row.group_id = item.group_id
                AND grant_row.grantee_person_id = person.id
                AND grant_row.active
                AND grant_row.starts_at <= now()
                AND (grant_row.ends_at IS NULL OR grant_row.ends_at > now())
            )
          )
        )
    );
$$;

REVOKE ALL ON FUNCTION public.postit_can_see_item(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.postit_can_see_item(uuid, uuid, uuid)
  TO authenticated, service_role;

ALTER TABLE public.postit_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postit_person_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postit_department_leaders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.postit_visibility_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.postit_groups, public.postit_person_groups,
  public.postit_department_leaders, public.postit_visibility_grants
  FROM anon, authenticated;
GRANT SELECT ON public.postit_groups, public.postit_person_groups,
  public.postit_department_leaders TO authenticated;
GRANT SELECT ON public.postit_visibility_grants TO authenticated;

DROP POLICY IF EXISTS postit_groups_select ON public.postit_groups;
CREATE POLICY postit_groups_select ON public.postit_groups
  FOR SELECT TO authenticated
  USING (public.postit_has_access(auth.uid(), provider_id));

DROP POLICY IF EXISTS postit_person_groups_select ON public.postit_person_groups;
CREATE POLICY postit_person_groups_select ON public.postit_person_groups
  FOR SELECT TO authenticated
  USING (public.postit_has_access(auth.uid(), provider_id));

DROP POLICY IF EXISTS postit_department_leaders_select ON public.postit_department_leaders;
CREATE POLICY postit_department_leaders_select ON public.postit_department_leaders
  FOR SELECT TO authenticated
  USING (public.postit_has_access(auth.uid(), provider_id));

DROP POLICY IF EXISTS postit_visibility_grants_select ON public.postit_visibility_grants;
CREATE POLICY postit_visibility_grants_select ON public.postit_visibility_grants
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND provider_id = public.current_provider_id()
    )
    OR EXISTS (
      SELECT 1 FROM public.postit_people administrator
      WHERE administrator.provider_id = postit_visibility_grants.provider_id
        AND administrator.user_id = auth.uid()
        AND administrator.active
        AND administrator.role IN ('director', 'admin')
    )
    OR grantee_person_id = public.postit_person_id_for_user(auth.uid(), provider_id)
  );

DROP POLICY IF EXISTS postit_items_select ON public.postit_items;
CREATE POLICY postit_items_select ON public.postit_items
  FOR SELECT TO authenticated
  USING (public.postit_can_see_item(auth.uid(), provider_id, id));

DROP POLICY IF EXISTS postit_assignees_select ON public.postit_assignees;
CREATE POLICY postit_assignees_select ON public.postit_assignees
  FOR SELECT TO authenticated
  USING (public.postit_can_see_item(auth.uid(), provider_id, postit_id));

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

DROP TRIGGER IF EXISTS update_postit_groups_updated_at ON public.postit_groups;
CREATE TRIGGER update_postit_groups_updated_at
BEFORE UPDATE ON public.postit_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_postit_visibility_grants_updated_at
  ON public.postit_visibility_grants;
CREATE TRIGGER update_postit_visibility_grants_updated_at
BEFORE UPDATE ON public.postit_visibility_grants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT ALL ON public.postit_groups, public.postit_person_groups,
  public.postit_department_leaders, public.postit_visibility_grants
  TO service_role;

COMMENT ON TABLE public.postit_groups IS
  'Grupos operacionais de um setor, com uma ou várias cidades/lojas.';
COMMENT ON TABLE public.postit_visibility_grants IS
  'Cobertura temporária de um grupo por férias, afastamento ou substituição.';
