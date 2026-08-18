import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Copy, Download, FileUp, Loader2, Lock, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { WB_CATEGORIES, WB_MAX_FILES } from "@/lib/whistleblower";
import { prepareFiles, type PreparedFile } from "@/lib/whistleblower-files";
import { submitWhistleblowerReport, trackWhistleblowerReport } from "@/lib/whistleblower-public.functions";
import { downloadDenunciaPdf } from "@/components/denuncia/denuncia-pdf";

export const Route = createFileRoute("/denuncia/")({
  head: () => ({
    meta: [
      { title: "Canal de Denúncias — Canal Ético CheckTécnico" },
      {
        name: "description",
        content:
          "Registre um relato de forma segura e, se preferir, totalmente anônima. Você recebe um protocolo para acompanhar o andamento.",
      },
      { property: "og:title", content: "Canal de Denúncias — Canal Ético" },
      {
        property: "og:description",
        content: "Canal seguro e confidencial para relatos. Anonimato garantido e acompanhamento por protocolo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NovaDenuncia,
});

type Form = {
  reportType: "ANONYMOUS" | "IDENTIFIED";
  categorySlug: string;
  title: string;
  description: string;
  unit: string;
  city: string;
  department: string;
  locationDescription: string;
  incidentDate: string;
  incidentTime: string;
  peopleInvolved: string;
  witnesses: string;
  frequency: string;
  identifiedName: string;
  identifiedEmail: string;
  identifiedPhone: string;
  identifiedDepartment: string;
};

const EMPTY: Form = {
  reportType: "ANONYMOUS",
  categorySlug: "",
  title: "",
  description: "",
  unit: "",
  city: "",
  department: "",
  locationDescription: "",
  incidentDate: "",
  incidentTime: "",
  peopleInvolved: "",
  witnesses: "",
  frequency: "",
  identifiedName: "",
  identifiedEmail: "",
  identifiedPhone: "",
  identifiedDepartment: "",
};

const STEPS = ["Como funciona", "Tipo de relato", "O que aconteceu", "Evidências", "Revisão"];

function NovaDenuncia() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [files, setFiles] = useState<PreparedFile[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ protocol: string; accessKey: string } | null>(null);
  const [downloading, setDownloading] = useState(false);

  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onPickFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    try {
      const prepared = await prepareFiles(fileList);
      setFiles((prev) => [...prev, ...prepared].slice(0, WB_MAX_FILES));
      toast.success("Evidência anexada. Metadados de imagem removidos.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function validateStep() {
    if (step === 1 && !form.categorySlug) return "Escolha uma categoria para o relato.";
    if (step === 2) {
      if (form.title.trim().length < 5) return "Informe um título com pelo menos 5 caracteres.";
      if (form.description.trim().length < 20) return "Descreva o ocorrido com pelo menos 20 caracteres.";
    }
    return null;
  }

  function next() {
    const err = validateStep();
    if (err) return toast.error(err);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    if (!confirmed) return toast.error("Confirme a revisão das informações antes de enviar.");
    setSending(true);
    try {
      const payload = {
        ...form,
        files,
        ...(form.reportType === "ANONYMOUS"
          ? { identifiedName: "", identifiedEmail: "", identifiedPhone: "", identifiedDepartment: "" }
          : {}),
      };
      const res = await submitWhistleblowerReport({ data: payload });
      setResult({ protocol: res.protocol, accessKey: res.accessKey });
      window.scrollTo({ top: 0 });
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível registrar a denúncia.");
    } finally {
      setSending(false);
    }
  }

  async function baixarComprovante() {
    if (!result) return;
    setDownloading(true);
    try {
      const view = await trackWhistleblowerReport({
        data: { protocol: result.protocol, accessKey: result.accessKey },
      });
      await downloadDenunciaPdf(view);
    } catch {
      toast.error("Não foi possível gerar o comprovante agora.");
    } finally {
      setDownloading(false);
    }
  }

  if (result) {
    return (
      <Shell>
        <Card className="border-emerald-500/30 bg-card/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-400">
              <Check className="h-5 w-5" /> Sua denúncia foi registrada com sucesso
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <CodeBox label="Protocolo" value={result.protocol} />
              <CodeBox label="Chave de acesso" value={result.accessKey} />
            </div>
            <p className="text-sm text-muted-foreground">
              Guarde essas informações. Elas serão necessárias para acompanhar sua denúncia. Por segurança, não
              será possível recuperar sua chave posteriormente em denúncias totalmente anônimas.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="lg" onClick={baixarComprovante} disabled={downloading}>
                {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Baixar comprovante PDF
              </Button>
              <Button size="lg" onClick={() => navigate({ to: "/denuncia/acompanhar" })}>
                Acompanhar denúncia
              </Button>
              <Button variant="ghost" size="lg" onClick={() => navigate({ to: "/" })}>
                Voltar para a página inicial
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STEPS.map((label, i) => (
          <Badge key={label} variant={i === step ? "default" : "outline"} className="text-[11px]">
            {i + 1}. {label}
          </Badge>
        ))}
      </div>

      <Card className="bg-card/70">
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {step === 0 && (
            <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
              <p>
                Este é um canal reservado para relatos de condutas inadequadas. Ele é tratado com sigilo e
                separado da operação técnica.
              </p>
              <ul className="space-y-2">
                <li className="flex gap-2"><Lock className="mt-0.5 h-4 w-4 text-primary" /> Você não precisa se identificar para realizar uma denúncia.</li>
                <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" /> Nenhum dado da sua conta é vinculado a relatos anônimos.</li>
                <li className="flex gap-2"><FileUp className="mt-0.5 h-4 w-4 text-primary" /> Você pode anexar evidências agora ou depois.</li>
              </ul>
              <p>
                Após o envio, guarde seu protocolo e sua chave de acesso para acompanhar o andamento e conversar
                com o RH sem revelar sua identidade.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <TypeCard
                  active={form.reportType === "ANONYMOUS"}
                  title="Denúncia anônima"
                  description="Nenhuma identificação será vinculada ao relato."
                  onClick={() => set("reportType", "ANONYMOUS")}
                />
                <TypeCard
                  active={form.reportType === "IDENTIFIED"}
                  title="Denúncia identificada"
                  description="Você informa seus dados voluntariamente."
                  onClick={() => set("reportType", "IDENTIFIED")}
                />
              </div>

              {form.reportType === "IDENTIFIED" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome (opcional)" value={form.identifiedName} onChange={(v) => set("identifiedName", v)} />
                  <Field label="E-mail (opcional)" value={form.identifiedEmail} onChange={(v) => set("identifiedEmail", v)} />
                  <Field label="Telefone (opcional)" value={form.identifiedPhone} onChange={(v) => set("identifiedPhone", v)} />
                  <Field label="Setor (opcional)" value={form.identifiedDepartment} onChange={(v) => set("identifiedDepartment", v)} />
                </div>
              )}

              <div className="space-y-2">
                <Label>Tipo de relato</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {WB_CATEGORIES.map((cat) => (
                    <button
                      key={cat.slug}
                      type="button"
                      onClick={() => set("categorySlug", cat.slug)}
                      className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                        form.categorySlug === cat.slug
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <Field
                label="Título / resumo"
                value={form.title}
                onChange={(v) => set("title", v)}
                placeholder="Ex.: Situação recorrente de tratamento inadequado no setor."
              />
              <div className="space-y-2">
                <Label htmlFor="wb-descricao">Descrição detalhada</Label>
                <Textarea
                  id="wb-descricao"
                  rows={9}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Conte o que aconteceu, onde, quando, quem estava envolvido, se havia testemunhas e se já ocorreu antes."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Cidade / unidade" value={form.city} onChange={(v) => set("city", v)} />
                <Field label="Unidade / filial" value={form.unit} onChange={(v) => set("unit", v)} />
                <Field label="Setor" value={form.department} onChange={(v) => set("department", v)} />
                <Field label="Local" value={form.locationDescription} onChange={(v) => set("locationDescription", v)} />
                <Field label="Data aproximada" type="date" value={form.incidentDate} onChange={(v) => set("incidentDate", v)} />
                <Field label="Horário aproximado" value={form.incidentTime} onChange={(v) => set("incidentTime", v)} placeholder="Ex.: fim da tarde" />
                <Field label="Pessoa(s) envolvida(s)" value={form.peopleInvolved} onChange={(v) => set("peopleInvolved", v)} />
                <Field label="Testemunhas" value={form.witnesses} onChange={(v) => set("witnesses", v)} />
                <Field label="Frequência do ocorrido" value={form.frequency} onChange={(v) => set("frequency", v)} placeholder="Ex.: já aconteceu outras vezes" />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Você pode anexar imagens, PDFs, documentos, áudios ou vídeos (até {WB_MAX_FILES} arquivos, 6 MB
                cada). Metadados de imagens, como localização, são removidos automaticamente antes do envio.
              </p>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 bg-background/40 px-4 py-8 text-sm text-muted-foreground">
                <FileUp className="h-4 w-4" /> Selecionar arquivos
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void onPickFiles(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="space-y-2">
                {files.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                    <span className="truncate">{f.name}</span>
                    <Button variant="ghost" size="icon" onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-background/40 p-4 text-sm">
                <Review label="Tipo" value={form.reportType === "ANONYMOUS" ? "Denúncia anônima" : "Denúncia identificada"} />
                <Review label="Categoria" value={WB_CATEGORIES.find((c) => c.slug === form.categorySlug)?.label} />
                <Review label="Título" value={form.title} />
                <Review label="Descrição" value={form.description} />
                <Review label="Cidade / unidade" value={[form.city, form.unit].filter(Boolean).join(" • ")} />
                <Review label="Setor / local" value={[form.department, form.locationDescription].filter(Boolean).join(" • ")} />
                <Review label="Data / horário" value={[form.incidentDate, form.incidentTime].filter(Boolean).join(" • ")} />
                <Review label="Envolvidos" value={form.peopleInvolved} />
                <Review label="Testemunhas" value={form.witnesses} />
                <Review label="Frequência" value={form.frequency} />
                <Review label="Evidências" value={files.length ? `${files.length} arquivo(s)` : "Nenhuma"} />
              </div>
              {form.reportType === "ANONYMOUS" && (
                <p className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-muted-foreground">
                  Você escolheu realizar uma denúncia anônima. Nenhuma identificação pessoal informada
                  automaticamente pelo CheckTécnico será vinculada ao relato.
                </p>
              )}
              <label className="flex items-start gap-3 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(Boolean(v))} />
                <span>Confirmo que revisei as informações e desejo registrar este relato.</span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => (step === 0 ? navigate({ to: "/" }) : setStep((s) => s - 1))}
              disabled={sending}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
            </Button>
            {step < STEPS.length - 1 ? (
              <Button size="lg" onClick={next}>
                Continuar <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button size="lg" onClick={submit} disabled={sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                Registrar denúncia
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </Shell>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-primary/40 bg-primary/10 p-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Canal Ético</h1>
              <p className="text-xs text-muted-foreground">Canal de Denúncias — CheckTécnico</p>
            </div>
          </div>
          <Link to="/denuncia/acompanhar" className="text-xs text-primary underline-offset-4 hover:underline">
            Acompanhar denúncia
          </Link>
        </header>
        {children}
      </div>
    </main>
  );
}

function CodeBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-lg">{value}</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success(`${label} copiado.`);
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TypeCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${
        active ? "border-primary bg-primary/10" : "border-border/60 bg-background/40 hover:border-primary/50"
      }`}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Review({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="border-b border-border/40 py-2 last:border-0">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap">{value}</p>
    </div>
  );
}
