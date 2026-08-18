// Canal Ético — operações internas do RH (exigem permissão explícita).
import { sanitizeText, WB_BUCKET } from "@/lib/whistleblower.server";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ctx = { supabase: any; userId: string };

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as any;
}

export async function assertWbAccess(context: Ctx) {
  const db = await admin();
  const { data: allowed } = await db.rpc("has_whistleblower_access", { _user_id: context.userId });
  if (!allowed) throw new Error("Acesso restrito: este módulo é confidencial.");
  const { data: profile } = await db
    .from("profiles")
    .select("provider_id, platform_admin")
    .eq("id", context.userId)
    .maybeSingle();
  if (!profile?.provider_id) throw new Error("Perfil sem provedor vinculado.");
  return { db, providerId: profile.provider_id as string, platformAdmin: Boolean(profile.platform_admin) };
}

async function logAccess(
  db: any,
  providerId: string,
  userId: string,
  reportId: string | null,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  await db.from("whistleblower_access_logs").insert({
    provider_id: providerId,
    report_id: reportId,
    user_id: userId,
    action,
    metadata,
  });
}

export async function accessInfo(context: Ctx) {
  const db = await admin();
  const [{ data: allowed }, { data: profile }, { data: isAdmin }] = await Promise.all([
    db.rpc("has_whistleblower_access", { _user_id: context.userId }),
    db.from("profiles").select("provider_id, platform_admin").eq("id", context.userId).maybeSingle(),
    db.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
  ]);
  return {
    hasAccess: Boolean(allowed),
    canManage: Boolean(profile?.platform_admin) || Boolean(isAdmin),
    providerId: (profile?.provider_id as string | null) ?? null,
  };
}

