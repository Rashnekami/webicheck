import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ImageUp, Loader2, Save, Trash2, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listEvaluableEmployees } from "@/lib/technical-reviews.functions";
import {
  deleteZummeEntry,
  extractZummeFromImages,
  listZummeEntries,
  saveZummeEntry,
} from "@/lib/zumme-productivity.functions";
import {
  competenceLabel,
  formatZummeDuration,
  isValidCompetence,
  minutesToHours,
  parseZummeDuration,
  validateZummeEntry,
  ZUMME_CATEGORY_LABEL,
  type ZummeBreakdownRow,
} from "@/lib/zumme-productivity";

export const Route = createFileRoute("/_authenticated/produtividade")({
  head: () => ({
    meta: [
      { title: "Produtividade técnica (Zumme) — CheckTecnico" },
      {
        name: "description",
        content: "Lançamento mensal dos números de produtividade extraídos do Zumme.",
      },
    ],
  }),
  component: Produtividade,
});

function currentCompetence() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Produtividade() {
  const qc = useQueryClient();
  const [competence, setCompetence] = useState(currentCompetence());
  const [employeeId, setEmployeeId] = useState<string>("__equipe__");
  const [sourceName, setSourceName] = useState("");
  const [cities, setCities] = useState("Telêmaco Borba, TELEMACO BORBA, Tibagi, Imbaú");
  const [totalOs, setTotalOs] = useState("");
  const [avgPerDay, setAvgPerDay] = useState("");
  const [avgCompletion, setAvgCompletion] = useState("");
  const [notes, setNotes] = useState("");
  const [breakdown, setBreakdown] = useState<ZummeBreakdownRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const employees = useQuery({
    queryKey: ["evaluable-employees"],
    queryFn: () => listEvaluableEmployees(),
  });

  const entries = useQuery({
    queryKey: ["zumme-entries", competence],
    queryFn: () => listZummeEntries({ data: { competence } }),
    enabled: isValidCompetence(competence),
  });

  const isTeam = employeeId === "__equipe__";
  const minutes = parseZummeDuration(avgCompletion);

  const save = useMutation({
    mutationFn: () => {
      const input = {
        competence,
        employeeId: isTeam ? null : employeeId,
        sourceName:
          sourceName.trim() ||
          (isTeam
            ? "Equipe"
            : (employees.data ?? []).find((e: any) => e.id === employeeId)?.full_name || ""),
        cities: cities
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        totalOs: Number(totalOs),
        avgPerDay: avgPerDay.trim() ? Number(avgPerDay.replace(",", ".")) : null,
        avgCompletionRaw: avgCompletion.trim() || null,
        breakdown,
        notes: notes.trim() || null,
      };
      const errors = validateZummeEntry(input);
      if (errors.length) throw new Error(errors.join(" "));
      return saveZummeEntry({ data: input });
    },
    onSuccess: () => {
      toast.success("Produtividade lançada.");
      qc.invalidateQueries({ queryKey: ["zumme-entries", competence] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteZummeEntry({ data: { id } }),
    onSuccess: () => {
      toast.success("Lançamento removido.");
      qc.invalidateQueries({ queryKey: ["zumme-entries", competence] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extract = useMutation({
    mutationFn: async (files: FileList) => {
      const images = await Promise.all(
        Array.from(files)
          .slice(0, 4)
          .map(
            (f) =>
              new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = () => reject(new Error(`Falha ao ler ${f.name}`));
                reader.readAsDataURL(f);
              }),
          ),
      );
      return extractZummeFromImages({ data: { images } });
    },
    onSuccess: (res: any) => {
      const s = res.suggestion;
      if (s.totalOs != null) setTotalOs(String(s.totalOs));
      if (s.avgPerDay != null) setAvgPerDay(String(s.avgPerDay));
      if (s.avgCompletionRaw) setAvgCompletion(s.avgCompletionRaw);
      if (s.cities?.length) setCities(s.cities.join(", "));
      if (s.breakdown?.length) setBreakdown(s.breakdown);
      toast.success("Números preenchidos. Confira contra a tela antes de salvar.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lancados = entries.data ?? [];
  const equipe = lancados.find((e: any) => !e.employee_id);
  const porTecnico = lancados.filter((e: any) => e.employee_id);

  const somaTecnicos = useMemo(
    () => porTecnico.reduce((acc: number, e: any) => acc + (e.total_os ?? 0), 0),
    [porTecnico],
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" asChild>
          <Link to="/avaliacoes">
            <ArrowLeft className="mr-2 h-4 w-4" /> Avaliações
          </Link>
        </Button>
        <Badge variant="outline">Fonte: Zumme · dashboard Produtividade Técnica</Badge>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Produtividade técnica</h1>
        <p className="text-sm text-muted-foreground">
          Enquanto não há API do Zumme, os números são lançados por competência. Filtre o técnico
          no dashboard, copie os três cards do topo e salve. Esses valores alimentam o grupo
          Produtividade da avaliação.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Lançar competência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Competência</Label>
              <Input
                type="month"
                value={competence}
                onChange={(e) => setCompetence(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Técnico</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__equipe__">Equipe (sem filtro de técnico)</SelectItem>
                  {(employees.data ?? []).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome no Zumme</Label>
              <Input
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
                placeholder="Como aparece no painel"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Cidades filtradas</Label>
            <Input value={cities} onChange={(e) => setCities(e.target.value)} />
            <p className="text-xs text-amber-500">
              O Zumme tem "Telêmaco Borba" e "TELEMACO BORBA" como cidades separadas. Selecione as
              duas no filtro, senão o total vem menor que a realidade.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Total de O.S. finalizadas</Label>
              <Input
                inputMode="numeric"
                value={totalOs}
                onChange={(e) => setTotalOs(e.target.value)}
                placeholder="178"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Média por dia</Label>
              <Input
                inputMode="decimal"
                value={avgPerDay}
                onChange={(e) => setAvgPerDay(e.target.value)}
                placeholder="9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tempo médio de finalização</Label>
              <Input
                value={avgCompletion}
                onChange={(e) => setAvgCompletion(e.target.value)}
                placeholder="1d 08:15"
              />
              <p className="text-xs text-muted-foreground">
                {avgCompletion.trim()
                  ? minutes != null
                    ? `= ${formatZummeDuration(minutes)} · ${minutesToHours(minutes)}h`
                    : "Formato não reconhecido. Copie exatamente como está no Zumme."
                  : "Copie exatamente como aparece no card."}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Férias, afastamento, mudança de escala — o que explica o número deste mês"
            />
          </div>

          {breakdown.length > 0 && (
            <div className="rounded-lg border p-3">
              <p className="mb-2 text-sm font-medium">Quebra lida do print</p>
              <div className="flex flex-wrap gap-1.5">
                {breakdown.map((b, i) => (
                  <Badge key={`${b.kind}-${b.label}-${i}`} variant="secondary" className="text-xs">
                    {b.label}: {b.quantity}
                    <span className="ml-1 opacity-60">
                      ({ZUMME_CATEGORY_LABEL[b.category] ?? b.category})
                    </span>
                  </Badge>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => setBreakdown([])}
              >
                Limpar quebra
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || !totalOs.trim()}>
              {save.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar lançamento
            </Button>

            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) extract.mutate(e.target.files);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={extract.isPending}
            >
              {extract.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImageUp className="mr-2 h-4 w-4" />
              )}
              Ler print do Zumme
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A leitura do print apenas preenche os campos. Nada é salvo até você conferir contra a
            tela e clicar em salvar.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Lançado em {competenceLabel(competence)}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {entries.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {entries.isError && (
            <p className="text-sm text-destructive">{(entries.error as Error).message}</p>
          )}
          {!entries.isLoading && lancados.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nada lançado nesta competência ainda.
            </p>
          )}

          {equipe && somaTecnicos > (equipe.total_os ?? 0) && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              A soma dos técnicos ({somaTecnicos}) passou o total da equipe ({equipe.total_os}).
              Confira se algum filtro de cidade ficou diferente entre os lançamentos.
            </p>
          )}

          {lancados.map((e: any) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {!e.employee_id && <Users className="h-3.5 w-3.5" />}
                  {e.source_name}
                  {!e.employee_id && (
                    <Badge variant="secondary" className="text-[10px]">
                      equipe
                    </Badge>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.total_os} O.S. · {e.avg_per_day ?? "—"}/dia ·{" "}
                  {formatZummeDuration(e.avg_completion_minutes)}
                  {e.avg_completion_minutes
                    ? ` (${minutesToHours(e.avg_completion_minutes)}h)`
                    : ""}
                </p>
                {e.notes && <p className="mt-0.5 text-xs text-muted-foreground">{e.notes}</p>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => remove.mutate(e.id)}
                disabled={remove.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
