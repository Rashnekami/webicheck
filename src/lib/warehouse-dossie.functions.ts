import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evaluateDossieAccess,
  type DossieAccessResult,
} from "@/lib/dossie-access";
import type {
  ChecklistData,
  ChecklistRow,
  FotoRow,
  InstalacaoData,
} from "@/lib/checklist-schema";
import type { DiagnosticReportRow } from "@/lib/webi-diagnostic.functions";

export interface DossieRevision {
  checklist: ChecklistRow & {
    case_id: string;
    revision_number: number;
    service_stage: string;
    revision_reason: string | null;
    parent_checklist_id: string | null;
    is_current: boolean;
  };
  tecnico: {
    id: string;
    full_name: string;
    email: string;
    assinatura: string | null;
  } | null;
  fotos: (FotoRow & { signed_url: string | null })[];
  diagnostics: (DiagnosticReportRow & { signed_url: string | null })[];
}

export interface DossieBundle {
  ticket: {
    id: string;
    ticket_code: string;
    provider_id: string;
    case_id: string;
    exchanged_at: string;
    client_name: string | null;
    service_order: string | null;
    city: string | null;
    reason: string;
    removed_model: string | null;
    removed_serial: string | null;
    installed_model: string | null;
    installed_serial: string | null;
    technician_name: string | null;
  } | null;
  provider: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  case_id: string;
  revisions: DossieRevision[];
}

function accessError(res: Extract<DossieAccessResult, { ok: false }>): Error {
  const err = new Error(res.reason);
  (err as unknown as { status: number }).status = res.code;
  return err;
}

/**
 * Retorna o dossiê completo do atendimento (todas as revisões, fotos,
 * assinaturas e diagnósticos ativos) para admins, almoxarifes do mesmo
 * provedor ou o técnico dono. Todos os controles de autorização acontecem
 * no servidor; RLS não é suficiente para o almoxarife.
 */
