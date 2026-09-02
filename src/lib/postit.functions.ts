import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyDb = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

const db = (client: unknown) => client as AnyDb;

export type PostitMemberRole = "member" | "leader" | "manager" | "director" | "admin";
export type PostitStatus =
  | "open"
  | "in_progress"
  | "overdue"
  | "awaiting_validation"
  | "completed"
  | "escalated"
  | "cancelled";
export type PostitPriority = "low" | "normal" | "high" | "critical";

export interface PostitItemRow {
  id: string;
  provider_id: string;
  code: string;
  title: string;
  description: string;
  department_id: string;
  responsible_user_id: string | null;
  creator_user_id: string;
  manager_user_id: string | null;
  creator_person_id: string | null;
  primary_assignee_person_id: string | null;
  manager_person_id: string | null;
  group_id: string | null;
  review_meeting_id: string | null;
  source_type: "meeting" | "sector" | "managerial" | "sporadic" | "standalone";
  meeting_id: string | null;
  priority: PostitPriority;
  status: PostitStatus;
  initial_due_date: string;
  current_due_date: string;
  extension_count: number;
  escalation_level: number;
  completion_note: string | null;
  completion_evidence_url: string | null;
  completion_submitted_at: string | null;
  validated_at: string | null;
  validated_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PostitAccess {
  hasAccess: boolean;
  canManage: boolean;
  canAdminister: boolean;
  canBootstrap: boolean;
  memberRole: PostitMemberRole | null;
  providerId: string | null;
  personId: string | null;
}

export interface PostitWorkspace {
  access: PostitAccess;
  currentUserId: string;
  departments: any[];
  members: any[];
  people: any[];
  reportingLines: any[];
  groups: any[];
  personGroups: any[];
  departmentLeaders: any[];
  visibilityGrants: any[];
  loginAccounts: Array<{
    id: string;
    user_id: string;
    login: string;
    active: boolean;
  }>;
  assignees: any[];
  assignablePersonIds: string[];
  meetings: any[];
  items: PostitItemRow[];
  deadlines: any[];
  comments: any[];
  attachments: any[];
  notifications: any[];
  profiles: Array<{ id: string; full_name: string; email: string; city: string | null }>;
}

interface AccessContext extends PostitAccess {
  userId: string;
}

function brazilToday() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function cleanCityNames(values: string[] = []) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 12);
}

async function getAccessContext(userId: string): Promise<AccessContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = db(supabaseAdmin);
  const [{ data: profile, error: profileError }, { data: isAppAdmin }] = await Promise.all([
    client
      .from("profiles")
      .select("provider_id, platform_admin, active, email")
      .eq("id", userId)
      .maybeSingle(),
    client.rpc("has_role", { _user_id: userId, _role: "admin" }),
  ]);
  if (profileError) throw new Error(profileError.message);
  const providerId = (profile?.provider_id as string | null) ?? null;
  if (!providerId || !profile?.active) {
    return {
      userId,
      providerId,
      hasAccess: false,
      canManage: false,
      canAdminister: false,
      canBootstrap: false,
      memberRole: null,
      personId: null,
    };
  }

  const personResult = await client
    .from("postit_people")
    .select("id, role, active")
    .eq("provider_id", providerId)
    .eq("user_id", userId)
    .maybeSingle();
  let person = personResult.data;
  const personError = personResult.error;
  if (personError && personError.code !== "PGRST205") throw new Error(personError.message);
  if (!person && profile.email) {
    const { data: pendingPerson, error: pendingError } = await client
      .from("postit_people")
      .select("id, role, active")
      .eq("provider_id", providerId)
      .ilike("email", profile.email.trim())
      .is("user_id", null)
      .maybeSingle();
    if (pendingError && pendingError.code !== "PGRST205") throw new Error(pendingError.message);
    if (pendingPerson) {
      const { data: linked, error: linkError } = await client
        .from("postit_people")
        .update({ user_id: userId })
        .eq("id", pendingPerson.id)
        .eq("provider_id", providerId)
        .select("id, role, active")
        .single();
      if (linkError) throw new Error(linkError.message);
      person = linked;
    }
  }
  const { data: member } = await client
    .from("postit_members")
    .select("role, active")
    .eq("provider_id", providerId)
    .eq("user_id", userId)
    .maybeSingle();
  const memberRole = person?.active
    ? (person.role as PostitMemberRole)
    : member?.active
      ? (member.role as PostitMemberRole)
      : null;
  const platformAdmin = Boolean(profile.platform_admin);
  const appAdmin = Boolean(isAppAdmin);
  const canAdminister =
    platformAdmin || appAdmin || memberRole === "admin" || memberRole === "director";
  const canManage = canAdminister || memberRole === "manager";
  return {
    userId,
    providerId,
    memberRole,
    personId: person?.active ? (person.id as string) : null,
    canManage,
    canAdminister,
    canBootstrap: platformAdmin || appAdmin,
    hasAccess: Boolean(memberRole) || platformAdmin || appAdmin,
  };
}

async function requireAccess(userId: string) {
  const access = await getAccessContext(userId);
  if (!access.hasAccess || !access.providerId) {
    throw new Error("Você ainda não possui acesso ao Postit!.");
  }
  return access as AccessContext & { providerId: string };
}

async function requireManager(userId: string, administer = false) {
  const access = await requireAccess(userId);
  if (administer ? !access.canAdminister : !access.canManage) {
    throw new Error("Esta ação exige permissão de gestão no Postit!.");
  }
  return access;
}

async function getAssignablePersonIds(
  client: AnyDb,
  access: AccessContext & { providerId: string },
) {
  const { data: people, error: peopleError } = await client
    .from("postit_people")
    .select("id")
    .eq("provider_id", access.providerId)
    .eq("active", true);
  if (peopleError) throw new Error(peopleError.message);
  const allIds = (people ?? []).map((person: any) => person.id as string);
  if (access.canAdminister) return allIds;
  if (!access.personId) return [];

  const [linesResult, membershipsResult] = await Promise.all([
    client
      .from("postit_reporting_lines")
      .select("subordinate_person_id, leader_person_id")
      .eq("provider_id", access.providerId),
    client
      .from("postit_person_groups")
      .select("person_id, group_id, is_leader")
      .eq("provider_id", access.providerId),
  ]);
  if (linesResult.error) throw new Error(linesResult.error.message);
  if (membershipsResult.error) throw new Error(membershipsResult.error.message);
  const lines = linesResult.data ?? [];
  const memberships = membershipsResult.data ?? [];
  const ledGroupIds = new Set(
    memberships
      .filter((row: any) => row.person_id === access.personId && row.is_leader)
      .map((row: any) => row.group_id as string),
  );
  const allowed = new Set<string>();
  for (const line of lines) {
    if (line.subordinate_person_id === access.personId) allowed.add(line.leader_person_id);
    if (
      ["leader", "manager"].includes(access.memberRole ?? "") &&
      line.leader_person_id === access.personId &&
      memberships.some(
        (row: any) =>
          row.person_id === line.subordinate_person_id && ledGroupIds.has(row.group_id as string),
      )
    ) {
      allowed.add(line.subordinate_person_id);
    }
  }
  if (["leader", "manager"].includes(access.memberRole ?? "")) allowed.add(access.personId);
  return allIds.filter((id: string) => allowed.has(id));
}

