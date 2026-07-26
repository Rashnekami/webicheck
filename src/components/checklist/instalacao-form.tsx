import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { ChecklistRow, InstalacaoData } from "@/lib/checklist-schema";
import {
  INSTALACAO_TECHNICIAN_QUESTIONS,
  readInstalacaoAnswer,
  type InstalacaoAnswer,
} from "@/lib/instalacao-checklist";

type HeaderShape = Pick<
  ChecklistRow,
  "os" | "cliente" | "cidade" | "endereco" | "plano" | "data_atendimento" | "hora_atendimento"
>;

type Props = {
  header: HeaderShape;
  data: InstalacaoData;
  readOnly?: boolean;
  onHeaderChange: (patch: Partial<HeaderShape>) => void;
  onDataChange: (patch: (prev: InstalacaoData) => InstalacaoData) => void;
};

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <span className="mr-2 text-primary">{n}.</span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}

export function InstalacaoForm({
  header,
  data,
  readOnly,
  onHeaderChange,
  onDataChange,
}: Props) {
  const respostas = data.respostas ?? {};
  const total = INSTALACAO_TECHNICIAN_QUESTIONS.length;
  const answered = INSTALACAO_TECHNICIAN_QUESTIONS.filter(
    (q) => readInstalacaoAnswer(respostas, q.id) !== null,
  ).length;
  const firstUnanswered = INSTALACAO_TECHNICIAN_QUESTIONS.findIndex(
    (q) => readInstalacaoAnswer(respostas, q.id) === null,
  );
  const [current, setCurrent] = useState<number>(firstUnanswered === -1 ? total : firstUnanswered);

  const setAnswer = (id: string, answer: InstalacaoAnswer) => {
    onDataChange((p) => ({
      ...p,
      respostas: { ...(p.respostas ?? {}), [id]: answer },
    }));
  };

  const setVel = (patch: Partial<InstalacaoData["velocidade"]>) =>
    onDataChange((p) => ({ ...p, velocidade: { ...p.velocidade, ...patch } }));

  const allAnswered = answered === total;
  const showReview = current >= total;

  return (
    <div className="space-y-4">
      <Section n={1} title="Identificação do atendimento">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>OS</Label>
            <Input
              value={header.os ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ os: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Plano contratado</Label>
            <Input
              value={header.plano ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ plano: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cliente</Label>
            <Input
              value={header.cliente ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ cliente: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <Input
              value={header.cidade ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ cidade: e.target.value })}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Endereço</Label>
            <Input
              value={header.endereco ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ endereco: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input
              type="date"
              value={header.data_atendimento ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onHeaderChange({ data_atendimento: e.target.value || null })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hora</Label>
            <Input
              type="time"
              value={header.hora_atendimento ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onHeaderChange({ hora_atendimento: e.target.value || null })
              }
            />
          </div>
        </div>
      </Section>

      <Section n={2} title="Checklist do técnico — Sim ou Não">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {Math.min(current + 1, total)} de {total}
          </span>
          <span>
            {answered} de {total} respondidas
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(answered / total) * 100}%` }}
          />
        </div>

        {!showReview ? (
          <div className="space-y-4 pt-2">
            <p className="min-h-16 text-sm font-medium leading-6">
              {INSTALACAO_TECHNICIAN_QUESTIONS[current].question}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["sim", "nao"] as const).map((ans) => {
                const q = INSTALACAO_TECHNICIAN_QUESTIONS[current];
                const selected = readInstalacaoAnswer(respostas, q.id) === ans;
                return (
                  <Button
                    key={ans}
                    type="button"
                    disabled={readOnly}
                    variant={selected ? "default" : "outline"}
                    className={ans === "nao" && selected ? "bg-amber-600 hover:bg-amber-700" : ""}
                    onClick={() => {
                      setAnswer(q.id, ans);
                      // avança para a próxima não-respondida
                      const nextUnanswered = INSTALACAO_TECHNICIAN_QUESTIONS.findIndex(
                        (qq, idx) =>
                          idx !== current &&
                          readInstalacaoAnswer({ ...respostas, [q.id]: ans }, qq.id) === null,
                      );
                      setCurrent(nextUnanswered === -1 ? total : nextUnanswered);
                    }}
                  >
                    {ans === "sim" ? "Sim" : "Não"}
                  </Button>
                );
              })}
            </div>
            <div className="flex items-center justify-between pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={current === 0}
                onClick={() => setCurrent((i) => Math.max(0, i - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Voltar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={current >= total - 1}
                onClick={() => setCurrent((i) => Math.min(total - 1, i + 1))}
              >
                Pular
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 pt-1">
            {allAnswered && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
                Todas as perguntas foram respondidas.
              </div>
            )}
            {INSTALACAO_TECHNICIAN_QUESTIONS.map((q, idx) => {
              const ans = readInstalacaoAnswer(respostas, q.id);
              return (
                <button
                  key={q.id}
                  type="button"
                  disabled={readOnly}
                  className="flex w-full items-start justify-between gap-3 rounded-md border p-2.5 text-left text-xs hover:bg-muted/50"
                  onClick={() => setCurrent(idx)}
                >
                  <span className="leading-snug">
                    <span className="mr-1.5 text-muted-foreground">{idx + 1}.</span>
                    {q.question}
                  </span>
                  <b
                    className={
                      ans === "nao"
                        ? "text-amber-700"
                        : ans === "sim"
                          ? "text-emerald-700"
                          : "text-muted-foreground"
                    }
                  >
                    {ans === "sim" ? "Sim" : ans === "nao" ? "Não" : "—"}
                  </b>
                </button>
              );
            })}
          </div>
        )}
      </Section>

      <Section n={3} title="Medições do teste de velocidade">
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label>Download (Mbps)</Label>
            <Input
              inputMode="decimal"
              value={data.velocidade.download}
              disabled={readOnly}
              onChange={(e) => setVel({ download: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Upload (Mbps)</Label>
            <Input
              inputMode="decimal"
              value={data.velocidade.upload}
              disabled={readOnly}
              onChange={(e) => setVel({ upload: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ping (ms)</Label>
            <Input
              inputMode="numeric"
              value={data.velocidade.ping_ms}
              disabled={readOnly}
              onChange={(e) => setVel({ ping_ms: e.target.value })}
            />
          </div>
        </div>
      </Section>

      <Section n={4} title="Observações adicionais">
        <Textarea
          rows={5}
          value={data.observacoes}
          disabled={readOnly}
          onChange={(e) => onDataChange((p) => ({ ...p, observacoes: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">
          A assinatura do cliente é coletada exclusivamente na Contra-Prova Digital, após a
          finalização do checklist.
        </p>
      </Section>
    </div>
  );
}
