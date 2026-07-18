// Server-only helper para regenerar snapshots do checklist quando ocorrem
// mudanças na cadeia de diagnósticos (upload novo ou revogação).
// Cria uma nova versão em `checklist_document_snapshots`, marca a anterior
// como `replaced` e inclui um resumo dos diagnósticos ativos no payload.

import { computeDocumentHash, generatePublicToken } from "@/lib/document-hash";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [k: string]: JsonValue } | JsonValue[];

export interface DiagnosticSnapshotSummary {
  report_id: string;
  session_id: string;
  test_stage: string;
  report_sequence: number;
  sha256_short: string;
  size_bytes: number;
  agent_version: string | null;
  generated_at: string | null;
  created_at: string;
  original_filename: string;
  status: string;
}

export interface RegenerateResult {
  id: string;
  version: number;
  public_token: string;
  document_hash: string;
}

/**
 * Regenera o snapshot público do checklist informado.
 * - Marca o snapshot ativo anterior como `replaced` e liga `replaced_by_snapshot_id`.
 * - Cria uma nova versão contendo o resumo de todos os diagnósticos ativos.
 */
export async function regenerateChecklistSnapshot(
  checklistId: string,
): Promise<RegenerateResult | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: chk } = await supabaseAdmin
    .from("checklists")
    .select("*")
    .eq("id", checklistId)
    .maybeSingle();
  if (!chk || chk.status !== "finalizado") return null;

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("full_name, assinatura")
    .eq("id", chk.tecnico_id)
    .maybeSingle();

  const { data: diags } = await supabaseAdmin
    .from("checklist_diagnostic_reports")
    .select(
      "id, diagnostic_session_id, test_stage, report_sequence, sha256, size_bytes, agent_version, generated_at, created_at, original_filename, status",
    )
    .eq("case_id", (chk as unknown as { case_id: string }).case_id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const diagnostics: DiagnosticSnapshotSummary[] = (diags ?? []).map((d) => {
    const row = d as unknown as {
      id: string;
      diagnostic_session_id: string;
      test_stage: string;
      report_sequence: number;
      sha256: string;
      size_bytes: number;
      agent_version: string | null;
      generated_at: string | null;
      created_at: string;
      original_filename: string;
      status: string;
    };
    return {
      report_id: row.id,
      session_id: row.diagnostic_session_id,
      test_stage: row.test_stage,
      report_sequence: row.report_sequence,
      sha256_short: row.sha256.slice(0, 12),
      size_bytes: row.size_bytes,
      agent_version: row.agent_version,
      generated_at: row.generated_at,
      created_at: row.created_at,
      original_filename: row.original_filename,
      status: row.status,
    };
  });

  const revisionNumber =
    (chk as unknown as { revision_number?: number }).revision_number ?? 1;
  const base = chk.numero_publico || chk.codigo_validacao || "";
  const checklistCode = base
    ? revisionNumber > 1
      ? `${base}-R${revisionNumber}`
      : base
    : null;

  const payload = {
    tipo: (chk.tipo as string) ?? "validacao_ont",
    header: {
      os: chk.os,
      cliente: chk.cliente,
      cidade: chk.cidade,
      endereco: chk.endereco,
      plano: chk.plano,
      modelo: chk.modelo,
      serial: chk.serial,
      cto_porta: chk.cto_porta,
      data_atendimento: chk.data_atendimento,
      hora_atendimento: chk.hora_atendimento,
      troca_realizada: chk.troca_realizada,
      modelo_ont_retirada: chk.modelo_ont_retirada,
      serial_ont_retirada: chk.serial_ont_retirada,
      modelo_ont_instalada: chk.modelo_ont_instalada,
      serial_ont_instalada: chk.serial_ont_instalada,
    },
    dados: (chk.dados as unknown as { [k: string]: JsonValue }) ?? {},
    tecnico: {
      full_name: (prof?.full_name as string | undefined) ?? "",
      assinatura: (prof?.assinatura as string | null | undefined) ?? null,
    },
    numero_publico: chk.numero_publico,
    codigo_validacao: chk.codigo_validacao,
    finalizado_em: chk.finalizado_em,
    created_at: new Date().toISOString(),
    revision_number: revisionNumber,
    checklist_code: checklistCode,
    diagnostics,
  } as unknown as Record<string, JsonValue>;

  const document_hash = await computeDocumentHash(payload);
  const public_token = generatePublicToken(32);

  const { data: last } = await supabaseAdmin
    .from("checklist_document_snapshots")
    .select("id, version")
    .eq("checklist_id", checklistId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last) {
    await supabaseAdmin
      .from("checklist_document_snapshots")
      .update({ public_status: "replaced" })
      .eq("id", last.id)
      .eq("public_status", "active");
  }

  const nextVersion = (last?.version ?? 0) + 1;

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("checklist_document_snapshots")
    .insert({
      checklist_id: checklistId,
      version: nextVersion,
      public_token,
      public_status: "active",
      snapshot_data: payload as never,
      document_hash,
      finalized_at:
        (chk as unknown as { finalizado_em: string | null }).finalizado_em ??
        new Date().toISOString(),
      created_by: (chk as unknown as { tecnico_id: string }).tecnico_id,
    })
    .select("id")
    .single();
  if (insErr) return null;

  if (last) {
    await supabaseAdmin
      .from("checklist_document_snapshots")
      .update({ replaced_by_snapshot_id: inserted.id })
      .eq("id", last.id);
  }

  return { id: inserted.id, version: nextVersion, public_token, document_hash };
}