async function getVisibleGroupIds(client: AnyDb, access: AccessContext & { providerId: string }) {
  const { data: groups, error: groupError } = await client
    .from("postit_groups")
    .select("id")
    .eq("provider_id", access.providerId)
    .eq("active", true);
  if (groupError) throw new Error(groupError.message);
  const allIds = (groups ?? []).map((group: any) => group.id as string);
  if (access.canAdminister) return allIds;
  if (!access.personId) return [];
  const now = new Date().toISOString();
  const [memberships, grants] = await Promise.all([
    client
      .from("postit_person_groups")
      .select("group_id")
      .eq("provider_id", access.providerId)
      .eq("person_id", access.personId)
      .eq("is_leader", true),
    client
      .from("postit_visibility_grants")
      .select("group_id, ends_at")
      .eq("provider_id", access.providerId)
      .eq("grantee_person_id", access.personId)
      .eq("active", true)
      .lte("starts_at", now),
  ]);
  if (memberships.error) throw new Error(memberships.error.message);
  if (grants.error) throw new Error(grants.error.message);
  const visible = new Set<string>(
    (memberships.data ?? []).map((row: any) => row.group_id as string),
  );
  for (const grant of grants.data ?? []) {
    if (!grant.ends_at || grant.ends_at > now) visible.add(grant.group_id as string);
  }
  return allIds.filter((id: string) => visible.has(id));
}

async function getSelectableGroupIds(
  client: AnyDb,
  access: AccessContext & { providerId: string },
) {
  if (access.canAdminister) return getVisibleGroupIds(client, access);
  if (!access.personId) return [];
  const visible = await getVisibleGroupIds(client, access);
  const { data: ownMemberships, error } = await client
    .from("postit_person_groups")
    .select("group_id")
    .eq("provider_id", access.providerId)
    .eq("person_id", access.personId);
  if (error) throw new Error(error.message);
  return [...new Set([...visible, ...(ownMemberships ?? []).map((row: any) => row.group_id)])];
}

function nextTuesdayAtNine() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    hourCycle: "h23",
  });
  const now = new Date();
  const cursor = new Date(now);
  cursor.setUTCMinutes(0, 0, 0);
  if (cursor <= now) cursor.setUTCHours(cursor.getUTCHours() + 1);
  for (let hour = 0; hour < 24 * 8; hour += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(cursor).map((part) => [part.type, part.value]),
    );
    if (parts.weekday === "Tue" && parts.hour === "09") return new Date(cursor);
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }
  throw new Error("Não foi possível calcular a próxima GR de terça-feira.");
}

