import { beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: api }));
import { listChecklistPage } from "@/lib/checklist-list";
import { listDashboardChecklists } from "@/lib/checklists";

function query(result: unknown) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}
beforeEach(() => vi.clearAllMocks());

describe("checklist data loading", () => {
  it("fetches only the requested page, preserves literal search, and cancels stale requests", async () => {
    const builder = query({ data: [{ id: "a" }], count: 35, error: null });
    api.rpc.mockReturnValue(builder);
    const signal = new AbortController().signal;
    const result = await listChecklistPage({
      scope: "mine",
      status: "finalizado",
      search: "  João, 10%  ",
      page: 3,
      signal,
    });
    expect(api.rpc).toHaveBeenCalledWith(
      "list_checklist_summaries",
      { _mine: true, _status: "finalizado", _search: "João, 10%" },
      { count: "exact" },
    );
    expect(builder.range).toHaveBeenCalledWith(20, 29);
    expect(builder.order.mock.calls).toEqual([
      ["created_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
    expect(builder.abortSignal).toHaveBeenCalledWith(signal);
    expect(result).toEqual({ items: [{ id: "a" }], total: 35 });
  });

  it("reports a missing migration instead of showing an empty successful list", async () => {
    const error = { code: "PGRST202", message: "Function not found" };
    api.rpc.mockReturnValue(query({ data: null, count: null, error }));
    await expect(
      listChecklistPage({ scope: "all", status: "todos", search: "", page: 1 }),
    ).rejects.toEqual(error);
  });

  it("keeps fetching dashboard rows even when the API caps pages below 500", async () => {
    const first = query({
      data: [
        { id: "01", tipo: "validacao_ont", sintoma: { nao_liga: true }, noc: { autorizada: true } },
      ],
      error: null,
    });
    const second = query({
      data: [{ id: "02", tipo: "instalacao", sintoma: null, noc: null }],
      error: null,
    });
    const end = query({ data: [], error: null });
    api.from.mockReturnValueOnce(first).mockReturnValueOnce(second).mockReturnValueOnce(end);
    const rows = await listDashboardChecklists();
    expect(rows.map((row) => row.id)).toEqual(["01", "02"]);
    expect(second.gt).toHaveBeenCalledWith("id", "01");
    expect(end.gt).toHaveBeenCalledWith("id", "02");
    expect(first.eq).toHaveBeenCalledWith("is_current", true);
    expect(first.eq).toHaveBeenCalledWith("status", "finalizado");
    expect(first.in).toHaveBeenCalledWith("tipo", ["validacao_ont", "instalacao"]);
    expect(first.select.mock.calls[0][0]).not.toContain("*");
    expect(rows[0].dados).toMatchObject({ noc: { autorizada: true } });
  });

  it("does not return partial dashboard totals if a later page fails", async () => {
    api.from
      .mockReturnValueOnce(query({ data: [{ id: "01" }], error: null }))
      .mockReturnValueOnce(query({ data: null, error: { message: "Connection lost" } }));
    await expect(listDashboardChecklists()).rejects.toEqual({ message: "Connection lost" });
  });
});
