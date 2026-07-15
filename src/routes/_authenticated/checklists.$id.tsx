import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Save,
  Trash2,
  Upload,
} from "lucide-react";

import { WebifibraLogo } from "@/components/webifibra-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { useCurrentUser } from "@/hooks/use-current-user";
import { ChecklistForm } from "@/components/checklist/checklist-form";
import { InstalacaoForm } from "@/components/checklist/instalacao-form";
import {
  deleteFoto,
  finalizeChecklist,
  getChecklist,
  listFotos,
  signedFotoUrl,
  updateChecklist,
  uploadFoto,
} from "@/lib/checklists";
import {
  emptyChecklistData,
  emptyInstalacaoData,
  FOTO_CATEGORIAS,
  TIPO_LABEL,
  type ChecklistData,
  type ChecklistRow,
  type FotoRow,
  type InstalacaoData,
} from "@/lib/checklist-schema";
import { generateChecklistPdf } from "@/components/checklist/checklist-pdf";
import { generateInstalacaoPdf } from "@/components/checklist/instalacao-pdf";

export const Route = createFileRoute("/_authenticated/checklists/$id")({
  head: () => ({
    meta: [{ title: "Checklist — Webifibra" }, { name: "robots", content: "noindex" }],
  }),
  component: ChecklistDetail,
});

type HeaderPatch = Partial<
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
  >
>;

