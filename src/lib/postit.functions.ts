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
  responsible_user_id: string;
  creator_user_id: string;
  manager_user_id: string | null;
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
}

export interface PostitWorkspace {
  access: PostitAccess;
  currentUserId: string;
  departments: any[];
  members: any[];
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

async function getAccessContext(userId: string): Promise<AccessContext> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = db(supabaseAdmin);
  const [{ data: profile, error: profileError }, { data: isAppAdmin }] = await Promise.all([
    client
      .from("profiles")
      .select("provider_id, platform_admin, active")
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
    };
  }

  const { data: member } = await client
    .from("postit_members")
    .select("role, active")
    .eq("provider_id", providerId)
    .eq("user_id", userId)
    .maybeSingle();
  const memberRole = member?.active ? (member.role as PostitMemberRole) : null;
  const platformAdmin = Boolean(profile.platform_admin);
  const appAdmin = Boolean(isAppAdmin);
  const canAdminister =
    platformAdmin || appAdmin || memberRole === "admin" || memberRole === "director";
  const canManage = canAdminister || memberRole === "manager";
  return {
    userId,
    providerId,
    memberRole,
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
    await notify(client, {
      providerId: context.providerId,
      recipientUserId: item.responsible_user_id,
      postitId: item.id,
      type: escalated ? "escalated" : "overdue",
      title: escalated ? `${item.code} escalado` : `${item.code} fora do prazo`,
      message: escalated
        ? `A pendência “${item.title}” esgotou os três prazos e foi encaminhada à gestão.`
        : `A pendência “${item.title}” venceu. Registre a justificativa e a nova data.`,
      dedupeKey: `${item.id}:${nextStatus}:${today}`,
    });
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

    const [departments, members, meetings, items, deadlines, comments, attachments, notifications] =
      await Promise.all([
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
      meetings,
      items,
      deadlines,
      comments,
      attachments,
      notifications,
    ]) {
      if (result.error) throw new Error(result.error.message);
    }

    const memberUserIds = (members.data ?? [])
      .filter((m: any) => m.active)
      .map((m: any) => m.user_id);
    let profilesQuery = client
      .from("profiles")
      .select("id, full_name, email, city")
      .eq("provider_id", access.providerId)
      .eq("active", true)
      .order("full_name");
    if (!access.canAdminister) {
      profilesQuery = profilesQuery.in(
        "id",
        memberUserIds.length ? memberUserIds : [context.userId],
      );
    }
    const { data: profiles, error: profilesError } = await profilesQuery;
    if (profilesError) throw new Error(profilesError.message);

    const { userId: _userId, ...publicAccess } = access;
    return {
      access: publicAccess,
      currentUserId: context.userId,
      departments: departments.data ?? [],
      members: members.data ?? [],
      meetings: meetings.data ?? [],
      items: items.data ?? [],
      deadlines: deadlines.data ?? [],
      comments: comments.data ?? [],
      attachments: attachments.data ?? [],
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

export const savePostitMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      userId: string;
      departmentId?: string | null;
      role: PostitMemberRole;
      supervisorUserId?: string | null;
      active?: boolean;
    }) => {
      if (!data.userId) throw new Error("Selecione a pessoa.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const access = await requireManager(context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const { data: profile } = await client
      .from("profiles")
      .select("id, provider_id")
      .eq("id", data.userId)
      .maybeSingle();
    if (profile?.provider_id !== access.providerId) throw new Error("Pessoa fora do seu provedor.");
    if (data.supervisorUserId === data.userId)
      throw new Error("A pessoa não pode ser gestora de si mesma.");
    if (data.departmentId) {
      const { data: department } = await client
        .from("postit_departments")
        .select("id")
        .eq("id", data.departmentId)
        .eq("provider_id", access.providerId)
        .maybeSingle();
      if (!department) throw new Error("Setor inválido.");
    }
    if (data.supervisorUserId) {
      const { data: supervisor } = await client
        .from("postit_members")
        .select("provider_id, role, active")
        .eq("provider_id", access.providerId)
        .eq("user_id", data.supervisorUserId)
        .maybeSingle();
      if (
        supervisor?.provider_id !== access.providerId ||
        !supervisor.active ||
        !["leader", "manager", "director", "admin"].includes(supervisor.role)
      ) {
        throw new Error("O gestor precisa estar ativo no Postit! como líder ou gerente.");
      }
    }
    const { error } = await client.from("postit_members").upsert(
      {
        provider_id: access.providerId,
        user_id: data.userId,
        department_id: data.departmentId || null,
        role: data.role,
        supervisor_user_id: data.supervisorUserId || null,
        active: data.active ?? true,
        created_by: context.userId,
      },
      { onConflict: "provider_id,user_id" },
    );
    if (error) throw new Error(error.message);
    await insertEvent(client, access, "member_saved", {
      details: { user_id: data.userId, role: data.role, department_id: data.departmentId },
    });
    await notify(client, {
      providerId: access.providerId,
      recipientUserId: data.userId,
      type: "access_granted",
      title: "Acesso ao Postit! liberado",
      message: "Você agora participa da gestão de pendências e reuniões GR.",
      dedupeKey: `${data.userId}:access-granted`,
    });
    return { ok: true };
  });

export const createPostitMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      title: string;
      departmentId?: string | null;
      meetingType: "general" | "sector";
      scheduledAt: string;
    }) => {
      if (data.title.trim().length < 3) throw new Error("Informe o nome da reunião.");
      if (!data.scheduledAt) throw new Error("Informe a data da reunião.");
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
        department_id: data.meetingType === "general" ? null : data.departmentId || null,
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
      responsibleUserId: string;
      meetingId?: string | null;
      dueDate: string;
      priority: PostitPriority;
    }) => {
      if (data.title.trim().length < 3) throw new Error("Informe o assunto do post-it.");
      if (data.description.trim().length < 3)
        throw new Error("Descreva o que precisa ser resolvido.");
      if (!data.departmentId || !data.responsibleUserId || !data.dueDate) {
        throw new Error("Preencha setor, responsável e prazo.");
      }
      if (data.dueDate < brazilToday()) throw new Error("O prazo não pode estar no passado.");
      return data;
    },
  )
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const [{ data: department }, { data: responsible }] = await Promise.all([
      client
        .from("postit_departments")
        .select("id")
        .eq("id", data.departmentId)
        .eq("provider_id", access.providerId)
        .eq("active", true)
        .maybeSingle(),
      client
        .from("postit_members")
        .select("user_id, supervisor_user_id")
        .eq("provider_id", access.providerId)
        .eq("user_id", data.responsibleUserId)
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (!department) throw new Error("Setor inválido.");
    if (!responsible) throw new Error("O responsável ainda não possui acesso ao Postit!.");
    let managerUserId = responsible.supervisor_user_id as string | null;
    if (!managerUserId) {
      const { data: fallbackManager } = await client
        .from("postit_members")
        .select("user_id")
        .eq("provider_id", access.providerId)
        .eq("department_id", data.departmentId)
        .eq("active", true)
        .in("role", ["manager", "director", "admin"])
        .limit(1)
        .maybeSingle();
      managerUserId = (fallbackManager?.user_id as string | null) ?? null;
    }
    const { data: created, error } = await client
      .from("postit_items")
      .insert({
        provider_id: access.providerId,
        title: data.title.trim(),
        description: data.description.trim(),
        department_id: data.departmentId,
        responsible_user_id: data.responsibleUserId,
        creator_user_id: context.userId,
        manager_user_id: managerUserId,
        meeting_id: data.meetingId || null,
        priority: data.priority,
        initial_due_date: data.dueDate,
        current_due_date: data.dueDate,
      })
      .select("id, code")
      .single();
    if (error) throw new Error(error.message);
    await client.from("postit_deadline_history").insert({
      provider_id: access.providerId,
      postit_id: created.id,
      sequence: 0,
      previous_due_date: null,
      new_due_date: data.dueDate,
      reason: "Prazo inicial definido na abertura",
      requested_by: context.userId,
    });
    await insertEvent(client, access, "postit_created", {
      postitId: created.id,
      details: { responsible_user_id: data.responsibleUserId, due_date: data.dueDate },
    });
    await notify(client, {
      providerId: access.providerId,
      recipientUserId: data.responsibleUserId,
      postitId: created.id,
      type: "assigned",
      title: `Novo post-it ${created.code}`,
      message: `Você recebeu a pendência “${data.title.trim()}”, com prazo até ${data.dueDate}.`,
      dedupeKey: `${created.id}:assigned`,
    });
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

function canOperateItem(access: AccessContext, item: any) {
  return (
    access.canManage ||
    item.responsible_user_id === access.userId ||
    item.creator_user_id === access.userId ||
    item.manager_user_id === access.userId
  );
}

export const startPostitItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { postitId: string }) => data)
  .handler(async ({ data, context }) => {
    const access = await requireAccess(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const client = db(supabaseAdmin);
    const item = await getItemForAction(client, access.providerId, data.postitId);
    if (!canOperateItem(access, item)) throw new Error("Você não pode movimentar este post-it.");
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
    if (!canOperateItem(access, item)) throw new Error("Você não pode prorrogar este post-it.");
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
    if (!canOperateItem(access, item)) throw new Error("Você não pode concluir este post-it.");
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
      access.canManage ||
      item.creator_user_id === context.userId ||
      item.manager_user_id === context.userId;
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
    await notify(client, {
      providerId: access.providerId,
      recipientUserId: item.responsible_user_id,
      postitId: data.postitId,
      type: data.approved ? "completed" : "completion_rejected",
      title: data.approved ? `${item.code} concluído` : `${item.code} devolvido`,
      message: data.approved
        ? `A conclusão de “${item.title}” foi aprovada.`
        : `A conclusão de “${item.title}” precisa de ajustes.`,
      dedupeKey: `${item.id}:validation:${Date.now()}`,
    });
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
    await getItemForAction(client, access.providerId, data.postitId);
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