export const getCaseDossieBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ticketId?: string; caseId?: string }) => {
    if (!d.ticketId && !d.caseId) throw new Error("Informe ticketId ou caseId.");
    return d;
  })
  .handler(async ({ data, context }): Promise<DossieBundle> => {
    const { supabase, userId } = context;

    // 1. Perfil e papéis do usuário autenticado (via cliente do usuário).
    const [{ data: profile }, { data: rolesRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, active, provider_id, platform_admin")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    const roles = (rolesRows ?? []).map((r) => String(r.role));

    // 2. Cliente privilegiado é necessário porque RLS de checklists/fotos
    //    não permite o almoxarife ler dados de outros técnicos.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let ticketRow: DossieBundle["ticket"] = null;
    let caseId = data.caseId ?? "";
    let providerId = "";

    if (data.ticketId) {
      const { data: t } = await supabaseAdmin
        .from("ont_exchange_tickets")
        .select(
          "id, ticket_code, provider_id, case_id, exchanged_at, client_name, service_order, city, reason, removed_model, removed_serial, installed_model, installed_serial, technician_name",
        )
        .eq("id", data.ticketId)
        .maybeSingle();
      if (!t) throw accessError({ ok: false, code: 404, reason: "ticket_not_found" });
      ticketRow = t;
      caseId = t.case_id;
      providerId = t.provider_id;
    } else if (caseId) {
      const { data: firstRev } = await supabaseAdmin
        .from("checklists")
        .select("provider_id")
        .eq("case_id", caseId)
        .limit(1)
        .maybeSingle();
      if (!firstRev) throw accessError({ ok: false, code: 404, reason: "case_not_found" });
      providerId = firstRev.provider_id;
      const { data: t } = await supabaseAdmin
        .from("ont_exchange_tickets")
        .select(
          "id, ticket_code, provider_id, case_id, exchanged_at, client_name, service_order, city, reason, removed_model, removed_serial, installed_model, installed_serial, technician_name",
        )
        .eq("case_id", caseId)
        .maybeSingle();
      ticketRow = t ?? null;
    }

    // 3. Provedor do atendimento.
    const { data: providerRow } = await supabaseAdmin
      .from("providers")
      .select("id, name, slug, status")
      .eq("id", providerId)
      .maybeSingle();

    // 4. Primeira revisão para descobrir o técnico dono do caso.
    const { data: baseRev } = await supabaseAdmin
      .from("checklists")
      .select("tecnico_id, provider_id")
      .eq("case_id", caseId)
      .order("revision_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    // 5. Autorização — sempre no servidor.
    const decision = evaluateDossieAccess({
      profile: profile
        ? { id: profile.id, active: profile.active, provider_id: profile.provider_id }
        : null,
      provider: providerRow ? { id: providerRow.id, status: providerRow.status } : null,
      case: baseRev
        ? { provider_id: baseRev.provider_id, tecnico_id: baseRev.tecnico_id }
        : null,
      roles,
      platformAdmin: profile?.platform_admin ?? false,
    });
    if (!decision.ok) throw accessError(decision);

    // 6. Todas as revisões em ordem cronológica.
    const { data: revisionRows, error: revErr } = await supabaseAdmin
      .from("checklists")
      .select("*")
      .eq("case_id", caseId)
      .order("revision_number", { ascending: true });
    if (revErr) throw new Error(revErr.message);
    const revisions = (revisionRows ?? []) as unknown as DossieRevision["checklist"][];
    if (revisions.length === 0) {
      throw accessError({ ok: false, code: 404, reason: "case_not_found" });
    }

    const revisionIds = revisions.map((r) => r.id);
    const tecnicoIds = Array.from(new Set(revisions.map((r) => r.tecnico_id)));

    // 7. Fotos, técnicos e diagnósticos em uma única rodada.
    const [{ data: fotoRows }, { data: tecRows }, { data: diagRows }] = await Promise.all([
      supabaseAdmin
        .from("checklist_fotos")
        .select("*")
        .in("checklist_id", revisionIds),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, email, assinatura")
        .in("id", tecnicoIds),
      supabaseAdmin
        .from("checklist_diagnostic_reports")
        .select(
          "id, checklist_id, case_id, diagnostic_session_id, original_filename, storage_path, sha256, size_bytes, mime_type, agent_version, generated_at, test_stage, report_sequence, status, created_at, metadata",
        )
        .eq("case_id", caseId)
        .eq("status", "active")
        .order("created_at", { ascending: true }),
    ]);

    const fotos = (fotoRows ?? []) as FotoRow[];
    const tecnicos = new Map(
      (tecRows ?? []).map((t) => [
        t.id,
        {
          id: t.id,
          full_name: t.full_name ?? "",
          email: t.email ?? "",
          assinatura: (t as { assinatura?: string | null }).assinatura ?? null,
        },
      ]),
    );
    const diagnostics = (diagRows ?? []) as DiagnosticReportRow[];

    // 8. URLs assinadas de fotos e relatórios (5 min).
    const [signedFotos, signedDiags] = await Promise.all([
      Promise.all(
        fotos.map(async (f) => {
          const { data: signed } = await supabaseAdmin.storage
            .from("evidencias")
            .createSignedUrl(f.storage_path, 300);
          return { ...f, signed_url: signed?.signedUrl ?? null };
        }),
      ),
      Promise.all(
        diagnostics.map(async (d) => {
          const { data: signed } = await supabaseAdmin.storage
            .from("webi-diagnostic-reports")
            .createSignedUrl(d.storage_path, 300);
          return { ...d, signed_url: signed?.signedUrl ?? null };
        }),
      ),
    ]);

    // 9. Montagem por revisão, sem misturar fotos/diagnósticos.
    const grouped: DossieRevision[] = revisions.map((r) => ({
      checklist: {
        ...r,
        dados: r.dados as unknown as ChecklistData | InstalacaoData,
      } as DossieRevision["checklist"],
      tecnico: tecnicos.get(r.tecnico_id) ?? null,
      fotos: signedFotos.filter((f) => f.checklist_id === r.id),
      diagnostics: signedDiags.filter((d) => d.checklist_id === r.id),
    }));

    return {
      ticket: ticketRow,
      provider: providerRow
        ? {
            id: providerRow.id,
            name: providerRow.name,
            slug: providerRow.slug,
            status: providerRow.status,
          }
        : { id: providerId, name: "", slug: "", status: "unknown" },
      case_id: caseId,
      revisions: grouped,
    };
  });