function ChecklistDetail() {
  const { id } = Route.useParams();
  const { data: user } = useCurrentUser();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["checklist", id],
    queryFn: () => getChecklist(id),
  });
  const fotosQuery = useQuery({
    queryKey: ["checklist-fotos", id],
    queryFn: () => listFotos(id),
    enabled: query.data?.tipo === "validacao_ont",
  });

  const [header, setHeader] = useState<HeaderPatch>({});
  const [data, setData] = useState<ChecklistData | InstalacaoData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const row = query.data;
  const readOnly = !row || row.status === "finalizado" || row.tecnico_id !== user?.id;
  const tipo = row?.tipo ?? "validacao_ont";

  useEffect(() => {
    if (!row) return;
    setHeader({
      os: row.os,
      cliente: row.cliente,
      cidade: row.cidade,
      endereco: row.endereco,
      plano: row.plano,
      modelo: row.modelo,
      serial: row.serial,
      cto_porta: row.cto_porta,
      data_atendimento: row.data_atendimento,
      hora_atendimento: row.hora_atendimento,
    });
    const base =
      row.tipo === "instalacao" ? emptyInstalacaoData() : emptyChecklistData();
    setData({ ...(base as any), ...(row.dados as any) });
    setDirty(false);
  }, [row?.id, row?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      await updateChecklist(id, { ...header, dados: data ?? undefined });
    },
    onSuccess: () => {
      setDirty(false);
      setSavedAt(new Date());
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
    onError: () => toast.error("Falha ao salvar. Verifique sua conexão."),
  });

  useEffect(() => {
    if (!dirty || readOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save.mutate(), 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, data, dirty, readOnly]);

  const finalize = useMutation({
    mutationFn: async () => {
      await updateChecklist(id, { ...header, dados: data });
      return finalizeChecklist(id);
    },
    onSuccess: () => {
      toast.success("Checklist finalizado.");
      setFinalizeOpen(false);
      qc.invalidateQueries({ queryKey: ["checklist", id] });
      qc.invalidateQueries({ queryKey: ["checklists"] });
    },
    onError: () => toast.error("Não foi possível finalizar."),
  });

  const missing = useMemo(() => {
    const errs: string[] = [];
    if (!header.cliente?.trim()) errs.push("Cliente");
    if (!header.cidade?.trim()) errs.push("Cidade");
    if (!header.data_atendimento) errs.push("Data do atendimento");
    if (tipo === "validacao_ont") {
      const d = data as ChecklistData;
      if (!header.modelo?.trim()) errs.push("Modelo da ONT");
      if (!header.serial?.trim()) errs.push("Serial da ONT");
      if (!d.relato?.trim()) errs.push("Relato do técnico");
    } else {
      const d = data as InstalacaoData;
      if (!header.endereco?.trim()) errs.push("Endereço");
      if (!d.assinatura_cliente) errs.push("Assinatura do cliente");
    }
    return errs;
  }, [header, data, tipo]);

  async function handlePdf() {
    if (!row) return;
    try {
      setPdfBusy(true);
      const merged = { ...row, ...header, dados: data } as ChecklistRow;
      if (tipo === "instalacao") {
        await generateInstalacaoPdf({
          row: merged,
          tecnicoNome: user?.full_name || user?.email || "",
          assinatura: user?.assinatura ?? null,
        });
      } else {
        await generateChecklistPdf({
          row: merged,
          fotos: fotosQuery.data ?? [],
          tecnicoNome: user?.full_name || user?.email || "",
          assinatura: user?.assinatura ?? null,
        });
      }
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (query.isLoading || !row || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <WebifibraLogo size={56} className="animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="brand-gradient sticky top-0 z-10 text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/checklists"
              className="rounded-full bg-white/15 p-2 hover:bg-white/25"
              aria-label="Voltar"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <p className="truncate text-xs uppercase tracking-wider opacity-80">
                {TIPO_LABEL[tipo]} · {row.status === "finalizado" ? "Finalizado" : "Rascunho"}
              </p>
              <h1 className="truncate text-base font-semibold">
                {header.cliente || "Sem cliente"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {row.status === "finalizado" ? (
              <Badge className="bg-emerald-500/20 text-white hover:bg-emerald-500/30">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                {row.codigo_validacao}
              </Badge>
            ) : save.isPending ? (
              <Badge className="bg-white/20 text-white">
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> Salvando
              </Badge>
            ) : dirty ? (
              <Badge className="bg-white/20 text-white">Alterações pendentes</Badge>
            ) : savedAt ? (
              <Badge className="bg-white/20 text-white">
                <Save className="mr-1 h-3.5 w-3.5" /> Salvo
              </Badge>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4">
        {tipo === "instalacao" ? (
          <InstalacaoForm
            header={{
              os: header.os ?? null,
              cliente: header.cliente ?? null,
              cidade: header.cidade ?? null,
              endereco: header.endereco ?? null,
              plano: header.plano ?? null,
              data_atendimento: header.data_atendimento ?? null,
              hora_atendimento: header.hora_atendimento ?? null,
            }}
            data={data as InstalacaoData}
            readOnly={readOnly}
            onHeaderChange={(patch) => {
              setHeader((p) => ({ ...p, ...patch }));
              setDirty(true);
            }}
            onDataChange={(fn) => {
              setData((p) => fn(p as InstalacaoData));
              setDirty(true);
            }}
          />
        ) : (
          <>
            <ChecklistForm
              header={{
                os: header.os ?? null,
                cliente: header.cliente ?? null,
                cidade: header.cidade ?? null,
                modelo: header.modelo ?? null,
                serial: header.serial ?? null,
                cto_porta: header.cto_porta ?? null,
                data_atendimento: header.data_atendimento ?? null,
                hora_atendimento: header.hora_atendimento ?? null,
              }}
              data={data as ChecklistData}
              readOnly={readOnly}
              onHeaderChange={(patch) => {
                setHeader((p) => ({ ...p, ...patch }));
                setDirty(true);
              }}
              onDataChange={(fn) => {
                setData((p) => fn(p as ChecklistData));
                setDirty(true);
              }}
            />

            <FotosSection
              checklistId={id}
              tecnicoId={row.tecnico_id}
              readOnly={readOnly}
              canDelete={row.status === "rascunho" && row.tecnico_id === user?.id}
              fotos={fotosQuery.data ?? []}
            />
          </>
        )}

        {row.status === "finalizado" && (
          <Card>
            <CardContent className="space-y-1 p-4 text-sm">
              <p>
                <span className="text-muted-foreground">Código de validação:</span>{" "}
                <b>{row.codigo_validacao}</b>
              </p>
              <p>
                <span className="text-muted-foreground">Finalizado em:</span>{" "}
                {row.finalizado_em
                  ? new Date(row.finalizado_em).toLocaleString("pt-BR")
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                Registro imutável para fins de fiscalização.
              </p>
            </CardContent>
          </Card>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Button variant="outline" onClick={() => navigate({ to: "/checklists" })}>
            Voltar
          </Button>
          <div className="flex items-center gap-2">
            {row.status === "finalizado" && (
              <Button onClick={handlePdf} disabled={pdfBusy}>
                {pdfBusy ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="mr-1.5 h-4 w-4" />
                )}
                Baixar PDF
              </Button>
            )}
            {row.status === "rascunho" && row.tecnico_id === user?.id && (
              <>
                <Button
                  variant="outline"
                  onClick={() => save.mutate()}
                  disabled={save.isPending || !dirty}
                >
                  {save.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-4 w-4" />
                  )}
                  Salvar
                </Button>
                <Button onClick={() => setFinalizeOpen(true)}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" /> Finalizar
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={finalizeOpen} onOpenChange={setFinalizeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finalizar checklist?</DialogTitle>
            <DialogDescription>
              Após finalizar, o checklist não poderá mais ser editado nem
              apagado — nem por administradores. Ele fica disponível para
              fiscalização e para gerar o PDF.
            </DialogDescription>
          </DialogHeader>
          {missing.length > 0 ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="font-medium text-destructive">Preencha antes de finalizar:</p>
              <ul className="mt-1 list-inside list-disc text-destructive">
                {missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Um código de validação único será gerado automaticamente.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinalizeOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => finalize.mutate()}
              disabled={missing.length > 0 || finalize.isPending}
            >
              {finalize.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Confirmar finalização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FotosSection({
  checklistId,
  tecnicoId,
  readOnly,
  canDelete,
  fotos,
}: {
  checklistId: string;
  tecnicoId: string;
  readOnly: boolean;
  canDelete: boolean;
  fotos: FotoRow[];
}) {
  const qc = useQueryClient();
  const [cat, setCat] = useState<FotoRow["categoria"]>("etiqueta");
  const inputRef = useRef<HTMLInputElement>(null);

  const up = useMutation({
    mutationFn: async (file: File) =>
      uploadFoto({ checklistId, tecnicoId, categoria: cat, file }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-fotos", checklistId] });
      toast.success("Foto anexada.");
    },
    onError: () => toast.error("Falha no upload."),
  });

  const del = useMutation({
    mutationFn: (f: FotoRow) => deleteFoto(f),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["checklist-fotos", checklistId] }),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Fotos de evidência</h3>
          <span className="text-xs text-muted-foreground">
            {fotos.length} anexada{fotos.length === 1 ? "" : "s"}
          </span>
        </div>

        {!readOnly && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label>Categoria</Label>
              <Select value={cat} onValueChange={(v) => setCat(v as FotoRow["categoria"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FOTO_CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) up.mutate(file);
                if (inputRef.current) inputRef.current.value = "";
              }}
            />
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={up.isPending}
            >
              {up.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-1.5 h-4 w-4" />
              )}
              Anexar foto
            </Button>
          </div>
        )}

        {fotos.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nenhuma foto anexada.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {fotos.map((f) => (
              <FotoTile
                key={f.id}
                foto={f}
                canDelete={canDelete}
                onDelete={() => del.mutate(f)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FotoTile({
  foto,
  canDelete,
  onDelete,
}: {
  foto: FotoRow;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    signedFotoUrl(foto.storage_path).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [foto.storage_path]);

  const label = FOTO_CATEGORIAS.find((c) => c.value === foto.categoria)?.label ?? "";

  return (
    <li className="group relative overflow-hidden rounded-md border">
      {url ? (
        <img src={url} alt={label} className="h-32 w-full object-cover" />
      ) : (
        <div className="flex h-32 w-full items-center justify-center bg-muted">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <div className="p-2 text-xs">
        <p className="truncate font-medium">{label}</p>
      </div>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-1 top-1 rounded-full bg-background/80 p-1 opacity-0 shadow transition group-hover:opacity-100"
          aria-label="Remover foto"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </button>
      )}
    </li>
  );
}

// suppress unused var warning for emptyInstalacaoData retained import
void emptyInstalacaoData;