async function getOrCreateNextManagerialMeeting(
  client: AnyDb,
  access: AccessContext & { providerId: string },
) {
  const scheduledAt = nextTuesdayAtNine();
  const windowEnd = new Date(scheduledAt.getTime() + 60 * 60 * 1000);
  const { data: existing, error: existingError } = await client
    .from("postit_meetings")
    .select("id")
    .eq("provider_id", access.providerId)
    .in("meeting_type", ["general", "managerial"])
    .gte("scheduled_at", scheduledAt.toISOString())
    .lt("scheduled_at", windowEnd.toISOString())
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return existing.id as string;

  const label = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(scheduledAt);
  const { data: created, error } = await client
    .from("postit_meetings")
    .insert({
      provider_id: access.providerId,
      department_id: null,
      title: `GR Gerencial — ${label}`,
      meeting_type: "managerial",
      scheduled_at: scheduledAt.toISOString(),
      created_by: access.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

async function insertEvent(
  client: AnyDb,
  context: AccessContext & { providerId: string },
  eventType: string,
  options: { postitId?: string; meetingId?: string; details?: Record<string, unknown> } = {},
) {
  const { error } = await client.from("postit_events").insert({
    provider_id: context.providerId,
    postit_id: options.postitId ?? null,
    meeting_id: options.meetingId ?? null,
    actor_user_id: context.userId,
    event_type: eventType,
    details: options.details ?? {},
  });
  if (error) throw new Error(`Falha ao registrar histórico do Postit!: ${error.message}`);
}

async function notify(
  client: AnyDb,
  input: {
    providerId: string;
    recipientUserId?: string | null;
    postitId?: string | null;
    meetingId?: string | null;
    type: string;
    title: string;
    message: string;
    dedupeKey?: string;
  },
) {
  if (!input.recipientUserId) return;
  if (input.dedupeKey) {
    const { data: existing } = await client
      .from("postit_notifications")
      .select("id")
      .eq("provider_id", input.providerId)
      .eq("recipient_user_id", input.recipientUserId)
      .eq("dedupe_key", input.dedupeKey)
      .maybeSingle();
    if (existing) return;
  }
  const { error } = await client.from("postit_notifications").insert({
    provider_id: input.providerId,
    recipient_user_id: input.recipientUserId,
    postit_id: input.postitId ?? null,
    meeting_id: input.meetingId ?? null,
    notification_type: input.type,
    title: input.title,
    message: input.message,
    dedupe_key: input.dedupeKey ?? null,
  });
  if (error) throw new Error(`Falha ao criar notificação do Postit!: ${error.message}`);
}

async function syncOverdueItems(context: AccessContext & { providerId: string }, client: AnyDb) {
  const today = brazilToday();
  const { data: rows, error } = await client
    .from("postit_items")
    .select("id, code, title, status, extension_count, responsible_user_id, manager_user_id")
    .eq("provider_id", context.providerId)
    .lt("current_due_date", today)
    .in("status", ["open", "in_progress", "overdue"]);
  if (error) throw new Error(error.message);

  for (const item of rows ?? []) {
    const escalated = Number(item.extension_count) >= 2;
    const nextStatus: PostitStatus = escalated ? "escalated" : "overdue";
    if (item.status !== nextStatus) {
      await client
        .from("postit_items")
        .update({
          status: nextStatus,
          escalation_level: escalated ? 1 : 0,
        })
        .eq("id", item.id)
        .eq("provider_id", context.providerId);
      await insertEvent(client, context, escalated ? "auto_escalated" : "deadline_overdue", {
        postitId: item.id,
        details: { synchronized_on: today },
      });
    }
    const responsiblePeople = await getItemAssigneePeople(client, context.providerId, item.id);
    for (const person of responsiblePeople) {
      await notify(client, {
        providerId: context.providerId,
        recipientUserId: person.user_id,
        postitId: item.id,
        type: escalated ? "escalated" : "overdue",
        title: escalated ? `${item.code} escalado` : `${item.code} fora do prazo`,
        message: escalated
          ? `A pendência “${item.title}” esgotou os três prazos e foi encaminhada à gestão.`
          : `A pendência “${item.title}” venceu. Registre a justificativa e a nova data.`,
        dedupeKey: `${item.id}:${nextStatus}:${today}:${person.id}`,
      });
    }
    if (escalated) {
      await notify(client, {
        providerId: context.providerId,
        recipientUserId: item.manager_user_id,
        postitId: item.id,
        type: "escalated_manager",
        title: `${item.code} chegou à gestão`,
        message: `A pendência “${item.title}” não foi concluída após três prazos.`,
        dedupeKey: `${item.id}:manager-escalated`,
      });
    }
  }
}

export const getPostitAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostitAccess> => {
    const access = await getAccessContext(context.userId);
    const { userId: _userId, ...result } = access;
    return result;
  });

export const bootstrapPostit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await getAccessContext(context.userId);
    if (!access.canBootstrap || !access.providerId) {
      throw new Error("Somente um administrador pode ativar o Postit!.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const defaults = [
      ["Comercial", "#38bdf8"],
      ["Financeiro", "#22c55e"],
      ["Técnica", "#f59e0b"],
      ["Marketing", "#a78bfa"],
      ["RH", "#f472b6"],
      ["Departamento Pessoal", "#fb7185"],
      ["Agenda", "#2dd4bf"],
      ["Diretoria", "#facc15"],
    ];
    const { error: departmentsError } = await client.from("postit_departments").upsert(
      defaults.map(([name, color]) => ({
        provider_id: access.providerId,
        name,
        color,
        created_by: context.userId,
        active: true,
      })),
      { onConflict: "provider_id,name", ignoreDuplicates: true },
    );
    if (departmentsError) {
      throw new Error(`Não foi possível criar os setores do Postit!: ${departmentsError.message}`);
    }

    const { data: member, error: memberError } = await client
      .from("postit_members")
      .upsert(
        {
          provider_id: access.providerId,
          user_id: context.userId,
          role: "admin",
          active: true,
          created_by: context.userId,
        },
        { onConflict: "provider_id,user_id" },
      )
      .select("role, active")
      .single();
    if (memberError || !member?.active || member.role !== "admin") {
      throw new Error(
        `Não foi possível cadastrar o administrador do Postit!: ${memberError?.message || "cadastro não confirmado"}`,
      );
    }
    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("full_name, email")
      .eq("id", context.userId)
      .single();
    if (profileError) throw new Error(profileError.message);
    const { data: existingPerson } = await client
      .from("postit_people")
      .select("id")
      .eq("provider_id", access.providerId)
      .eq("user_id", context.userId)
      .maybeSingle();
    const personPayload = {
      provider_id: access.providerId,
      user_id: context.userId,
      full_name: profile.full_name || profile.email?.split("@")[0] || "Administrador",
      email: profile.email?.trim().toLowerCase() || null,
      position_title: "Administrador do Postit",
      role: "admin",
      active: true,
      created_by: context.userId,
    };
    const { error: personSaveError } = existingPerson
      ? await client
          .from("postit_people")
          .update(personPayload)
          .eq("id", existingPerson.id)
          .eq("provider_id", access.providerId)
      : await client.from("postit_people").insert(personPayload);
    if (personSaveError) {
      throw new Error(`Não foi possível criar o perfil do Postit!: ${personSaveError.message}`);
    }
    await insertEvent(
      client,
      access as AccessContext & { providerId: string },
      "module_bootstrapped",
    );
    const confirmed = await getAccessContext(context.userId);
    if (!confirmed.hasAccess || confirmed.memberRole !== "admin") {
      throw new Error("A ativação foi gravada, mas o acesso ao Postit! não pôde ser confirmado.");
    }
    const { userId: _userId, ...confirmedAccess } = confirmed;
    return { ok: true, access: confirmedAccess };
  });

export const getPostitWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PostitWorkspace> => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    await syncOverdueItems(access, client);

    const [
      departments,
      members,
      people,
      reportingLines,
      groups,
      personGroups,
      departmentLeaders,
      visibilityGrants,
      loginAccounts,
      assignees,
      meetings,
      items,
      deadlines,
      comments,
      attachments,
      notifications,
    ] = await Promise.all([
      client
        .from("postit_departments")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("name"),
      client
        .from("postit_members")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at"),
      client
        .from("postit_people")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("full_name"),
      client
        .from("postit_reporting_lines")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at"),
      client.from("postit_groups").select("*").eq("provider_id", access.providerId).order("name"),
      client
        .from("postit_person_groups")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at"),
      client
        .from("postit_department_leaders")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at"),
      client
        .from("postit_visibility_grants")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at", { ascending: false }),
      access.canAdminister
        ? client
            .from("provider_login_accounts")
            .select("id, user_id, login, active")
            .eq("provider_id", access.providerId)
            .order("login")
        : Promise.resolve({ data: [], error: null }),
      client
        .from("postit_assignees")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("assignment_order"),
      client
        .from("postit_meetings")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("scheduled_at", { ascending: false })
        .limit(200),
      client
        .from("postit_items")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("postit_deadline_history")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at"),
      client
        .from("postit_comments")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at"),
      client
        .from("postit_attachments")
        .select("*")
        .eq("provider_id", access.providerId)
        .order("created_at"),
      client
        .from("postit_notifications")
        .select("*")
        .eq("provider_id", access.providerId)
        .eq("recipient_user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    for (const result of [
      departments,
      members,
      people,
      reportingLines,
      groups,
      personGroups,
      departmentLeaders,
      visibilityGrants,
      loginAccounts,
      assignees,
      meetings,
      items,
      deadlines,
      comments,
      attachments,
      notifications,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const linkedUserIds = (people.data ?? [])
      .filter((person: any) => person.active && person.user_id)
      .map((person: any) => person.user_id as string);
    const { data: profiles, error: profilesError } = await client
      .from("profiles")
      .select("id, full_name, email, city")
      .eq("provider_id", access.providerId)
      .eq("active", true)
      .in("id", linkedUserIds.length ? linkedUserIds : [context.userId])
      .order("full_name");
    if (profilesError) throw new Error(profilesError.message);

    const allAssignees = assignees.data ?? [];
    const rawItems = items.data ?? [];
    const visibleGroupIds = new Set(await getVisibleGroupIds(client, access));
    const visibleItems = access.canAdminister
      ? rawItems
      : rawItems.filter(
          (item: any) =>
            item.creator_user_id === context.userId ||
            item.manager_user_id === context.userId ||
            item.responsible_user_id === context.userId ||
            (item.group_id && visibleGroupIds.has(item.group_id)) ||
            (access.personId &&
              (item.creator_person_id === access.personId ||
                item.manager_person_id === access.personId ||
                allAssignees.some(
                  (assignee: any) =>
                    assignee.postit_id === item.id && assignee.person_id === access.personId,
                ))),
        );
    const visibleItemIds = new Set(visibleItems.map((item: any) => item.id));
    const assignablePersonIds = await getAssignablePersonIds(client, access);
    const { userId: _userId, ...publicAccess } = access;
    return {
      access: publicAccess,
      currentUserId: context.userId,
      departments: departments.data ?? [],
      members: members.data ?? [],
      people: people.data ?? [],
      reportingLines: reportingLines.data ?? [],
      groups: groups.data ?? [],
      personGroups: personGroups.data ?? [],
      departmentLeaders: departmentLeaders.data ?? [],
      visibilityGrants: access.canAdminister
        ? (visibilityGrants.data ?? [])
        : (visibilityGrants.data ?? []).filter(
            (row: any) => row.grantee_person_id === access.personId,
          ),
      loginAccounts: loginAccounts.data ?? [],
      assignees: allAssignees.filter((row: any) => visibleItemIds.has(row.postit_id)),
      assignablePersonIds,
      meetings: meetings.data ?? [],
      items: visibleItems,
      deadlines: (deadlines.data ?? []).filter((row: any) => visibleItemIds.has(row.postit_id)),
      comments: (comments.data ?? []).filter((row: any) => visibleItemIds.has(row.postit_id)),
      attachments: (attachments.data ?? []).filter((row: any) => visibleItemIds.has(row.postit_id)),
      notifications: notifications.data ?? [],
      profiles: profiles ?? [],
    };
  });

export const savePostitDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id?: string; name: string; color: string; active?: boolean }) => {
    if (data.name.trim().length < 2) throw new Error("Informe o nome do setor.");
    if (!/^#[0-9a-f]{6}$/i.test(data.color)) throw new Error("Cor inválida.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const access = await requireManager(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const payload = { name: data.name.trim(), color: data.color, active: data.active ?? true };
    const query = data.id
      ? client
          .from("postit_departments")
          .update(payload)
          .eq("id", data.id)
          .eq("provider_id", access.providerId)
      : client.from("postit_departments").insert({
          ...payload,
          provider_id: access.providerId,
          created_by: context.userId,
        });
    const { error } = await query;
    if (error) throw new Error(error.message);
    await insertEvent(client, access, data.id ? "department_updated" : "department_created", {
      details: { department_id: data.id, name: payload.name },
    });
    return { ok: true };
  });

