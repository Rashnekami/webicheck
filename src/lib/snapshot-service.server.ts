// Helper exclusivamente server-side para versionar o documento público.
// Sempre publica a revisão finalizada canônica do atendimento e inclui todos
// os diagnósticos ativos do caso, com hash SHA-256 completo.

import { computeDocumentHash, generatePublicToken } from "@/lib/document-hash";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | JsonValue[];

export interface DiagnosticSnapshotSummary {
  report_id: string;
  session_id: string;
  test_stage: string;
  report_sequence: number;
  sha256: string;
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
  checklist_id: string;
}

export async function regenerateChecklistSnapshot(
  requestedChecklistId: string,
): Promise<RegenerateResult | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: requested, error: requestedError } = await supabaseAdmin
    .from("checklists")
    .select("case_id")
    .eq("id", requestedChecklistId)
    .maybeSingle();
  if (requestedError) throw new Error(requestedError.message);
  if (!requested) return null;

  // Uma revisão corrente pode estar em rascunho. Nesse intervalo o documento
  // público permanece baseado na revisão finalizada mais recente, sem anexar
  // dados de rascunho ou regenerar uma versão histórica antiga.
  const { data: finalizedRows, error: checklistError } = await supabaseAdmin
    .from("checklists")
    .select("*")
    .eq("case_id", requested.case_id)
    .eq("status", "finalizado")
    .order("revision_number", { ascending: false })
    .limit(1);
  if (checklistError) throw new Error(checklistError.message);
  const checklist = finalizedRows?.[0];
  if (!checklist) return null;

  const { data: technician, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("full_name, assinatura")
    .eq("id", checklist.tecnico_id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const { data: diagnosticRows, error: diagnosticsError } = await supabaseAdmin
    .from("checklist_diagnostic_reports")
    .select(
      "id, diagnostic_session_id, test_stage, report_sequence, sha256, size_bytes, agent_version, generated_at, created_at, original_filename, status",
    )
    .eq("case_id", checklist.case_id)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (diagnosticsError) throw new Error(diagnosticsError.message);

  const diagnostics: DiagnosticSnapshotSummary[] = (diagnosticRows ?? []).map((row) => ({
    report_id: row.id,
    session_id: row.diagnostic_session_id,
    test_stage: row.test_stage,
    report_sequence: row.report_sequence,
    sha256: row.sha256,
    sha256_short: row.sha256.slice(0, 12),
    size_bytes: row.size_bytes,
    agent_version: row.agent_version,
    generated_at: row.generated_at,
    created_at: row.created_at,
    original_filename: row.original_filename,
    status: row.status,
  }));

  const revisionNumber = checklist.revision_number ?? 1;
  const base = checklist.numero_publico || checklist.codigo_validacao || "";
  const checklistCode = base ? (revisionNumber > 1 ? `${base}-R${revisionNumber}` : base) : null;

  const payload = {
    tipo: checklist.tipo ?? "validacao_ont",
    header: {
      os: checklist.os,
      cliente: checklist.cliente,
      cidade: checklist.cidade,
      endereco: checklist.endereco,
      plano: checklist.plano,
      modelo: checklist.modelo,
      serial: checklist.serial,
      cto_porta: checklist.cto_porta,
      data_atendimento: checklist.data_atendimento,
      hora_atendimento: checklist.hora_atendimento,
      troca_realizada: checklist.troca_realizada,
      modelo_ont_retirada: checklist.modelo_ont_retirada,
      serial_ont_retirada: checklist.serial_ont_retirada,
      modelo_ont_instalada: checklist.modelo_ont_instalada,
      serial_ont_instalada: checklist.serial_ont_instalada,
    },
    dados: (checklist.dados as unknown as { [key: string]: JsonValue }) ?? {},
    tecnico: {
      full_name: technician?.full_name ?? "",
      assinatura: technician?.assinatura ?? null,
    },
    numero_publico: checklist.numero_publico,
    codigo_validacao: checklist.codigo_validacao,
    finalizado_em: checklist.finalizado_em,
    snapshot_created_at: new Date().toISOString(),
    revision_number: revisionNumber,
    checklist_code: checklistCode,
    diagnostics,
  } as unknown as Record<string, JsonValue>;

  const documentHash = await computeDocumentHash(payload);
  const publicToken = generatePublicToken(32);

  const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc("create_snapshot_version", {
    _checklist_id: checklist.id,
    _snapshot_data: payload as never,
    _document_hash: documentHash,
    _public_token: publicToken,
    _finalized_at: checklist.finalizado_em ?? new Date().toISOString(),
    _created_by: checklist.tecnico_id,
  });
  if (rpcError) throw new Error(rpcError.message);

  const first = Array.isArray(rpcRows) ? rpcRows[0] : rpcRows;
  if (!first) throw new Error("snapshot_rpc_returned_no_row");

  return {
    id: first.id as string,
    version: first.version as number,
    public_token: publicToken,
    document_hash: documentHash,
    checklist_id: checklist.id,
  };
}
