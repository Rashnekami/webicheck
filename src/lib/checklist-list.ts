import { supabase } from "@/integrations/supabase/client";
import type { ChecklistRow } from "@/lib/checklist-schema";

export type ChecklistSummaryRow = Pick<
  ChecklistRow,
  | "id"
  | "tecnico_id"
  | "status"
  | "tipo"
  | "os"
  | "cliente"
  | "cidade"
  | "serial"
  | "codigo_validacao"
  | "numero_publico"
  | "exchange_ticket_code"
  | "review_status"
  | "locked_for_rework"
  | "revision_number"
  | "created_at"
  | "updated_at"
> & { tecnico_nome: string; cto_codigo: string | null; rmap_code: string | null };

export const CHECKLIST_PAGE_SIZE = 10;

export async function listChecklistPage(opts: {
  scope: "mine" | "all";
  status: "todos" | "rascunho" | "finalizado";
  search: string;
  page: number;
  signal?: AbortSignal;
}): Promise<{ items: ChecklistSummaryRow[]; total: number }> {
  const page = Number.isFinite(opts.page) ? Math.max(1, Math.trunc(opts.page)) : 1;
  const start = (page - 1) * CHECKLIST_PAGE_SIZE;
  // Local RPC contract until Supabase regenerates its generated types.
  let query = supabase
    .rpc(
      "list_checklist_summaries" as never,
      {
        _mine: opts.scope === "mine",
        _status: opts.status,
        _search: opts.search.trim(),
      } as never,
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + CHECKLIST_PAGE_SIZE - 1);
  if (opts.signal) query = query.abortSignal(opts.signal);
  const { data, error, count } = await query.returns<ChecklistSummaryRow[]>();
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}