export const savePostitGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id?: string;
      departmentId: string;
      name: string;
      cityNames?: string[];
      active?: boolean;
    }) => {
      if (!data.departmentId) throw new Error("Selecione o setor do grupo.");
      if (data.name.trim().length < 2) throw new Error("Informe o nome do grupo.");
      return { ...data, cityNames: cleanCityNames(data.cityNames) };
    },
  )
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const { data: department, error: departmentError } = await client
      .from("postit_departments")
      .select("id")
      .eq("id", data.departmentId)
      .eq("provider_id", access.providerId)
      .eq("active", true)
      .maybeSingle();
    if (departmentError) throw new Error(departmentError.message);
    if (!department) throw new Error("Setor inválido.");
    if (!access.canAdminister) {
      const { data: responsibility, error: responsibilityError } = await client
        .from("postit_department_leaders")
        .select("id")
        .eq("provider_id", access.providerId)
        .eq("department_id", data.departmentId)
        .eq("person_id", access.personId)
        .maybeSingle();
      if (responsibilityError) throw new Error(responsibilityError.message);
      if (!responsibility) {
        throw new Error("Somente responsáveis do setor podem criar ou editar grupos.");
      }
    }
    const payload = {
      department_id: data.departmentId,
      name: data.name.trim(),
      city_names: data.cityNames ?? [],
      active: data.active ?? true,
    };
    const result = data.id
      ? await client
          .from("postit_groups")
          .update(payload)
          .eq("id", data.id)
          .eq("provider_id", access.providerId)
          .select("id")
          .single()
      : await client
          .from("postit_groups")
          .insert({
            ...payload,
            provider_id: access.providerId,
            created_by: context.userId,
          })
          .select("id")
          .single();
    if (result.error) throw new Error(result.error.message);
    await insertEvent(client, access, data.id ? "group_updated" : "group_created", {
      details: {
        group_id: result.data.id,
        department_id: data.departmentId,
        city_names: data.cityNames ?? [],
      },
    });
    return { ok: true, groupId: result.data.id as string };
  });

export const savePostitVisibilityGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id?: string;
      groupId: string;
      granteePersonId: string;
      reason: string;
      startsAt: string;
      endsAt?: string | null;
      active?: boolean;
    }) => {
      if (!data.groupId || !data.granteePersonId) {
        throw new Error("Selecione o grupo e quem fará a cobertura.");
      }
      if (data.reason.trim().length < 2) throw new Error("Informe o motivo da cobertura.");
      if (!data.startsAt) throw new Error("Informe o início da cobertura.");
      if (data.endsAt && data.endsAt <= data.startsAt) {
        throw new Error("O término precisa ser posterior ao início.");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const access = await requireManager(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const [groupResult, personResult] = await Promise.all([
      client
        .from("postit_groups")
        .select("id")
        .eq("id", data.groupId)
        .eq("provider_id", access.providerId)
        .eq("active", true)
        .maybeSingle(),
      client
        .from("postit_people")
        .select("id")
        .eq("id", data.granteePersonId)
        .eq("provider_id", access.providerId)
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (groupResult.error) throw new Error(groupResult.error.message);
    if (personResult.error) throw new Error(personResult.error.message);
    if (!groupResult.data || !personResult.data) {
      throw new Error("Grupo ou pessoa não pertence a este provedor.");
    }
    const payload = {
      group_id: data.groupId,
      grantee_person_id: data.granteePersonId,
      reason: data.reason.trim(),
      starts_at: data.startsAt,
      ends_at: data.endsAt || null,
      active: data.active ?? true,
    };
    const result = data.id
      ? await client
          .from("postit_visibility_grants")
          .update(payload)
          .eq("id", data.id)
          .eq("provider_id", access.providerId)
          .select("id")
          .single()
      : await client
          .from("postit_visibility_grants")
          .insert({
            ...payload,
            provider_id: access.providerId,
            created_by: context.userId,
          })
          .select("id")
          .single();
    if (result.error) throw new Error(result.error.message);
    await insertEvent(client, access, "visibility_grant_saved", {
      details: { grant_id: result.data.id, ...payload },
    });
    return { ok: true };
  });

export const savePostitPerson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id?: string;
      fullName: string;
      email?: string | null;
      positionTitle: string;
      departmentId?: string | null;
      role: PostitMemberRole;
      leaderPersonIds?: string[];
      cityNames?: string[];
      groupIds?: string[];
      ledGroupIds?: string[];
      departmentResponsible?: boolean;
      active?: boolean;
    }) => {
      if (data.fullName.trim().length < 2) throw new Error("Informe o nome da pessoa.");
      if (data.positionTitle.trim().length < 2) throw new Error("Informe o cargo ou função.");
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
        throw new Error("Informe um e-mail válido ou deixe o campo vazio.");
      }
      if (new Set(data.leaderPersonIds ?? []).size !== (data.leaderPersonIds ?? []).length) {
        throw new Error("Não repita o mesmo líder.");
      }
      const groupIds = [...new Set(data.groupIds ?? [])];
      const ledGroupIds = [...new Set(data.ledGroupIds ?? [])];
      if (ledGroupIds.some((id) => !groupIds.includes(id))) {
        throw new Error("Para liderar um grupo, a pessoa também precisa participar dele.");
      }
      return { ...data, cityNames: cleanCityNames(data.cityNames), groupIds, ledGroupIds };
    },
  )
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    if (!access.canAdminister && !["leader", "manager"].includes(access.memberRole ?? "")) {
      throw new Error("Somente líderes e gestores podem cadastrar pessoas.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    if (data.departmentId) {
      const { data: department } = await client
        .from("postit_departments")
        .select("id")
        .eq("id", data.departmentId)
        .eq("provider_id", access.providerId)
        .maybeSingle();
      if (!department) throw new Error("Setor inválido.");
    }
    const leaderIds = [...new Set(data.leaderPersonIds ?? [])];
    if (data.id && leaderIds.includes(data.id)) {
      throw new Error("A pessoa não pode liderar a si mesma.");
    }
    if (!access.canAdminister) {
      if (data.id) {
        const { data: existingLine } = await client
          .from("postit_reporting_lines")
          .select("id")
          .eq("provider_id", access.providerId)
          .eq("subordinate_person_id", data.id)
          .eq("leader_person_id", access.personId)
          .maybeSingle();
        if (!existingLine) throw new Error("Você só pode editar pessoas que lidera.");
      }
      if (["manager", "director", "admin"].includes(data.role)) {
        throw new Error("Somente a administração pode atribuir cargos de gestão.");
      }
      if (data.departmentResponsible || (data.ledGroupIds ?? []).length) {
        throw new Error("Somente a administração pode definir responsáveis de setor ou grupo.");
      }
      if (access.personId && !leaderIds.includes(access.personId)) leaderIds.push(access.personId);
    }

    const groupIds = data.groupIds ?? [];
    const ledGroupIds = data.ledGroupIds ?? [];
    if (groupIds.length) {
      const { data: selectedGroups, error: selectedGroupsError } = await client
        .from("postit_groups")
        .select("id, department_id, active")
        .eq("provider_id", access.providerId)
        .in("id", groupIds);
      if (selectedGroupsError) throw new Error(selectedGroupsError.message);
      if (
        (selectedGroups ?? []).length !== groupIds.length ||
        (selectedGroups ?? []).some(
          (group: any) => !group.active || group.department_id !== (data.departmentId || null),
        )
      ) {
        throw new Error("Todos os grupos precisam estar ativos e pertencer ao setor escolhido.");
      }
      if (!access.canAdminister) {
        const { data: allowedGroups, error: allowedGroupsError } = await client
          .from("postit_person_groups")
          .select("group_id")
          .eq("provider_id", access.providerId)
          .eq("person_id", access.personId)
          .eq("is_leader", true);
        if (allowedGroupsError) throw new Error(allowedGroupsError.message);
        const allowedIds = new Set((allowedGroups ?? []).map((row: any) => row.group_id));
        if (groupIds.some((id) => !allowedIds.has(id))) {
          throw new Error("Você só pode cadastrar pessoas nos grupos que lidera.");
        }
      }
    }
    if (leaderIds.length) {
      const { data: leaders, error: leadersError } = await client
        .from("postit_people")
        .select("id, role, active")
        .eq("provider_id", access.providerId)
        .in("id", leaderIds);
      if (leadersError) throw new Error(leadersError.message);
      if (
        (leaders ?? []).length !== leaderIds.length ||
        (leaders ?? []).some(
          (leader: any) =>
            !leader.active || !["leader", "manager", "director", "admin"].includes(leader.role),
        )
      ) {
        throw new Error("Todo gestor precisa estar ativo como líder ou gestor.");
      }
    }

    const normalizedEmail = data.email?.trim().toLowerCase() || null;
    let linkedUserId: string | null = null;
    if (data.id) {
      const { data: existingPerson, error: existingPersonError } = await client
        .from("postit_people")
        .select("user_id")
        .eq("id", data.id)
        .eq("provider_id", access.providerId)
        .maybeSingle();
      if (existingPersonError) throw new Error(existingPersonError.message);
      if (!existingPerson) throw new Error("Pessoa não encontrada.");
      linkedUserId = (existingPerson.user_id as string | null) ?? null;
    }
    if (normalizedEmail) {
      const { data: linkedProfile, error: linkedProfileError } = await client
        .from("profiles")
        .select("id")
        .eq("provider_id", access.providerId)
        .ilike("email", normalizedEmail)
        .maybeSingle();
      if (linkedProfileError) throw new Error(linkedProfileError.message);
      if (linkedProfile?.id) linkedUserId = linkedProfile.id as string;
    }
    const payload = {
      provider_id: access.providerId,
      user_id: linkedUserId,
      department_id: data.departmentId || null,
      full_name: data.fullName.trim(),
      email: normalizedEmail,
      position_title: data.positionTitle.trim(),
      city_names: data.cityNames ?? [],
      role: data.role,
      active: data.active ?? true,
      created_by: context.userId,
    };
    const saved = data.id
      ? await client
          .from("postit_people")
          .update(payload)
          .eq("id", data.id)
          .eq("provider_id", access.providerId)
          .select("id, user_id")
          .single()
      : await client.from("postit_people").insert(payload).select("id, user_id").single();
    if (saved.error) throw new Error(saved.error.message);
    const personId = saved.data.id as string;

    const { error: deleteGroupsError } = await client
      .from("postit_person_groups")
      .delete()
      .eq("provider_id", access.providerId)
      .eq("person_id", personId);
    if (deleteGroupsError) throw new Error(deleteGroupsError.message);
    if (groupIds.length) {
      const { error: personGroupsError } = await client.from("postit_person_groups").insert(
        groupIds.map((groupId) => ({
          provider_id: access.providerId,
          person_id: personId,
          group_id: groupId,
          is_leader: ledGroupIds.includes(groupId),
          created_by: context.userId,
        })),
      );
      if (personGroupsError) throw new Error(personGroupsError.message);
    }

    if (access.canAdminister) {
      const { error: deleteDepartmentLeaderError } = await client
        .from("postit_department_leaders")
        .delete()
        .eq("provider_id", access.providerId)
        .eq("person_id", personId);
      if (deleteDepartmentLeaderError) throw new Error(deleteDepartmentLeaderError.message);
      if (data.departmentResponsible && data.departmentId) {
        const { error: departmentLeaderError } = await client
          .from("postit_department_leaders")
          .insert({
            provider_id: access.providerId,
            department_id: data.departmentId,
            person_id: personId,
            created_by: context.userId,
          });
        if (departmentLeaderError) throw new Error(departmentLeaderError.message);
      }
    }

    const { error: deleteLinesError } = await client
      .from("postit_reporting_lines")
      .delete()
      .eq("provider_id", access.providerId)
      .eq("subordinate_person_id", personId);
    if (deleteLinesError) throw new Error(deleteLinesError.message);
    if (leaderIds.length) {
      const { error: linesError } = await client.from("postit_reporting_lines").insert(
        leaderIds.map((leaderPersonId) => ({
          provider_id: access.providerId,
          subordinate_person_id: personId,
          leader_person_id: leaderPersonId,
          created_by: context.userId,
        })),
      );
      if (linesError) throw new Error(linesError.message);
    }

    if (saved.data.user_id) {
      if ((data.cityNames ?? []).length) {
        await client
          .from("profiles")
          .update({ city: data.cityNames?.[0] })
          .eq("id", saved.data.user_id)
          .eq("provider_id", access.providerId);
      }
      const primaryLeader = leaderIds.length
        ? await client.from("postit_people").select("user_id").eq("id", leaderIds[0]).maybeSingle()
        : { data: null };
      const { error: legacyError } = await client.from("postit_members").upsert(
        {
          provider_id: access.providerId,
          user_id: saved.data.user_id,
          department_id: data.departmentId || null,
          role: data.role,
          supervisor_user_id: primaryLeader.data?.user_id || null,
          active: data.active ?? true,
          created_by: context.userId,
        },
        { onConflict: "provider_id,user_id" },
      );
      if (legacyError) throw new Error(legacyError.message);
    }
    await insertEvent(client, access, "person_saved", {
      details: {
        person_id: personId,
        role: data.role,
        position_title: data.positionTitle.trim(),
        leader_person_ids: leaderIds,
        city_names: data.cityNames ?? [],
        group_ids: groupIds,
        led_group_ids: ledGroupIds,
        department_responsible: Boolean(data.departmentResponsible),
      },
    });
    await notify(client, {
      providerId: access.providerId,
      recipientUserId: saved.data.user_id,
      type: "access_granted",
      title: "Acesso ao Postit! liberado",
      message: "Você agora participa da gestão de pendências e reuniões GR.",
      dedupeKey: `${personId}:access-granted`,
    });
    return { ok: true, personId };
  });