export async function listReports(context: Ctx, filters: Record<string, string | undefined>) {
  const { db, providerId } = await assertWbAccess(context);
  let q = db
    .from("whistleblower_reports")
    .select(
      "id, protocol, report_type, category_slug, category_label, title, status, priority, unit, city, assigned_to, created_at, updated_at, first_analysis_at, closed_at",
    )
    .eq("provider_id", providerId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.category) q = q.eq("category_slug", filters.category);
  if (filters.priority) q = q.eq("priority", filters.priority);
  if (filters.unit) q = q.ilike("unit", `%${filters.unit}%`);
  if (filters.city) q = q.ilike("city", `%${filters.city}%`);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getReport(context: Ctx, id: string) {
  const { db, providerId } = await assertWbAccess(context);
  const { data: report, error } = await db
    .from("whistleblower_reports")
    .select("*")
    .eq("id", id)
    .eq("provider_id", providerId)
    .maybeSingle();
  if (error || !report) throw new Error("Denúncia não encontrada.");
  const [{ data: messages }, { data: history }, { data: notes }, { data: attachments }, { data: logs }] =
    await Promise.all([
      db
        .from("whistleblower_messages")
        .select("id, sender_type, message, created_at, sender_user_id")
        .eq("report_id", id)
        .order("created_at"),
      db.from("whistleblower_status_history").select("*").eq("report_id", id).order("created_at"),
      db.from("whistleblower_internal_notes").select("*").eq("report_id", id).order("created_at"),
      db
        .from("whistleblower_attachments")
        .select("id, display_name, mime_type, size_bytes, origin, created_at")
        .eq("report_id", id)
        .order("created_at"),
      db
        .from("whistleblower_access_logs")
        .select("id, action, created_at, user_id, metadata")
        .eq("report_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  const userIds = new Set<string>();
  (notes ?? []).forEach((n: any) => userIds.add(n.author_user_id));
  (logs ?? []).forEach((l: any) => l.user_id && userIds.add(l.user_id));
  (messages ?? []).forEach((m: any) => m.sender_user_id && userIds.add(m.sender_user_id));
  if (report.assigned_to) userIds.add(report.assigned_to);
  const names: Record<string, string> = {};
  if (userIds.size) {
    const { data: profiles } = await db
      .from("profiles")
      .select("id, full_name")
      .in("id", Array.from(userIds));
    (profiles ?? []).forEach((p: any) => (names[p.id] = p.full_name));
  }

  await logAccess(db, providerId, context.userId, id, "view");

  return { report, messages: messages ?? [], history: history ?? [], notes: notes ?? [], attachments: attachments ?? [], logs: logs ?? [], names };
}

export async function updateReport(
  context: Ctx,
  input: {
    id: string;
    status?: string;
    priority?: string;
    assignedTo?: string | null;
    conclusion?: string | null;
    publicNote?: string;
  },
) {
  const { db, providerId } = await assertWbAccess(context);
  const { data: current } = await db
    .from("whistleblower_reports")
    .select("status, first_analysis_at, provider_id")
    .eq("id", input.id)
    .maybeSingle();
  if (!current || current.provider_id !== providerId) throw new Error("Denúncia não encontrada.");

  const patch: Record<string, unknown> = {};
  if (input.status) patch.status = input.status;
  if (input.priority) patch.priority = input.priority;
  if (input.assignedTo !== undefined) patch.assigned_to = input.assignedTo || null;
  if (input.conclusion !== undefined) patch.conclusion = sanitizeText(input.conclusion, 8000);
  if (input.status && input.status !== "RECEBIDA" && !current.first_analysis_at)
    patch.first_analysis_at = new Date().toISOString();
  if (input.status === "CONCLUIDA" || input.status === "ARQUIVADA") patch.closed_at = new Date().toISOString();

  const { error } = await db.from("whistleblower_reports").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);

  if (input.status && input.status !== current.status) {
    await db.from("whistleblower_status_history").insert({
      report_id: input.id,
      event_type: "status",
      from_status: current.status,
      to_status: input.status,
      public_note: sanitizeText(input.publicNote, 500),
      actor_user_id: context.userId,
      is_public: true,
    });
  } else if (input.publicNote) {
    await db.from("whistleblower_status_history").insert({
      report_id: input.id,
      event_type: "note",
      public_note: sanitizeText(input.publicNote, 500),
      actor_user_id: context.userId,
      is_public: true,
    });
  }
  await logAccess(db, providerId, context.userId, input.id, "update", patch);
  return { ok: true };
}

export async function addInternalNote(context: Ctx, input: { id: string; note: string }) {
  const { db, providerId } = await assertWbAccess(context);
  const note = sanitizeText(input.note, 5000);
  if (!note) throw new Error("Escreva a nota interna.");
  const { error } = await db
    .from("whistleblower_internal_notes")
    .insert({ report_id: input.id, author_user_id: context.userId, note });
  if (error) throw new Error(error.message);
  await logAccess(db, providerId, context.userId, input.id, "internal_note");
  return { ok: true };
}

export async function postRhMessage(context: Ctx, input: { id: string; message: string }) {
  const { db, providerId } = await assertWbAccess(context);
  const message = sanitizeText(input.message, 5000);
  if (!message) throw new Error("Escreva a mensagem.");
  const { error } = await db.from("whistleblower_messages").insert({
    report_id: input.id,
    sender_type: "RH",
    sender_user_id: context.userId,
    message,
  });
  if (error) throw new Error(error.message);
  await logAccess(db, providerId, context.userId, input.id, "message");
  return { ok: true };
}

export async function attachmentUrl(context: Ctx, input: { attachmentId: string }) {
  const { db, providerId } = await assertWbAccess(context);
  const { data: att } = await db
    .from("whistleblower_attachments")
    .select("storage_path, report_id")
    .eq("id", input.attachmentId)
    .maybeSingle();
  if (!att) throw new Error("Evidência não encontrada.");
  const { data: report } = await db
    .from("whistleblower_reports")
    .select("provider_id")
    .eq("id", att.report_id)
    .maybeSingle();
  if (report?.provider_id !== providerId) throw new Error("Evidência não encontrada.");
  const { data } = await db.storage.from(WB_BUCKET).createSignedUrl(att.storage_path, 300);
  await logAccess(db, providerId, context.userId, att.report_id, "download", { attachment: input.attachmentId });
  if (!data?.signedUrl) throw new Error("Não foi possível abrir a evidência.");
  return { url: data.signedUrl as string };
}

export async function listChannelMembers(context: Ctx) {
  const { db, providerId, platformAdmin } = await assertWbAccess(context);
  const [{ data: members }, { data: users }] = await Promise.all([
    db.from("whistleblower_access").select("id, user_id, created_at").eq("provider_id", providerId),
    db.from("profiles").select("id, full_name, email").eq("provider_id", providerId).eq("active", true),
  ]);
  return { members: members ?? [], users: users ?? [], platformAdmin };
}

export async function setChannelMember(context: Ctx, input: { userId: string; grant: boolean }) {
  const { db, providerId, platformAdmin } = await assertWbAccess(context);
  const { data: isAdmin } = await db.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!platformAdmin && !isAdmin) throw new Error("Somente administradores podem conceder acesso.");
  if (input.grant) {
    await db
      .from("whistleblower_access")
      .upsert(
        { provider_id: providerId, user_id: input.userId, granted_by: context.userId },
        { onConflict: "provider_id,user_id" },
      );
  } else {
    await db
      .from("whistleblower_access")
      .delete()
      .eq("provider_id", providerId)
      .eq("user_id", input.userId);
  }
  await logAccess(db, providerId, context.userId, null, input.grant ? "grant_access" : "revoke_access", {
    target: input.userId,
  });
  return { ok: true };
}

export async function logExport(context: Ctx, input: { id: string; kind: string }) {
  const { db, providerId } = await assertWbAccess(context);
  await logAccess(db, providerId, context.userId, input.id, "export", { kind: input.kind });
  return { ok: true };
}
