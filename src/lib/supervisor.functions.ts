import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface SupervisorOption {
  id: string;
  full_name: string;
  cities: string[];
}

/** Lista supervisores do provedor atual (para vincular técnicos). */
export const listProviderSupervisors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SupervisorOption[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: actor } = await supabaseAdmin
      .from("profiles")
      .select("provider_id, platform_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!actor) return [];
    const isPlatform = Boolean(actor.platform_admin);
    const providerId = actor.provider_id as string | null;

    const { data: sups, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "supervisor" as never);
    if (error) throw new Error(error.message);
    const ids = (sups ?? []).map((r) => r.user_id);
    if (ids.length === 0) return [];

    let profQ = supabaseAdmin
      .from("profiles")
      .select("id, full_name, provider_id, active")
      .in("id", ids)
      .eq("active", true);
    if (!isPlatform && providerId) profQ = profQ.eq("provider_id", providerId);
    const { data: profs, error: pErr } = await profQ;
    if (pErr) throw new Error(pErr.message);

    const { data: cities } = await supabaseAdmin
      .from("supervisor_cities")
      .select("supervisor_id, city")
      .in("supervisor_id", (profs ?? []).map((p) => p.id));
    const byId = new Map<string, string[]>();
    for (const row of cities ?? []) {
      const list = byId.get(row.supervisor_id) ?? [];
      list.push(row.city);
      byId.set(row.supervisor_id, list);
    }

    return (profs ?? [])
      .map((p) => ({ id: p.id, full_name: p.full_name || "(sem nome)", cities: byId.get(p.id) ?? [] }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, "pt-BR"));
  });

/** Aprovar/reprovar um checklist. Usa RPC review_checklist (segurança + escopo). */
export const reviewChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { checklistId: string; decision: "aprovado" | "reprovado"; comment?: string }) => {
    if (!data.checklistId) throw new Error("Checklist inválido.");
    if (!["aprovado", "reprovado"].includes(data.decision))
      throw new Error("Decisão inválida.");
    if (data.decision === "reprovado" && (!data.comment || data.comment.trim().length < 3))
      throw new Error("Descreva o motivo da reprovação (mín. 3 caracteres).");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { data: r, error } = await context.supabase.rpc("review_checklist", {
      _id: data.checklistId,
      _decision: data.decision,
      _comment: data.comment ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return r;
  });
