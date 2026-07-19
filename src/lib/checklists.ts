import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import {
  emptyChecklistData,
  emptyInstalacaoData,
  type ChecklistData,
  type ChecklistRow,
  type FotoRow,
  type InstalacaoData,
  type TipoChecklist,
} from "./checklist-schema";

export type ChecklistListRow = ChecklistRow & {
  tecnico_nome: string;
};

type ChecklistDbRow = Database["public"]["Tables"]["checklists"]["Row"];
type ChecklistDbInsert = Database["public"]["Tables"]["checklists"]["Insert"];
type ChecklistDbUpdate = Database["public"]["Tables"]["checklists"]["Update"];

function checklistDataAsJson(data: ChecklistData | InstalacaoData): Json {
  return data as unknown as Json;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeChecklistData(saved: Record<string, unknown>): ChecklistData {
  const base = emptyChecklistData();
  return {
    ...base,
    ...saved,
    sintoma: { ...base.sintoma, ...(isRecord(saved.sintoma) ? saved.sintoma : {}) },
    validacao_fisica: {
      ...base.validacao_fisica,
      ...(isRecord(saved.validacao_fisica) ? saved.validacao_fisica : {}),
    },
    teste_cabeado: {
      ...base.teste_cabeado,
      ...(isRecord(saved.teste_cabeado) ? saved.teste_cabeado : {}),
    },
    teste_wifi: {
      ...base.teste_wifi,
      ...(isRecord(saved.teste_wifi) ? saved.teste_wifi : {}),
    },
    evidencias_marcadas: {
      ...base.evidencias_marcadas,
      ...(isRecord(saved.evidencias_marcadas) ? saved.evidencias_marcadas : {}),
    },
    resultado_final: {
      ...base.resultado_final,
      ...(isRecord(saved.resultado_final) ? saved.resultado_final : {}),
    },
    noc: { ...base.noc, ...(isRecord(saved.noc) ? saved.noc : {}) },
  } as ChecklistData;
}

function mergeInstalacaoData(saved: Record<string, unknown>): InstalacaoData {
  const base = emptyInstalacaoData();
  return {
    ...base,
    ...saved,
    itens: { ...base.itens, ...(isRecord(saved.itens) ? saved.itens : {}) },
    velocidade: {
      ...base.velocidade,
      ...(isRecord(saved.velocidade) ? saved.velocidade : {}),
    },
  } as InstalacaoData;
}

function normalizeRow(row: ChecklistDbRow): ChecklistRow {
  const tipo: TipoChecklist = (row.tipo as TipoChecklist) ?? "validacao_ont";
  const savedData =
    row.dados && typeof row.dados === "object" && !Array.isArray(row.dados) ? row.dados : {};
  return {
    ...row,
    tipo,
    dados: tipo === "instalacao" ? mergeInstalacaoData(savedData) : mergeChecklistData(savedData),
  } as unknown as ChecklistRow;
}

export async function listChecklists(opts: {
  scope: "mine" | "all";
  userId: string;
}): Promise<ChecklistListRow[]> {
  let q = supabase.from("checklists").select("*").order("created_at", { ascending: false });
  if (opts.scope === "mine") q = q.eq("tecnico_id", opts.userId);
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []).map(normalizeRow);
  const technicianIds = [...new Set(rows.map((row) => row.tecnico_id))];
  if (technicianIds.length === 0) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", technicianIds);
  if (profilesError) throw profilesError;

  const technicianNameById = new Map(
    (profiles ?? []).map((profile) => [profile.id, profile.full_name.trim()]),
  );
  return rows.map((row) => ({
    ...row,
    tecnico_nome: technicianNameById.get(row.tecnico_id) || "Técnico não identificado",
  }));
}

export async function getChecklist(id: string): Promise<ChecklistRow> {
  const { data, error } = await supabase.from("checklists").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Checklist não encontrado.");
  return normalizeRow(data);
}

export async function createDraft(
  userId: string,
  tipo: TipoChecklist = "validacao_ont",
): Promise<string> {
  const dados = tipo === "instalacao" ? emptyInstalacaoData() : emptyChecklistData();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("provider_id")
    .eq("id", userId)
    .single();
  if (profileError || !profile) throw new Error("Provedor do técnico não encontrado.");
  const draft: ChecklistDbInsert = {
    tecnico_id: userId,
    provider_id: profile.provider_id,
    status: "rascunho",
    tipo,
    dados: checklistDataAsJson(dados),
  };
  const { data, error } = await supabase.from("checklists").insert(draft).select("id").single();
  if (error) throw error;
  return data.id;
}

export async function updateChecklist(
  id: string,
  patch: Partial<
    Pick<
      ChecklistRow,
      | "os"
      | "cliente"
      | "cidade"
      | "endereco"
      | "plano"
      | "modelo"
      | "serial"
      | "cto_porta"
      | "data_atendimento"
      | "hora_atendimento"
      | "troca_realizada"
      | "modelo_ont_retirada"
      | "serial_ont_retirada"
      | "modelo_ont_instalada"
      | "serial_ont_instalada"
    >
  > & { dados?: ChecklistData | InstalacaoData },
): Promise<void> {
  const { dados, ...fields } = patch;
  const databasePatch: ChecklistDbUpdate = {
    ...fields,
    ...(dados ? { dados: checklistDataAsJson(dados) } : {}),
  };
  const { error } = await supabase.from("checklists").update(databasePatch).eq("id", id);
  if (error) throw error;
}

export async function finalizeChecklist(id: string): Promise<ChecklistRow> {
  const { data, error } = await supabase
    .from("checklists")
    .update({ status: "finalizado" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return normalizeRow(data);
}

export async function deleteChecklist(id: string): Promise<void> {
  const { error } = await supabase.from("checklists").delete().eq("id", id);
  if (error) throw error;
}

export async function listFotos(checklistId: string): Promise<FotoRow[]> {
  const { data, error } = await supabase
    .from("checklist_fotos")
    .select("*")
    .eq("checklist_id", checklistId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FotoRow[];
}

export async function uploadFoto(params: {
  checklistId: string;
  tecnicoId: string;
  categoria: FotoRow["categoria"];
  file: File;
}): Promise<FotoRow> {
  const ext = params.file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${params.tecnicoId}/${params.checklistId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("evidencias").upload(path, params.file, {
    contentType: params.file.type || "image/jpeg",
    upsert: false,
  });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("checklist_fotos")
    .insert({
      checklist_id: params.checklistId,
      tecnico_id: params.tecnicoId,
      categoria: params.categoria,
      storage_path: path,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as FotoRow;
}

export async function deleteFoto(foto: FotoRow): Promise<void> {
  await supabase.storage.from("evidencias").remove([foto.storage_path]);
  const { error } = await supabase.from("checklist_fotos").delete().eq("id", foto.id);
  if (error) throw error;
}

export async function signedFotoUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from("evidencias")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
