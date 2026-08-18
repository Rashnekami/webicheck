import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatWbDate } from "@/lib/whistleblower";
import { validateWhistleblowerDocument } from "@/lib/whistleblower-public.functions";
import { Shell } from "@/routes/denuncia.index";

export const Route = createFileRoute("/denuncia/validar/$codigo")({
  loader: ({ params }) => validateWhistleblowerDocument({ data: { code: params.codigo } }),
  head: () => ({
    meta: [
      { title: "Validação de comprovante — Canal Ético CheckTécnico" },
      { name: "description", content: "Verifique a autenticidade de um comprovante emitido pelo Canal de Denúncias." },
      { property: "og:title", content: "Validação de comprovante — Canal Ético" },
      { property: "og:description", content: "Verificação pública de autenticidade de comprovantes do Canal Ético." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  errorComponent: () => (
    <Shell>
      <Card className="bg-card/70">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Não foi possível validar este comprovante agora.
        </CardContent>
      </Card>
    </Shell>
  ),
  notFoundComponent: () => (
    <Shell>
      <Card className="bg-card/70">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">Comprovante não encontrado.</CardContent>
      </Card>
    </Shell>
  ),
  component: ValidarComprovante,
});

function ValidarComprovante() {
  const data = Route.useLoaderData();
  return (
    <Shell>
      <Card className={data.valid ? "border-emerald-500/40 bg-card/70" : "border-destructive/40 bg-card/70"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {data.valid ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-400" /> Comprovante autêntico
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-destructive" /> Comprovante não localizado
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {data.valid ? (
            <>
              <Row label="Protocolo" value={data.protocol} />
              <Row label="Emitido em" value={formatWbDate(data.issuedAt)} />
              <Row label="Última atualização" value={formatWbDate(data.updatedAt)} />
              <Row label="Código de validação" value={data.validationCode} />
              <p className="pt-2 text-xs text-muted-foreground">
                Esta verificação confirma apenas a existência e a data do registro. O conteúdo da denúncia é
                confidencial e não é exibido publicamente.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Não encontramos nenhum registro com este código de validação. Confira o código impresso no
              comprovante.
            </p>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/40 py-2 last:border-0">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono">{value || "—"}</span>
    </div>
  );
}