function randomPostitPassword() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url") + "#1";
}

async function nextPostitLogin(client: AnyDb, providerId: string) {
  const { data, error } = await client
    .from("provider_login_accounts")
    .select("login")
    .eq("provider_id", providerId)
    .ilike("login", "pst%");
  if (error) throw new Error(error.message);
  let next = 1;
  const taken = new Set<string>();
  for (const row of data ?? []) {
    const login = String(row.login).toLowerCase();
    taken.add(login);
    const match = /^pst(\d+)$/.exec(login);
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  let candidate = `pst${String(next).padStart(2, "0")}`;
  while (taken.has(candidate)) {
    next += 1;
    candidate = `pst${String(next).padStart(2, "0")}`;
  }
  return candidate;
}

export const issuePostitCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { personId: string }) => data)
  .handler(async ({ data, context }) => {
    const access = await requireManager(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const { data: person, error: personError } = await client
      .from("postit_people")
      .select("id, user_id, full_name, email, city_names, department_id, role, active")
      .eq("id", data.personId)
      .eq("provider_id", access.providerId)
      .maybeSingle();
    if (personError) throw new Error(personError.message);
    if (!person?.active) throw new Error("Pessoa não encontrada ou inativa.");

    if (person.user_id) {
      const { data: existingAccount } = await client
        .from("provider_login_accounts")
        .select("id")
        .eq("provider_id", access.providerId)
        .eq("user_id", person.user_id)
        .maybeSingle();
      if (existingAccount) throw new Error("Esta pessoa já possui login e senha.");
    }

    const { data: provider, error: providerError } = await client
      .from("providers")
      .select("slug")
      .eq("id", access.providerId)
      .single();
    if (providerError || !provider) throw new Error("Provedor não encontrado.");
    const login = await nextPostitLogin(client, access.providerId);
    const password = randomPostitPassword();
    const syntheticEmail = `${login}@${provider.slug}.checktecnico.local`;
    const primaryCity = cleanCityNames(person.city_names)[0] || "Postit";
    let userId = (person.user_id as string | null) ?? null;
    let signInEmail = syntheticEmail;
    let createdNewUser = false;

    if (userId) {
      const { data: authUser, error: authUserError } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      if (authUserError || !authUser.user) throw new Error("Conta vinculada não encontrada.");
      signInEmail = authUser.user.email || person.email || syntheticEmail;
      const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: { ...authUser.user.user_metadata, postit_only: true },
      });
      if (passwordError) throw new Error(passwordError.message);
    } else {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: person.full_name,
          city: primaryCity,
          login,
          postit_only: true,
        },
      });
      if (createError || !created.user) {
        throw new Error(createError?.message || "Não foi possível criar a conta.");
      }
      userId = created.user.id;
      createdNewUser = true;
    }

    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);
    const { error: profileError } = await client.from("profiles").upsert(
      {
        id: userId,
        provider_id: access.providerId,
        email: signInEmail,
        full_name: person.full_name,
        city: primaryCity,
        active: true,
        must_change_password: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(profileError.message);
    if (createdNewUser) {
      const { error: rolesError } = await client.from("user_roles").delete().eq("user_id", userId);
      if (rolesError) throw new Error(rolesError.message);
    }
    const { error: accountError } = await client.from("provider_login_accounts").insert({
      user_id: userId,
      provider_id: access.providerId,
      login,
      password_hash: passwordHash,
      supabase_email: signInEmail,
      active: true,
      created_by: context.userId,
    });
    if (accountError) throw new Error(accountError.message);
    const { error: personLinkError } = await client
      .from("postit_people")
      .update({ user_id: userId })
      .eq("id", person.id)
      .eq("provider_id", access.providerId);
    if (personLinkError) throw new Error(personLinkError.message);

    const { data: primaryLine } = await client
      .from("postit_reporting_lines")
      .select("leader_person_id")
      .eq("provider_id", access.providerId)
      .eq("subordinate_person_id", person.id)
      .limit(1)
      .maybeSingle();
    let supervisorUserId: string | null = null;
    if (primaryLine?.leader_person_id) {
      const { data: supervisor } = await client
        .from("postit_people")
        .select("user_id")
        .eq("id", primaryLine.leader_person_id)
        .maybeSingle();
      supervisorUserId = supervisor?.user_id || null;
    }
    const { error: memberError } = await client.from("postit_members").upsert(
      {
        provider_id: access.providerId,
        user_id: userId,
        department_id: person.department_id,
        role: person.role,
        supervisor_user_id: supervisorUserId,
        active: true,
        created_by: context.userId,
      },
      { onConflict: "provider_id,user_id" },
    );
    if (memberError) throw new Error(memberError.message);
    await insertEvent(client, access, "credential_issued", {
      details: { person_id: person.id, login },
    });
    return { ok: true, login, password };
  });

