import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { CheckCircle2, ChevronLeft, Loader2, ShieldCheck } from "lucide-react";
import { getPublicCounterproof, completePublicCounterproof } from "@/lib/customer-counterproof.functions";
import {
  CUSTOMER_COUNTERPROOF_CHECKLIST_VERSION,
  questionsForCounterproof,
  type CustomerCounterproofAnswer,
} from "@/lib/customer-counterproof-checklist";
import { SignaturePad } from "@/components/signature-pad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { WebifibraLogo } from "@/components/webifibra-logo";

export const Route = createFileRoute("/contra-prova/$token")({
  component: CounterproofPage,
  head: () => ({ meta: [{ title: "Contra-Prova do Cliente — CheckTecnico" }, { name: "robots", content: "noindex,nofollow" }] }),
});

function fileDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
    reader.readAsDataURL(file);
  });
}

/**
 * Fotos de celular chegam com 4–12 MB e, no iPhone, às vezes em HEIC — os dois
 * casos quebravam o envio (limite de 8 MB / "Imagem inválida"). Aqui a foto é
 * sempre reduzida e reconvertida para JPEG antes de sair do aparelho.
 */
async function prepareIdentityPhoto(file: File): Promise<string> {
  let source: HTMLImageElement | ImageBitmap | null = null;
  try {
    if (typeof createImageBitmap === "function") source = await createImageBitmap(file);
  } catch {
    source = null;
  }
  if (!source) {
    const original = await fileDataUrl(file);
    source = await new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = original;
    });
  }
  const width = source instanceof ImageBitmap ? source.width : source?.naturalWidth ?? 0;
  const height = source instanceof ImageBitmap ? source.height : source?.naturalHeight ?? 0;
  if (!source || !width || !height) {
    throw new Error("Formato de foto não suportado. Tire a foto novamente pela câmera.");
  }
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a foto neste aparelho.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  if (source instanceof ImageBitmap) source.close();
  return canvas.toDataURL("image/jpeg", 0.78);
}


/**
 * No Android, abrir a câmera/galeria costuma descartar a aba por falta de
 * memória: ao voltar, o cliente perdia respostas, foto e assinatura e nunca
 * conseguia concluir. O preenchimento fica salvo no próprio aparelho até a
 * validação.
 */
type DraftState = {
  confirmed: boolean;
  currentQuestion: number;
  answers: Partial<Record<string, CustomerCounterproofAnswer>>;
  identity: string | null;
  signature: string | null;
};

function draftKey(token: string) {
  return `cp-draft:${token}`;
}

function readDraft(token: string): DraftState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(token));
    return raw ? (JSON.parse(raw) as DraftState) : null;
  } catch {
    return null;
  }
}

