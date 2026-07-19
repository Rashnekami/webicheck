import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Copy,
  Download,
  Eye,
  FileText,
  Loader2,
  Link2,
  RefreshCw,
  Share2,
  ShieldOff,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  ensureChecklistSnapshot,
  getChecklistSnapshotSummary,
  reactivateChecklistSnapshot,
  revokeChecklistSnapshot,
  type AdminSnapshotSummary,
} from "@/lib/public-checklist.functions";
import { ChecklistDocumentView } from "@/components/checklist/checklist-document-view";
import { buildImageFilename, exportNodeAsPng } from "@/services/checklist-image-export";
import type { ChecklistRow } from "@/lib/checklist-schema";

interface Props {
  row: ChecklistRow;
  tecnicoNome: string;
  assinatura: string | null;
  isAdmin: boolean;
  onDownloadPdf: (publicUrl?: string | null) => void;
  pdfBusy: boolean;
}

export function DocumentActions({
  row,
  tecnicoNome,
  assinatura,
  isAdmin,
  onDownloadPdf,
  pdfBusy,
}: Props) {
  const qc = useQueryClient();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busyImg, setBusyImg] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const snapQuery = useQuery({
    queryKey: ["snapshot", row.id],
    queryFn: () => getChecklistSnapshotSummary({ data: { checklistId: row.id } }),
    enabled: row.status === "finalizado",
  });

  const ensureMut = useMutation({
    mutationFn: (forceNew: boolean) =>
      ensureChecklistSnapshot({ data: { checklistId: row.id, forceNew } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshot", row.id] });
    },
  });

  // Auto-cria snapshot na primeira vez que a página abre o checklist finalizado
  useEffect(() => {
    if (row.status === "finalizado" && snapQuery.data === null && !ensureMut.isPending) {
      ensureMut.mutate(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.status, snapQuery.data]);

  const revokeMut = useMutation({
    mutationFn: (snapshotId: string) => revokeChecklistSnapshot({ data: { snapshotId } }),
    onSuccess: () => {
      toast.success("Link desativado.");
      qc.invalidateQueries({ queryKey: ["snapshot", row.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reactivateMut = useMutation({
    mutationFn: (snapshotId: string) => reactivateChecklistSnapshot({ data: { snapshotId } }),
    onSuccess: () => {
      toast.success("Link reativado.");
      qc.invalidateQueries({ queryKey: ["snapshot", row.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const snap = snapQuery.data as AdminSnapshotSummary | null;

  const publicUrl = useMemo(() => {
    if (!snap || snap.public_status !== "active" || typeof window === "undefined") return null;
    return `${window.location.origin}/validar/${snap.public_token}`;
  }, [snap]);

  // payload local a partir do row atual (para prévia/imagem enquanto snapshot ainda não veio)
  const localPayload = useMemo(() => {
    return {
      tipo: row.tipo,
      header: {
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
      },
      dados: row.dados as never,
      tecnico: { full_name: tecnicoNome, assinatura },
      numero_publico: row.numero_publico,
      codigo_validacao: row.codigo_validacao,
      finalizado_em: row.finalizado_em,
      created_at: row.created_at,
    } as never;
  }, [row, tecnicoNome, assinatura]);

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success("Link público copiado.");
    } catch {
      toast.error("Não foi possível copiar. Segure e copie manualmente.");
    }
  }

  async function copyTextOs() {
    if (!publicUrl) return;
    const linhas = [
      `Checklist técnico Webifibra finalizado.`,
      row.os ? `OS: ${row.os}` : null,
      `Técnico: ${tecnicoNome}`,
      row.finalizado_em ? `Data: ${new Date(row.finalizado_em).toLocaleString("pt-BR")}` : null,
      `Validação: ${publicUrl}`,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(linhas);
      toast.success("Texto para a OS copiado.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  async function share() {
    if (!publicUrl) return;
    const shareData = {
      title: `Checklist Webifibra ${row.numero_publico ?? ""}`.trim(),
      text: `Checklist técnico Webifibra${row.os ? ` — OS ${row.os}` : ""}. Consulte pelo link.`,
      url: publicUrl,
    };
    try {
      if (typeof navigator !== "undefined" && (navigator as Navigator).share) {
        await (navigator as Navigator).share(shareData);
        return;
      }
    } catch {
      // usuário cancelou — segue silencioso
      return;
    }
    await copyLink();
  }

  async function baixarImagem() {
    const node = docRef.current;
    if (!node) return;
    try {
      setBusyImg(true);
      const filename = buildImageFilename({
        os: row.os,
        numero: row.numero_publico,
      });
      await exportNodeAsPng(node, filename);
      toast.success("Imagem gerada. Agora anexe na OS do Hubsoft.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar a imagem. Tente novamente.");
    } finally {
      setBusyImg(false);
    }
  }

  if (row.status !== "finalizado") return null;

  const statusBadge =
    snap?.public_status === "active" ? (
      <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20">
        <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Link ativo
      </Badge>
    ) : snap?.public_status === "revoked" ? (
      <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/20">
        <ShieldOff className="mr-1 h-3.5 w-3.5" /> Desativado
      </Badge>
    ) : snap?.public_status === "replaced" ? (
      <Badge className="bg-slate-500/15 text-slate-700 hover:bg-slate-500/20">Substituído</Badge>
    ) : (
      <Badge variant="secondary">Preparando…</Badge>
    );

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Documentos e comprovação</h3>
            {statusBadge}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onDownloadPdf(publicUrl)} disabled={pdfBusy} size="sm">
              {pdfBusy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}
              Baixar PDF
            </Button>
            <Button
              onClick={baixarImagem}
              disabled={busyImg || !publicUrl}
              size="sm"
              variant="default"
            >
              {busyImg ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-1.5 h-4 w-4" />
              )}
              Baixar imagem
            </Button>
            <Button onClick={copyLink} disabled={!publicUrl} size="sm" variant="outline">
              <Link2 className="mr-1.5 h-4 w-4" /> Copiar link
            </Button>
            <Button onClick={copyTextOs} disabled={!publicUrl} size="sm" variant="outline">
              <Copy className="mr-1.5 h-4 w-4" /> Copiar texto para OS
            </Button>
            <Button onClick={share} disabled={!publicUrl} size="sm" variant="outline">
              <Share2 className="mr-1.5 h-4 w-4" /> Compartilhar
            </Button>
            <Button onClick={() => setPreviewOpen(true)} size="sm" variant="ghost">
              <Eye className="mr-1.5 h-4 w-4" /> Visualizar
            </Button>
          </div>

          {snap && (
            <div className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Versão v{snap.version}</span>
                <span>
                  Integridade{" "}
                  <b className="text-foreground">{snap.document_hash.slice(0, 8).toUpperCase()}</b>
                </span>
                <span>Acessos: {snap.view_count ?? 0}</span>
                {snap.last_viewed_at && (
                  <span>
                    Último acesso: {new Date(snap.last_viewed_at).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
              {publicUrl && (
                <div className="mt-2 truncate">
                  <span className="text-foreground/70">Link:</span>{" "}
                  <span className="font-mono text-[11px]">{publicUrl}</span>
                </div>
              )}
            </div>
          )}

          {isAdmin && snap && (
            <div className="flex flex-wrap gap-2 border-t pt-3">
              {snap.public_status === "active" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => revokeMut.mutate(snap.id)}
                  disabled={revokeMut.isPending}
                >
                  <ShieldOff className="mr-1.5 h-4 w-4" /> Desativar link
                </Button>
              ) : snap.public_status === "revoked" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => reactivateMut.mutate(snap.id)}
                  disabled={reactivateMut.isPending}
                >
                  <ShieldCheck className="mr-1.5 h-4 w-4" /> Reativar link
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmRegen(true)}
                disabled={ensureMut.isPending}
              >
                <RefreshCw className="mr-1.5 h-4 w-4" /> Gerar novo link
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Container off-screen para exportação PNG (sempre renderizado) */}
      <div
        style={{
          position: "fixed",
          left: -12000,
          top: 0,
          width: 900,
          pointerEvents: "none",
        }}
        aria-hidden
      >
        <ChecklistDocumentView
          ref={docRef}
          payload={(snap ? undefined : localPayload) ?? (localPayload as never)}
          publicUrl={publicUrl}
          shortHash={snap?.document_hash?.slice(0, 8).toUpperCase() ?? null}
          version={snap?.version ?? 1}
          fixedWidth={880}
        />
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-auto p-0">
          <div className="p-2">
            <ChecklistDocumentView
              ref={previewRef}
              payload={localPayload as never}
              publicUrl={publicUrl}
              shortHash={snap?.document_hash?.slice(0, 8).toUpperCase() ?? null}
              version={snap?.version ?? 1}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerar novo link público?</DialogTitle>
            <DialogDescription>
              O link atual deixará de funcionar e um novo endereço será gerado. Utilize apenas
              quando for necessário substituir o documento.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRegen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                ensureMut.mutate(true, {
                  onSuccess: () => {
                    toast.success("Novo link gerado.");
                    setConfirmRegen(false);
                  },
                  onError: (e: Error) => toast.error(e.message),
                });
              }}
              disabled={ensureMut.isPending}
            >
              {ensureMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
