import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SignaturePad } from "@/components/signature-pad";
import { PenLine } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { ChecklistRow, InstalacaoData } from "@/lib/checklist-schema";

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

function Cb({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border border-input bg-background p-2.5 text-sm hover:bg-accent/40">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(!!v)}
        disabled={disabled}
        className="mt-0.5"
      />
      <span className="leading-snug">{label}</span>
    </label>
  );
}

export function InstalacaoForm({
  header,
  data,
  readOnly,
  onHeaderChange,
  onDataChange,
}: Props) {
  const [sigOpen, setSigOpen] = useState(false);
  const [sigDraft, setSigDraft] = useState<string | null>(null);

  const setItens = (patch: Partial<InstalacaoData["itens"]>) =>
    onDataChange((p) => ({ ...p, itens: { ...p.itens, ...patch } }));
  const setVel = (patch: Partial<InstalacaoData["velocidade"]>) =>
    onDataChange((p) => ({ ...p, velocidade: { ...p.velocidade, ...patch } }));

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

      <Section n={2} title="Validação técnica e orientação ao cliente">
        <div className="grid grid-cols-1 gap-2">
          <Cb
            checked={data.itens.velocidade_ok}
            onCheckedChange={(v) => setItens({ velocidade_ok: v })}
            label="Teste de velocidade realizado via cabo/roteador, comprovando a entrega da banda contratada."
            disabled={readOnly}
          />
          <Cb
            checked={data.itens.navegacao_ok}
            onCheckedChange={(v) => setItens({ navegacao_ok: v })}
            label="Navegação e estabilidade da conexão validadas no momento da instalação."
            disabled={readOnly}
          />
          <Cb
            checked={data.itens.wifi_orientado}
            onCheckedChange={(v) => setItens({ wifi_orientado: v })}
            label="Cliente orientado sobre a diferença das redes Wi-Fi: 5 GHz (maior velocidade, menor alcance) e 2,4 GHz (maior alcance, menor velocidade)."
            disabled={readOnly}
          />
          <Cb
            checked={data.itens.placa_orientado}
            onCheckedChange={(v) => setItens({ placa_orientado: v })}
            label="Cliente orientado que a velocidade via Wi-Fi depende da capacidade da placa de rede do aparelho (celular, TV, console, etc.)."
            disabled={readOnly}
          />
          <Cb
            checked={data.itens.cabo_orientado}
            onCheckedChange={(v) => setItens({ cabo_orientado: v })}
            label="Orientado a utilizar cabo de rede em Smart TVs, videogames e equipamentos que exigem maior estabilidade."
            disabled={readOnly}
          />
          <Cb
            checked={data.itens.posicionamento_ok}
            onCheckedChange={(v) => setItens({ posicionamento_ok: v })}
            label="Posicionamento do roteador validado e orientado sobre possíveis interferências físicas (paredes, móveis, espelhos, eletrodomésticos, etc.)."
            disabled={readOnly}
          />
          <Cb
            checked={data.itens.downdetector}
            onCheckedChange={(v) => setItens({ downdetector: v })}
            label="Apresentado o site Downdetector ao cliente e orientado a verificar possíveis quedas globais de aplicativos antes de acionar o suporte."
            disabled={readOnly}
          />
          <Cb
            checked={data.itens.duvidas_sanadas}
            onCheckedChange={(v) => setItens({ duvidas_sanadas: v })}
            label="Dúvidas finais do cliente sanadas no local."
            disabled={readOnly}
          />
        </div>
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
      </Section>

      <Section n={5} title="Assinatura do cliente">
        <div className="rounded-lg border bg-muted/30 p-3">
          {data.assinatura_cliente ? (
            <img
              src={data.assinatura_cliente}
              alt="Assinatura do cliente"
              className="mx-auto h-28 object-contain"
            />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Cliente ainda não assinou.
            </p>
          )}
        </div>
        {!readOnly && (
          <Button
            variant="outline"
            onClick={() => {
              setSigDraft(data.assinatura_cliente ?? null);
              setSigOpen(true);
            }}
          >
            <PenLine className="mr-1.5 h-4 w-4" />
            {data.assinatura_cliente ? "Refazer assinatura" : "Coletar assinatura do cliente"}
          </Button>
        )}
      </Section>

      <Dialog open={sigOpen} onOpenChange={setSigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assinatura do cliente</DialogTitle>
            <DialogDescription>
              Peça ao cliente para assinar com o dedo ou caneta.
            </DialogDescription>
          </DialogHeader>
          <SignaturePad value={sigDraft} onChange={setSigDraft} height={180} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSigOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                onDataChange((p) => ({ ...p, assinatura_cliente: sigDraft }));
                setSigOpen(false);
              }}
              disabled={!sigDraft}
            >
              Confirmar assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
