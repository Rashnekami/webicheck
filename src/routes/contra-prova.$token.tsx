import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CheckCircle2, ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { getPublicCounterproof, completePublicCounterproof } from "@/lib/customer-counterproof.functions";
import {
  CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION,
  CUSTOMER_COUNTERPROOF_QUESTIONS,
  type CustomerCounterproofAnswer,
} from "@/lib/customer-counterproof-checklist";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { WebifibraLogo } from "@/components/webifibra-logo";

export const Route = createFileRoute("/contra-prova/$token")({
  component: CounterproofPage,
  head: () => ({ meta: [{ title: "Contra-Prova do Cliente — Webifibra" }, { name: "robots", content: "noindex,nofollow" }] }),
});

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CounterproofPage() {
  const { token } = Route.useParams();
  const [confirmed, setConfirmed] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<string, CustomerCounterproofAnswer>>>({});
  const [identity, setIdentity] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const query = useQuery({
    queryKey: ["public-counterproof", token],
    queryFn: () => getPublicCounterproof({ data: { token } }),
  });
  const allQuestionsAnswered = CUSTOMER_COUNTERPROOF_QUESTIONS.every(
    (question) => answers[question.id] === "sim" || answers[question.id] === "nao",
  );
  const finish = useMutation({
    mutationFn: () =>
      completePublicCounterproof({
        data: {
          token,
          confirmed,
          identityImage: identity || "",
          signature: signature || "",
          clientChecklist: {
            version: CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION,
            items: CUSTOMER_COUNTERPROOF_QUESTIONS.map((question) => ({
              id: question.id,
              question: question.question,
              answer: answers[question.id] as CustomerCounterproofAnswer,
            })),
          },
        },
      }),
    onSuccess: () => query.refetch(),
  });

  if (query.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;
  const cp = query.data;
  if (!cp) return <div className="p-8 text-center">Link inválido ou indisponível.</div>;
  if (cp.status === "validated") {
    return <div className="flex min-h-screen items-center justify-center p-4"><div className="max-w-md rounded-xl border bg-white p-6 text-center shadow"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h1 className="mt-3 text-xl font-bold">Contra-Prova validada</h1><p className="mt-2 text-sm text-muted-foreground">Código: <b>{cp.code}</b><br />Checklist: <b>{cp.checklist_code}</b><br />{cp.validated_at && new Date(cp.validated_at).toLocaleString("pt-BR")}</p></div></div>;
  }
  if (cp.status === "annulled") return <div className="p-8 text-center">Esta Contra-Prova foi anulada. Solicite um novo link à equipe.</div>;

  return <main className="min-h-screen bg-slate-50 pb-10">
    <header className="brand-gradient flex items-center gap-3 p-4 text-white"><WebifibraLogo size={40} /><div><p className="text-xs opacity-80">Confirmação do atendimento</p><h1 className="font-semibold">Contra-Prova do Cliente</h1></div></header>
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <section className="rounded-xl border bg-white p-4"><div className="flex gap-2"><ShieldCheck className="h-5 w-5 text-emerald-600" /><div><p className="font-semibold">Atendimento técnico registrado</p><p className="text-sm text-muted-foreground">Cliente: {cp.client_name || "—"}<br />OS: {cp.service_order || "—"}<br />Checklist: {cp.checklist_code}<br />Código: {cp.code}</p></div></div></section>
      <section className="rounded-xl border bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Checklist do cliente</h2>
            <p className="text-sm text-muted-foreground">
              Responda cada pergunta com Sim ou Não.
            </p>
          </div>
          <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
            {Math.min(currentQuestion + 1, CUSTOMER_COUNTERPROOF_QUESTIONS.length)} de{" "}
            {CUSTOMER_COUNTERPROOF_QUESTIONS.length}
          </span>
        </div>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{
              width: `${
                (Object.keys(answers).length / CUSTOMER_COUNTERPROOF_QUESTIONS.length) * 100
              }%`,
            }}
          />
        </div>

        {currentQuestion < CUSTOMER_COUNTERPROOF_QUESTIONS.length ? (
          <div className="space-y-5">
            <p className="min-h-16 text-base font-medium leading-6">
              {CUSTOMER_COUNTERPROOF_QUESTIONS[currentQuestion].question}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["sim", "nao"] as const).map((answer) => {
                const question = CUSTOMER_COUNTERPROOF_QUESTIONS[currentQuestion];
                const selected = answers[question.id] === answer;
                return (
                  <Button
                    key={answer}
                    type="button"
                    variant={selected ? "default" : "outline"}
                    className={answer === "nao" && selected ? "bg-amber-600 hover:bg-amber-700" : ""}
                    onClick={() => {
                      setAnswers((previous) => ({ ...previous, [question.id]: answer }));
                      setCurrentQuestion((index) =>
                        allQuestionsAnswered
                          ? CUSTOMER_COUNTERPROOF_QUESTIONS.length
                          : Math.min(index + 1, CUSTOMER_COUNTERPROOF_QUESTIONS.length),
                      );
                    }}
                  >
                    {answer === "sim" ? "Sim" : "Não"}
                  </Button>
                );
              })}
            </div>
            {currentQuestion > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCurrentQuestion((index) => Math.max(0, index - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Voltar à pergunta anterior
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
              Todas as perguntas foram respondidas.
            </div>
            <div className="space-y-2">
              {CUSTOMER_COUNTERPROOF_QUESTIONS.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-md border p-2.5 text-left text-xs hover:bg-muted/50"
                  onClick={() => setCurrentQuestion(index)}
                >
                  <span>{question.question}</span>
                  <b className={answers[question.id] === "nao" ? "text-amber-700" : "text-emerald-700"}>
                    {answers[question.id] === "sim" ? "Sim" : "Não"}
                  </b>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {allQuestionsAnswered && currentQuestion >= CUSTOMER_COUNTERPROOF_QUESTIONS.length && (
      <section className="space-y-4 rounded-xl border bg-white p-4">
        <div className="flex items-start gap-2"><Checkbox id="confirm" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><Label htmlFor="confirm" className="leading-5">Confirmo que recebi e compreendi as orientações acima e tive oportunidade de esclarecer minhas dúvidas.</Label></div>
        <div><Label>Foto segurando RG ou CNH</Label><input ref={input} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="user" onChange={async (event) => { const file = event.target.files?.[0]; if (file) setIdentity(await fileDataUrl(file)); }} /><Button className="mt-2" variant="outline" onClick={() => input.current?.click()}>{identity ? "Foto registrada" : "Tirar foto"}</Button><p className="mt-1 text-xs text-muted-foreground">A foto é privada e usada somente como evidência do atendimento.</p></div>
        <div><Label>Assinatura</Label><SignaturePad value={signature} onChange={setSignature} height={150} /></div>
        <Button className="w-full" disabled={!allQuestionsAnswered || !confirmed || !identity || !signature || finish.isPending} onClick={() => finish.mutate()}>{finish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Finalizar Contra-Prova</Button>
        {finish.error && <p className="text-sm text-destructive">{finish.error.message}</p>}
      </section>
      )}
    </div>
  </main>;
}
