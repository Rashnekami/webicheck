import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, Cable, Split, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  getOpticalCeo,
  listOpticalCables,
  createOpticalCable,
  listOpticalFibers,
  listOpticalSplitters,
  createOpticalSplitter,
  setSplitterFeedingFiber,
  listOpticalSplitterOutputs,
  setSplitterOutput,
  listOpticalCtos,
  createOpticalCto,
} from "@/lib/optical-map.functions";
import {
  CABLE_CAPACITY_PRESETS,
  SPLITTER_TYPE_PRESETS,
  OUTPUT_STATE_LABEL,
  FIBER_STATE_LABEL,
  calcLossDb,
  classifyLoss,
  describeConnection,
} from "@/lib/optical-map";
import { fetchCeoFullData } from "@/lib/optical-map-data";
import { OpticalTree } from "@/components/optical/optical-tree";
import { generateOpticalMapPdf } from "@/components/optical/optical-map-pdf";

export const Route = createFileRoute("/_authenticated/mapa-optico/$ceoId")({
  head: () => ({ meta: [{ title: "CEO — Mapa Óptico — CheckTecnico" }, { name: "robots", content: "noindex" }] }),
  component: CeoDetailPage,
});

function CeoDetailPage() {
  const { ceoId } = Route.useParams();
  const { data: user } = useCurrentUser();
  const canWrite = !!(user?.isAdmin || user?.isSupervisor || user?.isPlatformAdmin);

  const ceoQ = useQuery({ queryKey: ["optical-ceo", ceoId], queryFn: () => getOpticalCeo({ data: { ceoId } }) });
  const cablesQ = useQuery({ queryKey: ["optical-cables", ceoId], queryFn: () => listOpticalCables({ data: { ceoId } }) });
  const splittersQ = useQuery({ queryKey: ["optical-splitters", ceoId], queryFn: () => listOpticalSplitters({ data: { ceoId } }) });
  const ctosQ = useQuery({ queryKey: ["optical-ctos"], queryFn: () => listOpticalCtos() });
  const [pdfLoading, setPdfLoading] = useState(false);

  async function handlePdf() {
    setPdfLoading(true);
    try {
      const full = await fetchCeoFullData(ceoId);
      await generateOpticalMapPdf(full);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF.");
    } finally {
      setPdfLoading(false);
    }
  }

  if (ceoQ.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (ceoQ.isError || !ceoQ.data) {
    return <div className="p-8 text-center text-sm text-rose-400">CEO não encontrada.</div>;
  }
  const ceo = ceoQ.data;
  const cables = cablesQ.data ?? [];
  const splitters = splittersQ.data ?? [];
  const ctos = ctosQ.data ?? [];

  return (
    <div className="webi-page mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="webi-header p-5 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/mapa-optico">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white">{ceo.codigo}</h1>
            <p className="text-sm text-muted-foreground">
              {ceo.nome} · {[ceo.bairro, ceo.cidade].filter(Boolean).join(" · ")}
            </p>
          </div>
          <Button size="sm" variant="outline" disabled={pdfLoading} onClick={handlePdf}>
            {pdfLoading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            Baixar PDF
          </Button>
        </div>
      </div>

      <Tabs defaultValue="cabos">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="cabos">Cabos</TabsTrigger>
          <TabsTrigger value="splitters">Splitters</TabsTrigger>
          <TabsTrigger value="arvore">Árvore</TabsTrigger>
          <TabsTrigger value="matriz">Matriz</TabsTrigger>
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
        </TabsList>

        <TabsContent value="cabos" className="pt-4">
          <CablesTab ceoId={ceoId} cables={cables} canWrite={canWrite} />
        </TabsContent>

        <TabsContent value="splitters" className="pt-4">
          <SplittersTab
            ceoId={ceoId}
            splitters={splitters}
            cables={cables}
            ctos={ctos}
            canWrite={canWrite}
          />
        </TabsContent>

        <TabsContent value="arvore" className="pt-4">
          <ArvoreTab ceoId={ceoId} />
        </TabsContent>

        <TabsContent value="matriz" className="pt-4">
          <MatrixTab splitters={splitters} />
        </TabsContent>

        <TabsContent value="resumo" className="pt-4">
          <SummaryTab ceo={ceo} cables={cables} splitters={splitters} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- Cabos ----------

function CablesTab({ ceoId, cables, canWrite }: { ceoId: string; cables: any[]; canWrite: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    codigo: "",
    capacidade: 24,
    tubos: 2,
    fibrasPorTubo: 12,
    tipo: "distribuicao",
  });

  const create = useMutation({
    mutationFn: () => createOpticalCable({ data: { ceoId, ...form } }),
    onSuccess: (r) => {
      toast.success(`Cabo criado com ${r.totalFibras} fibras geradas.`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["optical-cables", ceoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo cabo
          </Button>
        </div>
      )}
      {cables.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cabo cadastrado nesta CEO.</p>
      ) : (
        <div className="space-y-2">
          {cables.map((c) => (
            <Card key={c.id} className="webi-nav-card">
              <CardContent className="p-4">
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                >
                  <div>
                    <p className="font-semibold text-cyan-400">{c.codigo}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.capacidade}F · {c.tubos} tubos x {c.fibras_por_tubo} fibras · {c.tipo ?? "—"}
                    </p>
                  </div>
                  <Cable className="h-4 w-4 text-muted-foreground" />
                </button>
                {expanded === c.id && <FiberGrid cableId={c.id} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo cabo</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Código</Label>
              <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="TRONCO-72F" />
            </div>
            <div>
              <Label>Capacidade</Label>
              <Select
                value={String(form.capacidade)}
                onValueChange={(v) => setForm((f) => ({ ...f, capacidade: Number(v) }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CABLE_CAPACITY_PRESETS.map((c) => (
                    <SelectItem key={c} value={String(c)}>{c}F</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tubos</Label>
                <Input
                  type="number"
                  value={form.tubos}
                  onChange={(e) => setForm((f) => ({ ...f, tubos: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Fibras por tubo</Label>
                <Input
                  type="number"
                  value={form.fibrasPorTubo}
                  onChange={(e) => setForm((f) => ({ ...f, fibrasPorTubo: Number(e.target.value) }))}
                />
              </div>
            </div>
            {form.tubos * form.fibrasPorTubo !== form.capacidade && (
              <p className="text-xs text-amber-400">
                Tubos × fibras/tubo ({form.tubos * form.fibrasPorTubo}) diferente da capacidade
                informada ({form.capacidade}) — confira antes de criar.
              </p>
            )}
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="troncal">Troncal</SelectItem>
                  <SelectItem value="distribuicao">Distribuição</SelectItem>
                  <SelectItem value="reserva">Reserva</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={create.isPending || !form.codigo.trim()} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar (gera fibras automaticamente)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FiberGrid({ cableId }: { cableId: string }) {
  const fibersQ = useQuery({ queryKey: ["optical-fibers", cableId], queryFn: () => listOpticalFibers({ data: { cableId } }) });
  const fibers = fibersQ.data ?? [];
  if (fibersQ.isLoading) return <p className="mt-3 text-xs text-muted-foreground">Carregando fibras…</p>;
  return (
    <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
      {fibers.map((f: any) => (
        <div
          key={f.id}
          title={`Fibra ${f.numero_global} — Tubo ${f.tubo_numero} ${f.tubo_cor} — Fibra ${f.fibra_cor} — ${FIBER_STATE_LABEL[f.estado] ?? f.estado}`}
          className="rounded-md border border-white/10 bg-slate-900/60 p-1.5 text-center text-[10px]"
        >
          <div className="font-bold text-white">{f.numero_global}</div>
          <div className="truncate text-muted-foreground">{f.fibra_cor}</div>
        </div>
      ))}
    </div>
  );
}

// ---------- Splitters ----------

function SplittersTab({
  ceoId,
  splitters,
  cables,
  ctos,
  canWrite,
}: {
  ceoId: string;
  splitters: any[];
  cables: any[];
  ctos: any[];
  canWrite: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ctoOpen, setCtoOpen] = useState(false);
  const [ctoForm, setCtoForm] = useState({ codigo: "", nome: "" });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ codigo: "", tipo: "1x8" });

  const createCto = useMutation({
    mutationFn: () => createOpticalCto({ data: ctoForm }),
    onSuccess: () => {
      toast.success("CTO criada.");
      setCtoOpen(false);
      setCtoForm({ codigo: "", nome: "" });
      qc.invalidateQueries({ queryKey: ["optical-ctos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const create = useMutation({
    mutationFn: () => createOpticalSplitter({ data: { ceoId, ...form } }),
    onSuccess: (r) => {
      toast.success(`Splitter criado com ${r.numSaidas} saídas geradas.`);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["optical-splitters", ceoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {canWrite && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setCtoOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova CTO
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo splitter
          </Button>
        </div>
      )}
      {splitters.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum splitter cadastrado nesta CEO.</p>
      ) : (
        <div className="space-y-2">
          {splitters.map((s) => (
            <Card key={s.id} className="webi-nav-card">
              <CardContent className="p-4">
                <button
                  className="flex w-full items-center justify-between text-left"
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                >
                  <div>
                    <p className="font-semibold text-cyan-400">{s.codigo} — {s.tipo}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.num_saidas} saídas
                      {!s.fibra_alimentadora_id && (
                        <span className="ml-2 text-amber-400">⚠ sem fibra alimentadora</span>
                      )}
                    </p>
                  </div>
                  <Split className="h-4 w-4 text-muted-foreground" />
                </button>
                {expanded === s.id && (
                  <SplitterDetail
                    splitter={s}
                    cables={cables}
                    ctos={ctos}
                    canWrite={canWrite}
                    onFeedSaved={() => qc.invalidateQueries({ queryKey: ["optical-splitters", ceoId] })}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo splitter</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Código</Label>
              <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="S01" />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SPLITTER_TYPE_PRESETS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={create.isPending || !form.codigo.trim()} onClick={() => create.mutate()}>
              {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar (gera saídas automaticamente)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ctoOpen} onOpenChange={setCtoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova CTO</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Código</Label>
              <Input value={ctoForm.codigo} onChange={(e) => setCtoForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="TB-0123" />
            </div>
            <div>
              <Label>Nome</Label>
              <Input value={ctoForm.nome} onChange={(e) => setCtoForm((f) => ({ ...f, nome: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={createCto.isPending || !ctoForm.codigo.trim()} onClick={() => createCto.mutate()}>
              {createCto.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SplitterDetail({
  splitter,
  cables,
  ctos,
  canWrite,
  onFeedSaved,
}: {
  splitter: any;
  cables: any[];
  ctos: any[];
  canWrite: boolean;
  onFeedSaved: () => void;
}) {
  const qc = useQueryClient();
  const [feedCableId, setFeedCableId] = useState<string>("");
  const [feedFiberId, setFeedFiberId] = useState<string>("");
  const [feedPower, setFeedPower] = useState<string>("");

  const feedFibersQ = useQuery({
    queryKey: ["optical-fibers", feedCableId],
    queryFn: () => listOpticalFibers({ data: { cableId: feedCableId } }),
    enabled: !!feedCableId,
  });
  const outputsQ = useQuery({
    queryKey: ["optical-outputs", splitter.id],
    queryFn: () => listOpticalSplitterOutputs({ data: { splitterId: splitter.id } }),
  });

  const feedMutation = useMutation({
    mutationFn: () =>
      setSplitterFeedingFiber({
        data: {
          splitterId: splitter.id,
          fibraId: feedFiberId || null,
          potenciaEntradaDbm: feedPower ? Number(feedPower) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Fibra alimentadora salva.");
      onFeedSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const outputs = outputsQ.data ?? [];

  return (
    <div className="mt-3 space-y-4 border-t border-white/10 pt-3">
      {canWrite && (
        <div className="space-y-2 rounded-lg border border-blue-400/20 bg-blue-950/20 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">
            Fibra alimentadora do splitter
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Select value={feedCableId} onValueChange={setFeedCableId}>
              <SelectTrigger><SelectValue placeholder="Cabo de origem" /></SelectTrigger>
              <SelectContent>
                {cables.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={feedFiberId} onValueChange={setFeedFiberId} disabled={!feedCableId}>
              <SelectTrigger><SelectValue placeholder="Fibra" /></SelectTrigger>
              <SelectContent>
                {(feedFibersQ.data ?? []).map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>
                    F{f.numero_global} — Tubo {f.tubo_numero} {f.tubo_cor} — {f.fibra_cor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Potência entrada (dBm)"
              value={feedPower}
              onChange={(e) => setFeedPower(e.target.value)}
            />
          </div>
          <Button size="sm" disabled={!feedFiberId || feedMutation.isPending} onClick={() => feedMutation.mutate()}>
            {feedMutation.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Salvar fibra alimentadora
          </Button>
        </div>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-cyan-300">Saídas</p>
        <div className="space-y-2">
          {outputs.map((o: any) => (
            <OutputRow key={o.id} output={o} cables={cables} ctos={ctos} canWrite={canWrite} onSaved={() => qc.invalidateQueries({ queryKey: ["optical-outputs", splitter.id] })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function OutputRow({
  output,
  cables,
  ctos,
  canWrite,
  onSaved,
}: {
  output: any;
  cables: any[];
  ctos: any[];
  canWrite: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [estado, setEstado] = useState(output.estado);
  const [cableId, setCableId] = useState(output.cabo_distribuicao_id ?? "");
  const [fiberId, setFiberId] = useState(output.fibra_distribuicao_id ?? "");
  const [ctoId, setCtoId] = useState(output.cto_id ?? "");
  const [potSaida, setPotSaida] = useState(output.potencia_saida_dbm?.toString() ?? "");
  const [potChegada, setPotChegada] = useState(output.potencia_chegada_dbm?.toString() ?? "");

  const fibersQ = useQuery({
    queryKey: ["optical-fibers", cableId],
    queryFn: () => listOpticalFibers({ data: { cableId } }),
    enabled: !!cableId && editing,
  });

  const save = useMutation({
    mutationFn: () =>
      setSplitterOutput({
        data: {
          outputId: output.id,
          estado,
          cabovDistribuicaoId: cableId || null,
          fibraDistribuicaoId: fiberId || null,
          ctoId: estado === "cto" ? ctoId || null : null,
          potenciaSaidaDbm: potSaida ? Number(potSaida) : null,
          potenciaChegadaDbm: potChegada ? Number(potChegada) : null,
        },
      }),
    onSuccess: () => {
      toast.success("Saída atualizada.");
      setEditing(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lossDb = calcLossDb(potSaida ? Number(potSaida) : null, potChegada ? Number(potChegada) : null);

  return (
    <div className="rounded-lg border border-white/10 p-2.5 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-semibold">Porta {output.porta_numero} {output.cor}</span>{" "}
          <Badge variant="outline" className="ml-1">{OUTPUT_STATE_LABEL[output.estado] ?? output.estado}</Badge>
          {output.optical_ctos?.codigo && (
            <span className="ml-2 text-cyan-400">→ CTO {output.optical_ctos.codigo}</span>
          )}
        </div>
        {canWrite && (
          <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
            {editing ? "Fechar" : "Editar"}
          </Button>
        )}
      </div>
      {editing && (
        <div className="mt-2 grid gap-2">
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(OUTPUT_STATE_LABEL).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(estado === "cto" || estado === "ceo") && (
            <>
              <Select value={cableId} onValueChange={(v) => { setCableId(v); setFiberId(""); }}>
                <SelectTrigger><SelectValue placeholder="Cabo de distribuição" /></SelectTrigger>
                <SelectContent>
                  {cables.map((c) => <SelectItem key={c.id} value={c.id}>{c.codigo}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={fiberId} onValueChange={setFiberId} disabled={!cableId}>
                <SelectTrigger><SelectValue placeholder="Fibra de distribuição" /></SelectTrigger>
                <SelectContent>
                  {(fibersQ.data ?? []).map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>
                      F{f.numero_global} — {f.fibra_cor}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {estado === "cto" && (
            <Select value={ctoId} onValueChange={setCtoId}>
              <SelectTrigger><SelectValue placeholder="CTO de destino" /></SelectTrigger>
              <SelectContent>
                {ctos.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.codigo}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Potência saída (dBm)" value={potSaida} onChange={(e) => setPotSaida(e.target.value)} />
            <Input placeholder="Potência chegada (dBm)" value={potChegada} onChange={(e) => setPotChegada(e.target.value)} />
          </div>
          {lossDb !== null && (
            <p className={lossDb < 0 ? "text-xs text-rose-400" : "text-xs text-muted-foreground"}>
              Perda do trecho: {lossDb} dB {lossDb < 0 ? "— valor incompatível, confira as medições" : ""}
            </p>
          )}
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------- Matriz ----------

function ArvoreTab({ ceoId }: { ceoId: string }) {
  const fullQ = useQuery({ queryKey: ["optical-full", ceoId], queryFn: () => fetchCeoFullData(ceoId) });
  if (fullQ.isLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Carregando…</p>;
  if (fullQ.isError || !fullQ.data)
    return <p className="py-8 text-center text-sm text-rose-400">Falha ao montar a árvore.</p>;
  return <OpticalTree data={fullQ.data} />;
}

function MatrixTab({ splitters }: { splitters: any[] }) {
  return (
    <div className="space-y-4">
      {splitters.map((s) => <MatrixSplitterRows key={s.id} splitter={s} />)}
      {splitters.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum splitter cadastrado.</p>
      )}
    </div>
  );
}

function MatrixSplitterRows({ splitter }: { splitter: any }) {
  const outputsQ = useQuery({
    queryKey: ["optical-outputs", splitter.id],
    queryFn: () => listOpticalSplitterOutputs({ data: { splitterId: splitter.id } }),
  });
  const outputs = outputsQ.data ?? [];
  return (
    <div className="webi-nav-card overflow-x-auto rounded-lg">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-left text-xs uppercase text-slate-400">
          <tr>
            <th className="p-2">Splitter</th>
            <th className="p-2">Saída</th>
            <th className="p-2">Estado</th>
            <th className="p-2">Pot. saída</th>
            <th className="p-2">CTO</th>
            <th className="p-2">Pot. CTO</th>
            <th className="p-2">Perda</th>
          </tr>
        </thead>
        <tbody>
          {outputs.map((o: any) => {
            const loss = calcLossDb(o.potencia_saida_dbm, o.potencia_chegada_dbm);
            const cls = classifyLoss(loss, splitter.perda_nominal_db, splitter.tolerancia_db);
            return (
              <tr key={o.id} className="border-t border-white/5">
                <td className="p-2">{splitter.codigo} {splitter.tipo}</td>
                <td className="p-2">{o.porta_numero} {o.cor}</td>
                <td className="p-2">{OUTPUT_STATE_LABEL[o.estado] ?? o.estado}</td>
                <td className="p-2 tabular-nums">{o.potencia_saida_dbm ?? "—"}</td>
                <td className="p-2">{o.optical_ctos?.codigo ?? "—"}</td>
                <td className="p-2 tabular-nums">{o.potencia_chegada_dbm ?? "—"}</td>
                <td className={"p-2 tabular-nums " + (cls === "critico" ? "text-rose-400" : cls === "atencao" ? "text-amber-400" : "")}>
                  {loss ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Resumo automático ----------

function SummaryTab({ ceo, cables, splitters }: { ceo: any; cables: any[]; splitters: any[] }) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    try {
      const parts: string[] = [];
      let ctoCount = 0;
      for (const s of splitters) {
        const outputs = await listOpticalSplitterOutputs({ data: { splitterId: s.id } });
        const alimentadas = outputs.filter((o: any) => o.estado === "cto");
        ctoCount += alimentadas.length;
        for (const o of alimentadas) {
          if (!o.optical_ctos?.codigo) continue;
          parts.push(
            describeConnection({
              caboOrigemCodigo: "?",
              fibraGlobal: 0,
              tuboNumero: 0,
              tuboCor: "",
              fibraCor: "",
              splitterCodigo: s.codigo,
              splitterTipo: s.tipo,
              portaNumero: o.porta_numero,
              portaCor: o.cor,
              ctoCodigo: o.optical_ctos.codigo,
            }),
          );
        }
      }
      const resumo = `Foi realizado o mapeamento da CEO ${ceo.codigo}. Foram identificados ${cables.length} cabo(s) e ${splitters.length} splitter(s), alimentando ${ctoCount} CTO(s) diretamente cadastradas.`;
      setText([resumo, ...parts].join("\n\n"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar resumo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={generate} disabled={loading}>
        {loading && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
        Gerar resumo automático
      </Button>
      {text && (
        <Card className="webi-nav-card">
          <CardContent className="whitespace-pre-wrap p-4 text-sm text-slate-200">{text}</CardContent>
        </Card>
      )}
    </div>
  );
}
