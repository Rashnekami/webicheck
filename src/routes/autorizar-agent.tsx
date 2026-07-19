import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Laptop, Loader2, LogIn } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  approveAgentAuthorization,
  getAgentAuthorization,
} from "@/lib/agent-authorization.functions";

export const Route = createFileRoute("/autorizar-agent")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : "",
  }),
  component: AuthorizeAgentPage,
});

function AuthorizeAgentPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [code, setCode] = useState(search.code.toUpperCase());
  const [authorized, setAuthorized] = useState(false);
  const session = useQuery({
    queryKey: ["agent-auth-session"],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
  });
  const lookup = useMutation({
    mutationFn: () => getAgentAuthorization({ data: { userCode: code } }),
    onError: (e: Error) => toast.error(e.message),
  });
  const approve = useMutation({
    mutationFn: () => approveAgentAuthorization({ data: { userCode: code } }),
    onSuccess: () => setAuthorized(true),
    onError: (e: Error) => toast.error(e.message),
  });
  if (session.isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  if (!session.data)
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Autorizar Webi Diagnostic</CardTitle>
            <CardDescription>
              Entre com sua conta WebiCheck para vincular este dispositivo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => {
                sessionStorage.setItem(
                  "webicheck.return_to",
                  `/autorizar-agent?code=${encodeURIComponent(code)}`,
                );
                navigate({ to: "/auth" });
              }}
            >
              <LogIn className="mr-2 h-4 w-4" /> Entrar no WebiCheck
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  if (authorized)
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="space-y-3 p-8 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
            <h1 className="text-xl font-semibold">Dispositivo autorizado</h1>
            <p className="text-sm text-muted-foreground">
              Volte ao Webi Diagnostic. A conexão será concluída automaticamente.
            </p>
            <Button asChild variant="outline">
              <Link to="/painel">Ir ao painel</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Laptop className="h-5 w-5" /> Autorizar Webi Diagnostic
          </CardTitle>
          <CardDescription>
            Confira o código exibido pelo Agent antes de permitir o acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="agent-code">Código</Label>
            <Input
              id="agent-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                lookup.reset();
              }}
              className="text-center font-mono text-lg tracking-widest"
              maxLength={9}
            />
          </div>
          {lookup.data && (
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p className="font-medium">{lookup.data.device_name}</p>
              <p className="text-muted-foreground">
                {lookup.data.platform || "Computador"} · Agent {lookup.data.agent_version || "-"}
              </p>
            </div>
          )}
          {!lookup.data ? (
            <Button
              className="w-full"
              onClick={() => lookup.mutate()}
              disabled={lookup.isPending || code.length < 6}
            >
              {lookup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Verificar
              código
            </Button>
          ) : (
            <Button
              className="w-full"
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
            >
              {approve.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Autorizar este
              dispositivo
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
