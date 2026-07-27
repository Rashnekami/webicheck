import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensurePlatformAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.platform_admin) throw new Error("Acesso restrito ao dono da plataforma.");
}

async function ensureCanDeleteChecklist(userId: string, checklistId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("platform_admin, provider_id")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.platform_admin) return;
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Somente administradores podem apagar checklists finalizados.");
  const { data: cl } = await supabaseAdmin
    .from("checklists")
    .select("provider_id")
    .eq("id", checklistId)
    .maybeSingle();
  if (!cl) throw new Error("Checklist não encontrado.");
  if (cl.provider_id !== profile?.provider_id)
    throw new Error("Checklist pertence a outro provedor.");
}


export const deleteChecklistCascade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { checklistId: string }) => {
    if (!data.checklistId) throw new Error("Checklist inválido.");
    return data;
  })
  .handler(async ({ data, context }) => {
    await ensureCanDeleteChecklist(context.userId, data.checklistId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Coletar case_id para apagar todos os relacionados do caso, se for a última revisão
    const { data: cl, error: clErr } = await supabaseAdmin
      .from("checklists")
      .select("id, case_id")
      .eq("id", data.checklistId)
      .maybeSingle();
    if (clErr) throw new Error(clErr.message);
    if (!cl) throw new Error("Checklist não encontrado.");

    // Ordem: contra-provas -> tickets -> fotos -> snapshots -> reports -> logs -> checklists
    const tables: Array<{ table: string; col: string }> = [
      { table: "customer_counterproof_events", col: "checklist_id" },
      { table: "customer_counterproofs", col: "checklist_id" },
      { table: "ont_exchange_tickets", col: "checklist_id" },
      { table: "checklist_fotos", col: "checklist_id" },
      { table: "checklist_document_snapshots", col: "checklist_id" },
      { table: "checklist_diagnostic_reports", col: "checklist_id" },
      { table: "checklist_public_access_logs", col: "checklist_id" },
    ];
    for (const { table, col } of tables) {
      const { error } = await supabaseAdmin.from(table as never).delete().eq(col, data.checklistId);
      if (error && !error.message.includes("does not exist"))
        throw new Error(`${table}: ${error.message}`);
    }

    const { error: delErr } = await supabaseAdmin
      .from("checklists")
      .delete()
      .eq("id", data.checklistId);
    if (delErr) throw new Error(delErr.message);
    return { ok: true, case_id: cl.case_id };
  });

export const listAllProviders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensurePlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("providers")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      name: string;
      slug: string;
      primary_color?: string | null;
      accent_color?: string | null;
      pdf_template?: "dark-neon" | "light-classic";
      logo_url?: string | null;
    }) => {
      const name = data.name?.trim();
      const slug = data.slug?.trim().toLowerCase();
      if (!name || name.length < 2) throw new Error("Informe o nome do provedor.");
      if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug))
        throw new Error("Slug inválido (use minúsculas, números e hífen).");
      const tpl = data.pdf_template ?? "dark-neon";
      if (!["dark-neon", "light-classic"].includes(tpl))
        throw new Error("Template de PDF inválido.");
      return {
        name,
        slug,
        primary_color: data.primary_color?.trim() || null,
        accent_color: data.accent_color?.trim() || null,
        pdf_template: tpl,
        logo_url: data.logo_url?.trim() || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await ensurePlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin
      .from("providers")
      .insert({
        name: data.name,
        slug: data.slug,
        status: "active",
        primary_color: data.primary_color,
        accent_color: data.accent_color,
        pdf_template: data.pdf_template,
        logo_url: data.logo_url,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return created;
  });

export const updateProviderBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      providerId: string;
      name?: string;
      primary_color?: string | null;
      accent_color?: string | null;
      pdf_template?: "dark-neon" | "light-classic";
      logo_url?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await ensurePlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.primary_color !== undefined) patch.primary_color = data.primary_color;
    if (data.accent_color !== undefined) patch.accent_color = data.accent_color;
    if (data.pdf_template !== undefined) patch.pdf_template = data.pdf_template;
    if (data.logo_url !== undefined) patch.logo_url = data.logo_url;
    const { error } = await supabaseAdmin
      .from("providers")
      .update(patch as never)
      .eq("id", data.providerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
