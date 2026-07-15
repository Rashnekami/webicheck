import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, Loader2, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

import { getPublicChecklist } from "@/lib/public-checklist.functions";
import { ChecklistDocumentView } from "@/components/checklist/checklist-document-view";
import { Button } from "@/components/ui/button";
import { WebifibraLogo } from "@/components/webifibra-logo";
import {
  buildImageFilename,
  exportNodeAsPng,
} from "@/services/checklist-image-export";

export const Route = createFileRoute("/validar/$token")({
  head: () => ({
    meta: [
      { title: "Validação do checklist — Webifibra" },
      {
        name: "description",
        content: "Página pública de consulta e validação de checklist Webifibra.",
      },
      { name: "robots", content: "noindex,nofollow,noarchive" },
    ],
  }),
  component: ValidarPage,
});

function ValidarPage() {
  const { token } = Route.useParams();
  const docRef = useRef<HTMLDivElement>(null);
  const [busyImg, setBusyImg] = useState(false);

  const q = useQuery({
    queryKey: ["public-checklist", token],
    queryFn: () => getPublicChecklist({ data: { token } }),
    staleTime: 60_000,
  });

  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return null;
    return `${window.location.origin}/validar/${token}`;
  }, [token]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl ?? "");
      toast.success("Link público copiado");
    } catch {
      toast.error("Não foi possível copiar. Segure e copie manualmente.");
    }
  }

  async function baixarImagem() {
    if (!docRef.current || !q.data?.payload) return;
    try {
      setBusyImg(true);
      const filename = buildImageFilename({
        os: q.data.payload.header.os as string,
        numero: q.data.payload.numero_publico,
      });
      await exportNodeAsPng(docRef.current, filename);
      toast.success("Imagem baixada.");
    } catch (e) {
      console.error(e);
      toast.error("Não foi possível gerar a imagem.");
    } finally {
      setBusyImg(false);
    }
  }

  if (q.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <WebifibraLogo size={56} className="animate-pulse" />
      </div>
    );
  }

  const data = q.data;
  if (!data || data.status === "not_found") {
    return <StatusScreen kind="not_found" />;
  }
  if (data.status === "revoked") {
    return <StatusScreen kind="revoked" shortHash={data.short_hash} />;
  }
  if (data.status === "replaced") {
    return <StatusScreen kind="replaced" shortHash={data.short_hash} />;
  }

  const payload = data.payload!;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="brand-gradient text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <WebifibraLogo size={40} />
            <div>
              <p className="text-xs uppercase tracking-wider opacity-80">
                Consulta pública
              </p>
              <h1 className="text-base font-semibold">Checklist validado</h1>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium">
            <ShieldCheck className="h-3.5 w-3.5" />
            Válido
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copyLink}>
            <Copy className="mr-1.5 h-4 w-4" /> Copiar link
          </Button>
          <Button size="sm" onClick={baixarImagem} disabled={busyImg}>
            {busyImg ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Baixar imagem
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
          <ChecklistDocumentView
            ref={docRef}
            payload={payload}
            publicUrl={publicUrl}
            shortHash={data.short_hash}
            version={data.version}
          />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Documento oficial Webifibra · integridade {data.short_hash}
        </p>
      </main>
    </div>
  );
}

function StatusScreen({
  kind,
  shortHash,
}: {
  kind: "not_found" | "revoked" | "replaced";
  shortHash?: string | null;
}) {
  const cfg = {
    not_found: {
      icon: <ShieldX className="h-10 w-10 text-slate-400" />,
      title: "Não foi possível localizar este checklist",
      body: "O endereço informado não corresponde a nenhum documento válido.",
    },
    revoked: {
      icon: <ShieldAlert className="h-10 w-10 text-amber-500" />,
      title: "Link de validação desativado",
      body: "Este link foi desativado pela Webifibra. Solicite um novo link ao responsável pela ordem de serviço.",
    },
    replaced: {
      icon: <ShieldAlert className="h-10 w-10 text-amber-500" />,
      title: "Documento substituído por uma nova versão",
      body: "Este checklist foi atualizado e o link antigo foi encerrado. Use o novo link enviado pela equipe.",
    },
  }[kind];
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md rounded-xl border bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
          {cfg.icon}
        </div>
        <h1 className="text-lg font-semibold">{cfg.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{cfg.body}</p>
        {shortHash && (
          <p className="mt-3 text-xs text-muted-foreground">
            Integridade do documento: {shortHash}
          </p>
        )}
      </div>
    </div>
  );
}