function CounterproofPage() {
  const { token } = Route.useParams();
  const [confirmed, setConfirmed] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Partial<Record<string, CustomerCounterproofAnswer>>>({});
  const [identity, setIdentity] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityLoading, setIdentityLoading] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const draft = readDraft(token);
    if (draft) {
      setConfirmed(!!draft.confirmed);
      setCurrentQuestion(draft.currentQuestion ?? 0);
      setAnswers(draft.answers ?? {});
      setIdentity(draft.identity ?? null);
      setSignature(draft.signature ?? null);
    }
    setRestored(true);
  }, [token]);

  useEffect(() => {
    if (!restored || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        draftKey(token),
        JSON.stringify({ confirmed, currentQuestion, answers, identity, signature } satisfies DraftState),
      );
    } catch {
      /* armazenamento cheio ou bloqueado: segue sem rascunho */
    }
  }, [restored, token, confirmed, currentQuestion, answers, identity, signature]);


  const query = useQuery({
    queryKey: ["public-counterproof", token],
    queryFn: () => getPublicCounterproof({ data: { token } }),
  });
  const kind = query.data?.kind === "maintenance" ? "maintenance" : "installation";
  const questions = questionsForCounterproof(kind);
  const allQuestionsAnswered = questions.every(
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
            items: questions.map((question) => ({
              id: question.id,
              question: question.question,
              answer: answers[question.id] as CustomerCounterproofAnswer,
            })),
          },
        },
      }),
    onSuccess: () => {
      try {
        window.localStorage.removeItem(draftKey(token));
      } catch {
        /* ignore */
      }
    },
  });


  if (query.isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#020817] text-cyan-300"><Loader2 className="animate-spin" /></div>;
  const cp = query.data;
  if (!cp) return <div className="min-h-screen bg-[#020817] p-8 text-center text-slate-100">Link inválido ou indisponível.</div>;
  const validatedInfo = finish.data
    ? { code: finish.data.code, validated_at: finish.data.validated_at, checklist_code: finish.data.checklist_code }
    : cp.status === "validated"
      ? { code: cp.code, validated_at: cp.validated_at, checklist_code: cp.checklist_code }
      : null;
  if (validatedInfo) {
    return <div className="flex min-h-screen items-center justify-center bg-[#020817] p-4 text-slate-100"><div className="max-w-md rounded-3xl border border-emerald-400/40 bg-[#06152d] p-7 text-center shadow-[0_0_36px_rgba(34,197,94,.15)]"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-400" /><h1 className="mt-3 text-xl font-black">Contra-Prova validada</h1><p className="mt-3 text-sm text-slate-300">Código: <b className="text-white">{validatedInfo.code}</b><br />Checklist: <b className="text-white">{validatedInfo.checklist_code}</b><br />{validatedInfo.validated_at && new Date(validatedInfo.validated_at).toLocaleString("pt-BR")}</p><p className="mt-4 text-xs text-slate-400">Você já pode fechar esta janela.</p></div></div>;
  }
  if (cp.status === "annulled") return <div className="min-h-screen bg-[#020817] p-8 text-center text-amber-300">Esta Contra-Prova foi anulada. Solicite um novo link à equipe.</div>;

  return <main className="min-h-screen bg-[#020817] pb-10 text-slate-100">
    <header className="border-b border-blue-500/30 bg-[radial-gradient(circle_at_top_right,rgba(0,170,255,.2),transparent_42%),linear-gradient(135deg,#06152d,#020817)] p-5 text-white shadow-[0_0_30px_rgba(0,105,255,.12)]"><div className="mx-auto flex max-w-lg items-center gap-3"><WebifibraLogo size={48} className="shadow-[0_0_20px_rgba(0,180,255,.22)]" /><div><p className="text-xs uppercase tracking-[.2em] text-cyan-300">{kind === "maintenance" ? "Contra-prova de manutenção" : "Contra-prova digital"}</p><h1 className="font-black">CHECKLIST DO CLIENTE</h1></div></div></header>
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <section className="rounded-2xl border border-blue-500/35 bg-[#06152d] p-4 shadow-[inset_0_0_26px_rgba(0,105,255,.07)]"><div className="flex gap-3"><div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-blue-600/20 text-cyan-300"><ShieldCheck className="h-6 w-6" /></div><div className="w-full"><p className="font-bold">Atendimento técnico registrado</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-300"><p>Cliente<br /><b className="text-white">{cp.client_name || "—"}</b></p><p>OS<br /><b className="text-white">{cp.service_order || "—"}</b></p><p>Contra-Prova<br /><b className="text-white">{cp.code}</b></p><p>Checklist<br /><b className="text-white">{cp.checklist_code}</b></p><p>Cidade<br /><b className="text-white">{cp.city || "—"}</b></p><p>Código<br /><b className="break-all text-white">{cp.validation_code || "—"}</b></p></div></div></div></section>
      <section className="rounded-2xl border border-blue-500/35 bg-[#06152d] p-4 shadow-[inset_0_0_26px_rgba(0,105,255,.07)]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">💬 Perguntas do cliente</h2>
            <p className="text-sm text-slate-400">
              Responda cada pergunta com Sim ou Não.
            </p>
          </div>
          <span className="whitespace-nowrap rounded-full border border-cyan-500/30 bg-blue-600/15 px-3 py-1 text-xs font-bold text-cyan-300">
            {Math.min(currentQuestion + 1, questions.length)} de {questions.length}
          </span>
        </div>
        <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-300 shadow-[0_0_12px_rgba(0,210,255,.4)] transition-all"
            style={{
              width: `${
                (Object.keys(answers).length / questions.length) * 100
              }%`,
            }}
          />
        </div>

        {currentQuestion < questions.length ? (
          <div className="space-y-5">
              <div className="flex min-h-28 items-start gap-3 rounded-2xl border border-blue-500/30 bg-[#041126] p-4"><span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-blue-600 text-sm font-black shadow-[0_0_16px_rgba(0,119,255,.28)]">{String(currentQuestion + 1).padStart(2, "0")}</span><p className="text-base font-medium leading-6">{questions[currentQuestion].question}</p></div>
            <div className="grid grid-cols-2 gap-3">
              {(["sim", "nao"] as const).map((answer) => {
                const question = questions[currentQuestion];
                const selected = answers[question.id] === answer;
                return (
                  <Button
                    key={answer}
                    type="button"
                    variant="outline"
                    className={
                      selected
                        ? answer === "sim"
                          ? "h-14 border-emerald-400 bg-emerald-600 text-white shadow-[0_0_18px_rgba(34,197,94,.25)] hover:bg-emerald-500"
                          : "h-14 border-red-400 bg-red-600 text-white shadow-[0_0_18px_rgba(239,68,68,.25)] hover:bg-red-500"
                        : "h-14 border-blue-500/40 bg-[#071b3a] text-white hover:bg-blue-900/60"
                    }
                    onClick={() => {
                      setAnswers((previous) => ({ ...previous, [question.id]: answer }));
                      setCurrentQuestion((index) =>
                        allQuestionsAnswered
                          ? questions.length
                          : Math.min(index + 1, questions.length),
                      );
                    }}
                  >
                    {answer === "sim" ? "✓ SIM" : "✕ NÃO"}
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
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 p-3 text-sm text-emerald-300">
              <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
              Todas as perguntas foram respondidas.
            </div>
            <div className="space-y-2">
              {questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 rounded-xl border border-blue-500/25 bg-[#041126] p-3 text-left text-xs hover:bg-blue-950"
                  onClick={() => setCurrentQuestion(index)}
                >
                  <span>{question.question}</span>
                  <b className={answers[question.id] === "nao" ? "text-red-400" : "text-emerald-400"}>
                    {answers[question.id] === "sim" ? "Sim" : "Não"}
                  </b>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {allQuestionsAnswered && currentQuestion >= questions.length && (
      <section className="space-y-5 rounded-2xl border border-blue-500/35 bg-[#06152d] p-4 shadow-[inset_0_0_26px_rgba(0,105,255,.07)] [&_label]:text-slate-200">
        <div className="flex items-start gap-2"><Checkbox id="confirm" checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><Label htmlFor="confirm" className="leading-5">Confirmo que recebi e compreendi as orientações acima e tive oportunidade de esclarecer minhas dúvidas.</Label></div>
        <div className="rounded-xl border border-blue-500/25 bg-[#041126] p-3">
          <Label>🔒 Foto segurando RG ou CNH</Label>
          <input
            ref={input}
            className="hidden"
            type="file"
            accept="image/*"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              setIdentityError(null);
              setIdentityLoading(true);
              try {
                setIdentity(await prepareIdentityPhoto(file));
              } catch (error) {
                setIdentity(null);
                setIdentityError(error instanceof Error ? error.message : "Não foi possível usar esta foto.");
              } finally {
                setIdentityLoading(false);
                // limpar só depois de ler o arquivo: em alguns Android limpar antes invalida o File
                input.value = "";
              }
            }}
          />
          <Button
            className="mt-2 border-cyan-500/40 bg-blue-600/20 text-white hover:bg-blue-600/35"
            variant="outline"
            type="button"
            disabled={identityLoading}
            onClick={() => input.current?.click()}
          >
            {identityLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {identityLoading ? "Processando foto..." : identity ? "✓ Foto registrada — trocar" : "Tirar foto"}
          </Button>
          {identity && (
            <img src={identity} alt="Pré-visualização da foto com documento" className="mt-3 max-h-48 rounded-lg border border-blue-500/25 object-contain" />
          )}
          {identityError && <p className="mt-2 text-xs font-semibold text-red-400">{identityError}</p>}
          <p className="mt-2 text-xs text-slate-400">Use a câmera ou escolha uma foto da galeria. A foto com RG/CNH é privada e pode ser consultada somente pela administração autorizada.</p>
        </div>

        <div><Label>✍ Assinatura digital do cliente</Label><div className="mt-2 overflow-hidden rounded-xl border border-cyan-500/35 bg-white"><SignaturePad value={signature} onChange={setSignature} height={150} /></div></div>
        <Button className="h-12 w-full bg-gradient-to-r from-blue-600 to-cyan-500 font-bold text-white shadow-[0_0_20px_rgba(0,160,255,.22)] hover:from-blue-500 hover:to-cyan-400" disabled={!allQuestionsAnswered || !confirmed || !identity || !signature || finish.isPending} onClick={() => finish.mutate()}>{finish.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Finalizar Contra-Prova</Button>
        {finish.error && <p className="text-sm text-destructive">{finish.error.message}</p>}
      </section>
      )}
    </div>
  </main>;
}