export const resetPostitCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const access = await requireManager(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const { data: account, error: accountError } = await client
      .from("provider_login_accounts")
      .select("id, user_id, login")
      .eq("id", data.accountId)
      .eq("provider_id", access.providerId)
      .maybeSingle();
    if (accountError) throw new Error(accountError.message);
    if (!account) throw new Error("Credencial não encontrada.");
    const password = randomPostitPassword();
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(account.user_id, {
      password,
    });
    if (authError) throw new Error(authError.message);
    const bcrypt = await import("bcryptjs");
    const passwordHash = await bcrypt.hash(password, 10);
    const { error: updateError } = await client
      .from("provider_login_accounts")
      .update({ password_hash: passwordHash, active: true })
      .eq("id", account.id);
    if (updateError) throw new Error(updateError.message);
    await client.from("profiles").update({ must_change_password: true }).eq("id", account.user_id);
    await insertEvent(client, access, "credential_reset", {
      details: { account_id: account.id, login: account.login },
    });
    return { ok: true, login: account.login as string, password };
  });

export const createPostitMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      departmentId?: string | null;
      meetingType: "managerial" | "sector" | "sporadic";
      scheduledAt: string;
    }) => {
      if (data.title.trim().length < 3) throw new Error("Informe o nome da reunião.");
      if (!data.scheduledAt) throw new Error("Informe a data da reunião.");
      if (data.meetingType === "sector" && !data.departmentId) {
        throw new Error("Selecione o setor da GR setorial.");
      }
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    if (!access.canManage && !["leader"].includes(access.memberRole ?? "")) {
      throw new Error("Somente líderes e gestores podem abrir reuniões GR.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const { data: created, error } = await client
      .from("postit_meetings")
      .insert({
        provider_id: access.providerId,
        department_id: data.meetingType === "sector" ? data.departmentId || null : null,
        title: data.title.trim(),
        meeting_type: data.meetingType,
        scheduled_at: data.scheduledAt,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await insertEvent(client, access, "meeting_created", { meetingId: created.id });
    return { id: created.id as string };
  });

export const closePostitMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { meetingId: string; notes?: string }) => data)
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const { data: meeting } = await client
      .from("postit_meetings")
      .select("created_by")
      .eq("id", data.meetingId)
      .eq("provider_id", access.providerId)
      .maybeSingle();
    if (!meeting) throw new Error("Reunião não encontrada.");
    if (!access.canManage && meeting.created_by !== context.userId) {
      throw new Error("Você não pode encerrar esta reunião.");
    }
    const { error } = await client
      .from("postit_meetings")
      .update({
        status: "closed",
        ended_at: new Date().toISOString(),
        notes: data.notes?.trim() || null,
      })
      .eq("id", data.meetingId)
      .eq("provider_id", access.providerId);
    if (error) throw new Error(error.message);
    await insertEvent(client, access, "meeting_closed", { meetingId: data.meetingId });
    return { ok: true };
  });

