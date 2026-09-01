-- Postit! / GR v1
-- Módulo isolado por provedor para compromissos de reuniões, três prazos,
-- escalonamento e trilha de auditoria. A autenticação continua compartilhada
-- com o CheckTecnico, mas o cadastro de acesso é próprio (postit_members).

DO $$ BEGIN
  CREATE TYPE public.postit_member_role AS ENUM
    ('member', 'leader', 'manager', 'director', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.postit_status AS ENUM
    ('open', 'in_progress', 'overdue', 'awaiting_validation', 'completed', 'escalated', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.postit_priority AS ENUM ('low', 'normal', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.postit_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 80),
  color text NOT NULL DEFAULT '#facc15' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, name)
);

CREATE TABLE IF NOT EXISTS public.postit_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.postit_departments(id) ON DELETE SET NULL,
  role public.postit_member_role NOT NULL DEFAULT 'member',
  supervisor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.postit_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.postit_departments(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 160),
  meeting_type text NOT NULL DEFAULT 'sector' CHECK (meeting_type IN ('general', 'sector')),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'closed', 'cancelled')),
  scheduled_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.postit_code_counters (
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  code_year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider_id, code_year)
);

CREATE TABLE IF NOT EXISTS public.postit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 180),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 3 AND 5000),
  department_id uuid NOT NULL REFERENCES public.postit_departments(id),
  responsible_user_id uuid NOT NULL REFERENCES public.profiles(id),
  creator_user_id uuid NOT NULL REFERENCES public.profiles(id),
  manager_user_id uuid REFERENCES public.profiles(id),
  meeting_id uuid REFERENCES public.postit_meetings(id) ON DELETE SET NULL,
  priority public.postit_priority NOT NULL DEFAULT 'normal',
  status public.postit_status NOT NULL DEFAULT 'open',
  initial_due_date date NOT NULL,
  current_due_date date NOT NULL,
  extension_count smallint NOT NULL DEFAULT 0 CHECK (extension_count BETWEEN 0 AND 2),
  escalation_level smallint NOT NULL DEFAULT 0 CHECK (escalation_level BETWEEN 0 AND 3),
  completion_note text,
  completion_evidence_url text,
  completion_submitted_at timestamptz,
  validated_at timestamptz,
  validated_by uuid REFERENCES public.profiles(id),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, code)
);

CREATE TABLE IF NOT EXISTS public.postit_deadline_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  postit_id uuid NOT NULL REFERENCES public.postit_items(id) ON DELETE CASCADE,
  sequence smallint NOT NULL CHECK (sequence BETWEEN 0 AND 2),
  previous_due_date date,
  new_due_date date NOT NULL,
  reason text NOT NULL,
  requested_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (postit_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.postit_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  postit_id uuid NOT NULL REFERENCES public.postit_items(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL REFERENCES public.profiles(id),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.postit_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  postit_id uuid NOT NULL REFERENCES public.postit_items(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id),
  file_name text NOT NULL,
  file_url text NOT NULL,
  mime_type text,
  kind text NOT NULL DEFAULT 'evidence' CHECK (kind IN ('brief', 'evidence', 'meeting')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.postit_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  postit_id uuid REFERENCES public.postit_items(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES public.postit_meetings(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS postit_notifications_dedupe_idx
  ON public.postit_notifications(provider_id, recipient_user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.postit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.providers(id) ON DELETE CASCADE,
  postit_id uuid REFERENCES public.postit_items(id) ON DELETE CASCADE,
  meeting_id uuid REFERENCES public.postit_meetings(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS postit_items_provider_status_due_idx
  ON public.postit_items(provider_id, status, current_due_date);
CREATE INDEX IF NOT EXISTS postit_items_responsible_idx
  ON public.postit_items(provider_id, responsible_user_id, status);
CREATE INDEX IF NOT EXISTS postit_items_department_idx
  ON public.postit_items(provider_id, department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS postit_meetings_provider_date_idx
  ON public.postit_meetings(provider_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS postit_notifications_recipient_idx
  ON public.postit_notifications(recipient_user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS postit_events_item_idx
  ON public.postit_events(postit_id, created_at DESC);

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
      SELECT 1 FROM public.postit_members m
       WHERE m.user_id = _user_id
         AND m.provider_id = _provider_id
         AND m.active
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
      SELECT 1 FROM public.postit_members m
       WHERE m.user_id = _user_id
         AND m.provider_id = _provider_id
         AND m.active
         AND m.role IN ('manager', 'director', 'admin')
    );
$$;

REVOKE ALL ON FUNCTION public.postit_has_access(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.postit_can_manage(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.postit_has_access(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.postit_can_manage(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_postit_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year integer := EXTRACT(YEAR FROM now())::integer;
  _value integer;
BEGIN
  IF NEW.code IS NOT NULL AND trim(NEW.code) <> '' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.postit_code_counters(provider_id, code_year, last_value)
  VALUES (NEW.provider_id, _year, 1)
  ON CONFLICT (provider_id, code_year)
  DO UPDATE SET last_value = public.postit_code_counters.last_value + 1,
                updated_at = now()
  RETURNING last_value INTO _value;

  NEW.code := 'PST-' || _year::text || '-' || lpad(_value::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assign_postit_code_trigger ON public.postit_items;
CREATE TRIGGER assign_postit_code_trigger
BEFORE INSERT ON public.postit_items
FOR EACH ROW EXECUTE FUNCTION public.assign_postit_code();

DO $$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'postit_departments', 'postit_members', 'postit_meetings', 'postit_items'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', _table, _table);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()',
      _table, _table
    );
  END LOOP;
END $$;

-- O navegador recebe somente leitura. Toda alteração passa pelas server functions
-- autenticadas, que validam provedor, papel, responsável e limite de prorrogações.
DO $$
DECLARE
  _table text;
BEGIN
  FOREACH _table IN ARRAY ARRAY[
    'postit_departments', 'postit_members', 'postit_meetings', 'postit_items',
    'postit_deadline_history', 'postit_comments', 'postit_attachments',
    'postit_notifications', 'postit_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', _table);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', _table);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', _table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.postit_has_access(auth.uid(), provider_id))',
      _table || '_select', _table
    );
  END LOOP;
END $$;

ALTER TABLE public.postit_code_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.postit_code_counters FROM anon, authenticated;

GRANT ALL ON public.postit_departments, public.postit_members, public.postit_meetings,
  public.postit_code_counters, public.postit_items, public.postit_deadline_history,
  public.postit_comments, public.postit_attachments, public.postit_notifications,
  public.postit_events TO service_role;

COMMENT ON TABLE public.postit_members IS
  'Cadastro de acesso próprio do módulo Postit!, separado dos papéis operacionais do CheckTecnico.';
COMMENT ON COLUMN public.postit_items.extension_count IS
  'Quantidade de prorrogações consumidas. O máximo é 2; vencido o terceiro prazo, o item escala ao gestor.';
