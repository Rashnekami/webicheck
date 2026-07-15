import { supabase } from "@/integrations/supabase/client";
import {
  emptyChecklistData,
  emptyInstalacaoData,
  type ChecklistData,
  type ChecklistRow,
  type FotoRow,
  type InstalacaoData,
  type TipoChecklist,
} from "./checklist-schema";

function normalizeRow(row: any): ChecklistRow {
  const tipo: TipoChecklist = (row.tipo as TipoChecklist) ?? "validacao_ont";
  const base =
    tipo === "instalacao" ? emptyInstalacaoData() : emptyChecklistData();
  return {
    ...row,
    tipo,
    dados: { ...(base as any), ...(row.dados ?? {}) },
  } as ChecklistRow;
}

export async function listChecklists(opts: {
  scope: "mine" | "all";
  userId: string;
}): Promise<ChecklistRow[]> {
  let q = supabase
    .from("checklists")
    .select("*")
    .order("created_at", { ascending: false });
  if (opts.scope === "mine") q = q.eq("tecnico_id", opts.userId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(normalizeRow);
}

export async function getChecklist(id: string): Promise<ChecklistRow> {
  const { data, error } = await supabase
    .from("checklists")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Checklist não encontrado.");
  return normalizeRow(data);
}

export async function createDraft(
  userId: string,
  tipo: TipoChecklist = "validacao_ont",
): Promise<string> {
  const dados =
    tipo === "instalacao" ? emptyInstalacaoData() : emptyChecklistData();
  const { data, error } = await supabase
    .from("checklists")
    .insert({
      tecnico_id: userId,
      status: "rascunho",
      tipo,
      dados: dados as any,
    } as any)
    .select("id")
    .single();
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
  const { error } = await supabase
    .from("checklists")
    .update(patch as any)
    .eq("id", id);
  if (error) throw error;
}

export async function finalizeChecklist(id: string): Promise<ChecklistRow> {
  const { data, error } = await supabase
    .from("checklists")
    .update({ status: "finalizado" } as any)
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
  const { error: upErr } = await supabase.storage
    .from("evidencias")
    .upload(path, params.file, {
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
  const { error } = await supabase
    .from("checklist_fotos")
    .delete()
    .eq("id", foto.id);
  if (error) throw error;
}

export async function signedFotoUrl(
  path: string,
  expiresIn = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from("evidencias")
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