export const createPostitItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      description: string;
      departmentId: string;
      groupId?: string | null;
      assigneePersonIds: string[];
      meetingId?: string | null;
      sourceType?: "meeting" | "sector" | "managerial" | "sporadic" | "standalone";
      dueDate: string;
      priority: PostitPriority;
    }) => {
      if (data.title.trim().length < 3) throw new Error("Informe o assunto do post-it.");
      if (data.description.trim().length < 3)
        throw new Error("Descreva o que precisa ser resolvido.");
      const assignees = [...new Set(data.assigneePersonIds ?? [])];
      if (!data.departmentId || !assignees.length || !data.dueDate) {
        throw new Error("Preencha setor, responsável e prazo.");
      }
      if (assignees.length > 2) throw new Error("Cada post-it pode ter no máximo duas pessoas.");
      if (data.sourceType === "meeting" && !data.meetingId) {
        throw new Error("Selecione a reunião de origem.");
      }
      if (data.dueDate < brazilToday()) throw new Error("O prazo não pode estar no passado.");
      return { ...data, assigneePersonIds: assignees };
    },
  )
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const [departmentResult, peopleResult] = await Promise.all([
      client
        .from("postit_departments")
        .select("id")
        .eq("id", data.departmentId)
        .eq("provider_id", access.providerId)
        .eq("active", true)
        .maybeSingle(),
      client
        .from("postit_people")
        .select("id, user_id, full_name")
        .eq("provider_id", access.providerId)
        .eq("active", true)
        .in("id", data.assigneePersonIds),
    ]);
    if (departmentResult.error) throw new Error(departmentResult.error.message);
    if (peopleResult.error) throw new Error(peopleResult.error.message);
    const department = departmentResult.data;
    const responsiblePeople = peopleResult.data;
    if (!department) throw new Error("Setor inválido.");
    if ((responsiblePeople ?? []).length !== data.assigneePersonIds.length) {
      throw new Error("Uma das pessoas selecionadas está inativa ou não pertence ao Postit!.");
    }
    const allowedIds = await getAssignablePersonIds(client, access);
    if (data.assigneePersonIds.some((personId) => !allowedIds.includes(personId))) {
      throw new Error("Você só pode abrir post-its para seus líderes ou liderados autorizados.");
    }

    let groupId = data.groupId || null;
    if (!groupId) {
      const candidatePeople = [access.personId, ...data.assigneePersonIds].filter(Boolean);
      const { data: memberships, error: membershipsError } = await client
        .from("postit_person_groups")
        .select("group_id")
        .eq("provider_id", access.providerId)
        .in("person_id", candidatePeople.length ? candidatePeople : [context.userId]);
      if (membershipsError) throw new Error(membershipsError.message);
      const candidateGroupIds = (memberships ?? []).map((row: any) => row.group_id as string);
      if (candidateGroupIds.length) {
        const { data: matchingGroup } = await client
          .from("postit_groups")
          .select("id")
          .eq("provider_id", access.providerId)
          .eq("department_id", data.departmentId)
          .eq("active", true)
          .in("id", candidateGroupIds)
          .limit(1)
          .maybeSingle();
        groupId = matchingGroup?.id || null;
      }
    }
    if (groupId) {
      const { data: selectedGroup, error: selectedGroupError } = await client
        .from("postit_groups")
        .select("id, department_id, active")
        .eq("id", groupId)
        .eq("provider_id", access.providerId)
        .maybeSingle();
      if (selectedGroupError) throw new Error(selectedGroupError.message);
      if (!selectedGroup?.active || selectedGroup.department_id !== data.departmentId) {
        throw new Error("O grupo não pertence ao setor selecionado.");
      }
      const selectableGroupIds = await getSelectableGroupIds(client, access);
      if (!selectableGroupIds.includes(groupId)) {
        throw new Error("Você não possui acesso para abrir post-its neste grupo.");
      }
    }

    const primaryPerson = (responsiblePeople ?? []).find(
      (person: any) => person.id === data.assigneePersonIds[0],
    );
    const { data: primaryLeaderLines, error: primaryLeaderLinesError } = await client
      .from("postit_reporting_lines")
      .select("leader_person_id")
      .eq("provider_id", access.providerId)
      .eq("subordinate_person_id", data.assigneePersonIds[0]);
    if (primaryLeaderLinesError) throw new Error(primaryLeaderLinesError.message);
    let managerPersonId = (primaryLeaderLines?.[0]?.leader_person_id as string | null) ?? null;
    if (groupId && (primaryLeaderLines ?? []).length > 1) {
      const leaderIds = primaryLeaderLines.map((line: any) => line.leader_person_id as string);
      const { data: groupLeader } = await client
        .from("postit_person_groups")
        .select("person_id")
        .eq("provider_id", access.providerId)
        .eq("group_id", groupId)
        .eq("is_leader", true)
        .in("person_id", leaderIds)
        .limit(1)
        .maybeSingle();
      if (groupLeader?.person_id) managerPersonId = groupLeader.person_id as string;
    }
    let managerUserId: string | null = null;
    if (managerPersonId) {
      const { data: managerPerson } = await client
        .from("postit_people")
        .select("user_id")
        .eq("id", managerPersonId)
        .eq("provider_id", access.providerId)
        .maybeSingle();
      managerUserId = (managerPerson?.user_id as string | null) ?? null;
    }
    const sourceType = data.sourceType ?? (data.meetingId ? "meeting" : "standalone");
    const reviewMeetingId =
      sourceType === "sporadic" ? await getOrCreateNextManagerialMeeting(client, access) : null;
    const meetingId = data.meetingId || reviewMeetingId;
    const { data: created, error } = await client
      .from("postit_items")
      .insert({
        provider_id: access.providerId,
        title: data.title.trim(),
        description: data.description.trim(),
        department_id: data.departmentId,
        group_id: groupId,
        responsible_user_id: primaryPerson?.user_id || null,
        creator_user_id: context.userId,
        manager_user_id: managerUserId,
        creator_person_id: access.personId,
        primary_assignee_person_id: data.assigneePersonIds[0],
        manager_person_id: managerPersonId,
        meeting_id: meetingId,
        review_meeting_id: reviewMeetingId,
        source_type: sourceType,
        priority: data.priority,
        initial_due_date: data.dueDate,
        current_due_date: data.dueDate,
      })
      .select("id, code")
      .single();
    if (error) throw new Error(error.message);
    const { error: assigneeError } = await client.from("postit_assignees").insert(
      data.assigneePersonIds.map((personId, index) => ({
        provider_id: access.providerId,
        postit_id: created.id,
        person_id: personId,
        assignment_order: index + 1,
        assigned_by: context.userId,
      })),
    );
    if (assigneeError) throw new Error(assigneeError.message);
    const { error: deadlineError } = await client.from("postit_deadline_history").insert({
      provider_id: access.providerId,
      postit_id: created.id,
      sequence: 0,
      previous_due_date: null,
      new_due_date: data.dueDate,
      reason: "Prazo inicial definido na abertura",
      requested_by: context.userId,
    });
    if (deadlineError) throw new Error(deadlineError.message);
    await insertEvent(client, access, "postit_created", {
      postitId: created.id,
      details: {
        assignee_person_ids: data.assigneePersonIds,
        due_date: data.dueDate,
        source_type: sourceType,
        group_id: groupId,
        review_meeting_id: reviewMeetingId,
      },
    });
    for (const person of responsiblePeople ?? []) {
      await notify(client, {
        providerId: access.providerId,
        recipientUserId: person.user_id,
        postitId: created.id,
        type: "assigned",
        title: `Novo post-it ${created.code}`,
        message: `Você recebeu a pendência “${data.title.trim()}”, com prazo até ${data.dueDate}.`,
        dedupeKey: `${created.id}:assigned:${person.id}`,
      });
    }
    return { id: created.id as string, code: created.code as string };
  });

async function getItemForAction(client: AnyDb, providerId: string, postitId: string) {
  const { data, error } = await client
    .from("postit_items")
    .select("*")
    .eq("id", postitId)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Post-it não encontrado.");
  return data;
}

async function getItemAssigneePeople(client: AnyDb, providerId: string, postitId: string) {
  const { data: assignments, error: assignmentError } = await client
    .from("postit_assignees")
    .select("person_id, assignment_order")
    .eq("provider_id", providerId)
    .eq("postit_id", postitId)
    .order("assignment_order");
  if (assignmentError) throw new Error(assignmentError.message);
  const personIds = (assignments ?? []).map((assignment: any) => assignment.person_id as string);
  if (!personIds.length) return [];
  const { data: people, error: peopleError } = await client
    .from("postit_people")
    .select("id, user_id, full_name")
    .eq("provider_id", providerId)
    .in("id", personIds);
  if (peopleError) throw new Error(peopleError.message);
  return personIds
    .map((id: string) => (people ?? []).find((person: any) => person.id === id))
    .filter(Boolean);
}

async function canOperateItem(client: AnyDb, access: AccessContext, item: any) {
  if (
    access.canAdminister ||
    item.responsible_user_id === access.userId ||
    item.creator_user_id === access.userId ||
    item.manager_user_id === access.userId ||
    (access.personId && [item.creator_person_id, item.manager_person_id].includes(access.personId))
  ) {
    return true;
  }
  if (!access.personId) return false;
  const [assignment, groupLeadership, coverage] = await Promise.all([
    client
      .from("postit_assignees")
      .select("id")
      .eq("postit_id", item.id)
      .eq("person_id", access.personId)
      .maybeSingle(),
    item.group_id
      ? client
          .from("postit_person_groups")
          .select("id")
          .eq("group_id", item.group_id)
          .eq("person_id", access.personId)
          .eq("is_leader", true)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    item.group_id
      ? client
          .from("postit_visibility_grants")
          .select("id, ends_at")
          .eq("group_id", item.group_id)
          .eq("grantee_person_id", access.personId)
          .eq("active", true)
          .lte("starts_at", new Date().toISOString())
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (assignment.error) throw new Error(assignment.error.message);
  if (groupLeadership.error) throw new Error(groupLeadership.error.message);
  if (coverage.error) throw new Error(coverage.error.message);
  const coverageActive =
    coverage.data && (!coverage.data.ends_at || coverage.data.ends_at > new Date().toISOString());
  return Boolean(assignment.data || groupLeadership.data || coverageActive);
}

export const startPostitItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { postitId: string }) => data)
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const item = await getItemForAction(client, access.providerId, data.postitId);
    if (!(await canOperateItem(client, access, item)))
      throw new Error("Você não pode movimentar este post-it.");
    if (!["open", "overdue"].includes(item.status))
      throw new Error("Este post-it não pode ser iniciado.");
    const nextStatus = item.current_due_date < brazilToday() ? "overdue" : "in_progress";
    const { error } = await client
      .from("postit_items")
      .update({ status: nextStatus })
      .eq("id", data.postitId)
      .eq("provider_id", access.providerId);
    if (error) throw new Error(error.message);
    await insertEvent(client, access, "work_started", { postitId: data.postitId });
    return { ok: true };
  });

