import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, Loader2, Megaphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  listAnnouncements,
  saveAnnouncement,
  toggleAnnouncement,
} from "@/lib/provider-admin.functions";

export const Route = createFileRoute("/_authenticated/informativos")({
  component: InformativosPage,
});

function InformativosPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["announcements"], queryFn: () => listAnnouncements() });
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "critical">("info");
  const [imageUrl, setImageUrl] = useState("");
  const create = useMutation({
    mutationFn: () =>
      saveAnnouncement({ data: { title, message, severity, active: true, imageUrl: imageUrl || null } }),
    onSuccess: async () => {
      setTitle("");
      setMessage("");
      setImageUrl("");
      toast.success("Informativo publicado.");
      await qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: (data: { id: string; active: boolean }) => toggleAnnouncement({ data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="webi-page mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div className="webi-header p-5 sm:p-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/painel">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-white">
          <span className="webi-icon h-11 w-11">
            <Megaphone className="h-5 w-5" />
          </span>
          Informativos
        </h1>
        <p className="text-sm text-muted-foreground">
          Avisos operacionais, plantões e comunicados da equipe.
        </p>
      </div>

      {user?.isAdmin && (
        <Card className="webi-surface">
          <CardContent className="grid gap-3 p-4">
            <div>
              <Label htmlFor="notice-title">Título</Label>
              <Input
                id="notice-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Plantão deste fim de semana"
              />
            </div>
            <div>
              <Label htmlFor="notice-message">Mensagem</Label>
              <Textarea
                id="notice-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="notice-image">Imagem / GIF animado (URL, opcional)</Label>
              <Input
                id="notice-image"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://.../aviso.gif"
              />
              {imageUrl && /^https?:\/\//i.test(imageUrl) && (
                <img
                  src={imageUrl}
                  alt="Pré-visualização"
                  className="mt-2 h-32 w-full rounded-lg border border-blue-400/20 object-contain bg-slate-950/40"
                />
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <Label htmlFor="notice-severity">Prioridade</Label>
                <select
                  id="notice-severity"
                  className="flex h-11 rounded-xl border border-blue-400/20 bg-slate-950/45 px-3 text-sm text-slate-100 outline-none focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/15"
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value as typeof severity)}
                >
                  <option value="info">Informação</option>
                  <option value="warning">Atenção</option>
                  <option value="critical">Crítico</option>
                </select>
              </div>
              <Button
                onClick={() => create.mutate()}
                disabled={create.isPending || title.trim().length < 3 || message.trim().length < 3}
              >
                {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Publicar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {query.data?.map((notice) => (
          <Card
            key={notice.id}
            className={
              !notice.active
                ? "opacity-55 grayscale-[.25]"
                : notice.severity === "critical"
                  ? "webi-announcement border-rose-400/50 bg-rose-950/15"
                  : notice.severity === "warning"
                    ? "webi-announcement border-amber-400/50 bg-amber-950/15"
                    : "webi-announcement border-cyan-400/35 bg-blue-950/25"
            }
          >
            <CardContent className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="webi-icon h-8 w-8 rounded-lg">
                    <Bell className="h-4 w-4" />
                  </span>
                  <h2 className="font-semibold text-white">{notice.title}</h2>
                  <Badge variant={notice.active ? "default" : "secondary"}>
                    {notice.active ? "Ativo" : "Arquivado"}
                  </Badge>
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {notice.message}
                </p>
                {(notice as { image_url?: string | null }).image_url ?? undefined && (
                  <img
                    src={(notice as { image_url?: string | null }).image_url ?? undefined}
                    alt=""
                    className="max-h-48 rounded-lg border border-blue-400/20 object-contain"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  {new Date(notice.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              {user?.isAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggle.mutate({ id: notice.id, active: !notice.active })}
                >
                  {notice.active ? "Arquivar" : "Reativar"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {!query.isLoading && query.data?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum informativo publicado.
          </p>
        )}
      </div>
    </div>
  );
}
