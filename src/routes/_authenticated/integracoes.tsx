import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, ShieldOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  createIntegrationToken,
  listIntegrationTokens,
  revokeIntegrationToken,
} from "@/lib/webi-diagnostic.functions";

export const Route = createFileRoute("/_authenticated/integracoes")({
  head: () => ({
    meta: [
      { title: "Integrações — Webifibra" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: IntegracoesPage,
});

function IntegracoesPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["integration-tokens"],
    queryFn: () => listIntegrationTokens(),
  });
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<{ value: string; name: string } | null>(null);

  const create = useMutation({
    mutationFn: () => createIntegrationToken({ data: { name } }),
    onSuccess: (r) => {
      setIssued({ value: r.token_value, name: r.name });
      setName("");
      qc.invalidateQueries({ queryKey: ["integration-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeIntegrationToken({ data: { tokenId: id } }),
    onSuccess: () => {
      toast.success("Token revogado.");
      qc.invalidateQueries({ queryKey: ["integration-tokens"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold">Integrações</h1>
        <p className="text-sm text-muted-foreground">
          Chaves de integração do Webi Diagnostic. Cada chave é pessoal e vale
          para uma instalação do Agent (por exemplo, um notebook).
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <KeyRound className="h-4 w-4" /> Nova chave de integração
          </h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex-1">
              <Label className="text-xs">Nome (ex: Notebook João)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button
              className="self-end"
              onClick={() => create.mutate()}
              disabled={create.isPending || name.trim().length < 2}
            >
              {create.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Gerar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Endpoints do Agent:
            <br />
            <code className="text-[11px]">POST {baseUrl}/api/public/webi-diagnostic/resolve-checklist</code>
            <br />
            <code className="text-[11px]">POST {baseUrl}/api/public/webi-diagnostic/upload-report</code>
            <br />
            Autenticação: header <code>X-Webi-Integration-Key</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <h2 className="text-base font-semibold">Suas chaves</h2>
          {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {q.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma chave criada ainda.</p>
          )}
          <div className="divide-y">
            {q.data?.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{t.name}</span>
                    {t.active ? (
                      <Badge className="bg-emerald-500/15 text-emerald-700">Ativa</Badge>
                    ) : (
                      <Badge variant="secondary">Revogada</Badge>
                    )}
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {t.token_prefix}…
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Criada em {new Date(t.created_at).toLocaleString("pt-BR")}
                    {t.last_used_at &&
                      ` · último uso ${new Date(t.last_used_at).toLocaleString("pt-BR")}`}
                  </p>
                </div>
                {t.active && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => revoke.mutate(t.id)}
                    disabled={revoke.isPending}
                  >
                    <ShieldOff className="mr-1.5 h-4 w-4" /> Revogar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!issued} onOpenChange={(o) => !o && setIssued(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chave gerada — copie agora</DialogTitle>
            <DialogDescription>
              Esta chave só será exibida uma vez. Guarde em local seguro e cole
              no Webi Diagnostic Agent do <b>{issued?.name}</b>.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 font-mono text-xs break-all">
            {issued?.value}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (issued) {
                  navigator.clipboard.writeText(issued.value);
                  toast.success("Copiada.");
                }
              }}
            >
              <Copy className="mr-1.5 h-4 w-4" /> Copiar
            </Button>
            <Button onClick={() => setIssued(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Silencia warning de import não usado no tree-shaking
void Trash2;