export const extendPostitDeadline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { postitId: string; newDueDate: string; reason: string }) => {
    if (!data.newDueDate) throw new Error("Informe a nova data.");
    if (data.reason.trim().length < 5) throw new Error("Explique o motivo da prorrogação.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const item = await getItemForAction(client, access.providerId, data.postitId);
    if (!(await canOperateItem(client, access, item)))
      throw new Error("Você não pode prorrogar este post-it.");
    if (["completed", "cancelled", "awaiting_validation"].includes(item.status)) {
      throw new Error("Este post-it não aceita nova data.");
    }
    if (Number(item.extension_count) >= 2) {
      throw new Error(
        "As duas prorrogações já foram utilizadas. O post-it deve subir para a gestão.",
      );
    }
    if (data.newDueDate <= item.current_due_date || data.newDueDate <= brazilToday()) {
      throw new Error("A nova data deve ser posterior ao prazo atual e a hoje.");
    }
    const sequence = Number(item.extension_count) + 1;
    const { error } = await client
      .from("postit_items")
      .update({
        current_due_date: data.newDueDate,
        extension_count: sequence,
        status: "in_progress",
        escalation_level: 0,
      })
      .eq("id", data.postitId)
      .eq("provider_id", access.providerId)
      .eq("extension_count", item.extension_count);
    if (error) throw new Error(error.message);
    await client.from("postit_deadline_history").insert({
      provider_id: access.providerId,
      postit_id: data.postitId,
      sequence,
      previous_due_date: item.current_due_date,
      new_due_date: data.newDueDate,
      reason: data.reason.trim(),
      requested_by: context.userId,
    });
    await insertEvent(client, access, "deadline_extended", {
      postitId: data.postitId,
      details: {
        sequence,
        previous: item.current_due_date,
        next: data.newDueDate,
        reason: data.reason.trim(),
      },
    });
    if (sequence === 2) {
      await notify(client, {
        providerId: access.providerId,
        recipientUserId: item.manager_user_id,
        postitId: data.postitId,
        type: "last_deadline",
        title: `${item.code} está no último prazo`,
        message: `A pendência “${item.title}” recebeu a segunda e última prorrogação.`,
        dedupeKey: `${item.id}:last-deadline`,
      });
    }
    return { ok: true, extensionCount: sequence };
  });

export const submitPostitCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { postitId: string; note: string; evidenceUrl?: string }) => {
    if (data.note.trim().length < 5) throw new Error("Descreva o que foi realizado.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const item = await getItemForAction(client, access.providerId, data.postitId);
    if (!(await canOperateItem(client, access, item)))
      throw new Error("Você não pode concluir este post-it.");
    if (["completed", "cancelled"].includes(item.status))
      throw new Error("Este post-it já foi encerrado.");
    const { error } = await client
      .from("postit_items")
      .update({
        status: "awaiting_validation",
        completion_note: data.note.trim(),
        completion_evidence_url: data.evidenceUrl?.trim() || null,
        completion_submitted_at: new Date().toISOString(),
      })
      .eq("id", data.postitId)
      .eq("provider_id", access.providerId);
    if (error) throw new Error(error.message);
    await insertEvent(client, access, "completion_submitted", { postitId: data.postitId });
    for (const recipient of new Set([item.creator_user_id, item.manager_user_id].filter(Boolean))) {
      await notify(client, {
        providerId: access.providerId,
        recipientUserId: recipient as string,
        postitId: data.postitId,
        type: "awaiting_validation",
        title: `${item.code} aguarda validação`,
        message: `A conclusão de “${item.title}” foi enviada para conferência.`,
        dedupeKey: `${item.id}:awaiting-validation:${Date.now()}`,
      });
    }
    return { ok: true };
  });

export const validatePostitCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { postitId: string; approved: boolean; note?: string }) => data)
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const item = await getItemForAction(client, access.providerId, data.postitId);
    if (item.status !== "awaiting_validation")
      throw new Error("Este post-it não aguarda validação.");
    const canValidate =
      access.canAdminister ||
      item.creator_user_id === context.userId ||
      item.manager_user_id === context.userId ||
      (access.personId &&
        [item.creator_person_id, item.manager_person_id].includes(access.personId));
    if (!canValidate) throw new Error("Você não pode validar esta conclusão.");
    if (!data.approved && (data.note?.trim().length ?? 0) < 5) {
      throw new Error("Explique o motivo da devolução.");
    }
    const { error } = await client
      .from("postit_items")
      .update(
        data.approved
          ? {
              status: "completed",
              validated_at: new Date().toISOString(),
              validated_by: context.userId,
            }
          : {
              status: item.current_due_date < brazilToday() ? "overdue" : "in_progress",
              completion_submitted_at: null,
              validated_at: null,
              validated_by: null,
            },
      )
      .eq("id", data.postitId)
      .eq("provider_id", access.providerId);
    if (error) throw new Error(error.message);
    if (data.note?.trim()) {
      await client.from("postit_comments").insert({
        provider_id: access.providerId,
        postit_id: data.postitId,
        author_user_id: context.userId,
        body: data.note.trim(),
      });
    }
    await insertEvent(
      client,
      access,
      data.approved ? "completion_approved" : "completion_rejected",
      {
        postitId: data.postitId,
        details: { note: data.note?.trim() || null },
      },
    );
    for (const person of await getItemAssigneePeople(client, access.providerId, item.id)) {
      await notify(client, {
        providerId: access.providerId,
        recipientUserId: person.user_id,
        postitId: data.postitId,
        type: data.approved ? "completed" : "completion_rejected",
        title: data.approved ? `${item.code} concluído` : `${item.code} devolvido`,
        message: data.approved
          ? `A conclusão de “${item.title}” foi aprovada.`
          : `A conclusão de “${item.title}” precisa de ajustes.`,
        dedupeKey: `${item.id}:validation:${Date.now()}:${person.id}`,
      });
    }
    return { ok: true };
  });

export const addPostitComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { postitId: string; body: string }) => {
    if (!data.body.trim()) throw new Error("Escreva o comentário.");
    return data;
  })
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const item = await getItemForAction(client, access.providerId, data.postitId);
    if (!(await canOperateItem(client, access, item))) {
      throw new Error("Você não pode comentar neste post-it.");
    }
    const { error } = await client.from("postit_comments").insert({
      provider_id: access.providerId,
      postit_id: data.postitId,
      author_user_id: context.userId,
      body: data.body.trim(),
    });
    if (error) throw new Error(error.message);
    await insertEvent(client, access, "comment_added", { postitId: data.postitId });
    return { ok: true };
  });

export const markPostitNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await db(supabaseAdmin)
      .from("postit_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("provider_id", access.providerId)
      .eq("recipient_user_id", context.userId)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
