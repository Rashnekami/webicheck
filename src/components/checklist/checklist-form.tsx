import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChecklistData, ChecklistRow, YesNo } from "@/lib/checklist-schema";

type Props = {
  header: Pick<
    ChecklistRow,
    | "os"
    | "cliente"
    | "cidade"
    | "modelo"
    | "serial"
    | "cto_porta"
    | "data_atendimento"
    | "hora_atendimento"
    | "troca_realizada"
    | "modelo_ont_retirada"
    | "serial_ont_retirada"
    | "modelo_ont_instalada"
    | "serial_ont_instalada"
  >;
  data: ChecklistData;
  readOnly?: boolean;
  onHeaderChange: (patch: Partial<Props["header"]>) => void;
  onDataChange: (patch: (prev: ChecklistData) => ChecklistData) => void;
};

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</div>;
}

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

function YesNoField({
  value,
  onChange,
  label,
  disabled,
}: {
  value: YesNo;
  onChange: (v: YesNo) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <RadioGroup
        value={value ?? ""}
        onValueChange={(v) => onChange((v as YesNo) || null)}
        className="flex gap-4"
        disabled={disabled}
      >
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="sim" /> Sim
        </label>
        <label className="flex items-center gap-2 text-sm">
          <RadioGroupItem value="nao" /> Não
        </label>
      </RadioGroup>
    </div>
  );
}

export function ChecklistForm({
  header,
  data,
  readOnly,
  onHeaderChange,
  onDataChange,
}: Props) {
  const set =
    <K extends keyof ChecklistData>(section: K) =>
    (patch: Partial<ChecklistData[K]>) =>
      onDataChange((prev) => ({
        ...prev,
        [section]: { ...(prev[section] as object), ...(patch as object) },
      })) as unknown as void;

  const s = data;

  return (
    <div className="space-y-4">
      <Section n={1} title="Identificação do atendimento">
        <Row>
          <div className="space-y-1.5">
            <Label>OS</Label>
            <Input
              value={header.os ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ os: e.target.value })}
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
          <div className="space-y-1.5">
            <Label>CTO/Porta</Label>
            <Input
              value={header.cto_porta ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ cto_porta: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Modelo da ONT</Label>
            <Input
              value={header.modelo ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ modelo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Serial</Label>
            <Input
              value={header.serial ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ serial: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data do atendimento</Label>
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
            <Label>Hora do atendimento</Label>
            <Input
              type="time"
              value={header.hora_atendimento ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onHeaderChange({ hora_atendimento: e.target.value || null })
              }
            />
          </div>
        </Row>
      </Section>

      <Section n={2} title="Sintoma confirmado em campo">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Cb
            checked={s.sintoma.ont_nao_liga}
            onCheckedChange={(v) => set("sintoma")({ ont_nao_liga: v })}
            label="ONT não liga"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.ont_reinicia}
            onCheckedChange={(v) => set("sintoma")({ ont_reinicia: v })}
            label="ONT reinicia/desliga"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.perde_internet}
            onCheckedChange={(v) => set("sintoma")({ perde_internet: v })}
            label="Perde internet/provisionamento"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.internet_cai_pon_acesa}
            onCheckedChange={(v) =>
              set("sintoma")({ internet_cai_pon_acesa: v })
            }
            label="Internet cai com PON acesa"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.los_acende}
            onCheckedChange={(v) => set("sintoma")({ los_acende: v })}
            label="LOS acende"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.wifi_5g_desaparece}
            onCheckedChange={(v) => set("sintoma")({ wifi_5g_desaparece: v })}
            label="Wi-Fi 5 GHz desaparece"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.wifi_ambas_desaparecem}
            onCheckedChange={(v) =>
              set("sintoma")({ wifi_ambas_desaparecem: v })
            }
            label="Wi-Fi 2,4 e 5 GHz desaparecem"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.wifi_falha_cabo_ok}
            onCheckedChange={(v) => set("sintoma")({ wifi_falha_cabo_ok: v })}
            label="Wi-Fi falha, mas o cabo continua funcionando"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.lan_nao_funciona}
            onCheckedChange={(v) => set("sintoma")({ lan_nao_funciona: v })}
            label="Porta LAN não funciona"
            disabled={readOnly}
          />
          <Cb
            checked={s.sintoma.lentidao}
            onCheckedChange={(v) => set("sintoma")({ lentidao: v })}
            label="Lentidão"
            disabled={readOnly}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Outro sintoma</Label>
          <Input
            value={s.sintoma.outro_texto}
            disabled={readOnly}
            onChange={(e) => set("sintoma")({ outro_texto: e.target.value })}
          />
        </div>
        <Row>
          <YesNoField
            label="Falha presenciada?"
            value={s.sintoma.falha_presenciada}
            onChange={(v) => set("sintoma")({ falha_presenciada: v })}
            disabled={readOnly}
          />
          <div className="space-y-1.5">
            <Label>Horário</Label>
            <Input
              type="time"
              value={s.sintoma.horario}
              disabled={readOnly}
              onChange={(e) => set("sintoma")({ horario: e.target.value })}
            />
          </div>
        </Row>
      </Section>

      <Section n={3} title="Validação física">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Cb
            checked={s.validacao_fisica.tomada}
            onCheckedChange={(v) => set("validacao_fisica")({ tomada: v })}
            label="Tomada e alimentação verificadas"
            disabled={readOnly}
          />
          <Cb
            checked={s.validacao_fisica.fonte}
            onCheckedChange={(v) => set("validacao_fisica")({ fonte: v })}
            label="Fonte e conector verificados"
            disabled={readOnly}
          />
          <Cb
            checked={s.validacao_fisica.outra_tomada}
            onCheckedChange={(v) =>
              set("validacao_fisica")({ outra_tomada: v })
            }
            label="Testada em outra tomada"
            disabled={readOnly}
          />
          <Cb
            checked={s.validacao_fisica.outra_fonte}
            onCheckedChange={(v) =>
              set("validacao_fisica")({ outra_fonte: v })
            }
            label="Testada com outra fonte homologada"
            disabled={readOnly}
          />
          <Cb
            checked={s.validacao_fisica.patch_cord}
            onCheckedChange={(v) => set("validacao_fisica")({ patch_cord: v })}
            label="Patch cord óptico e conectores verificados"
            disabled={readOnly}
          />
          <Cb
            checked={s.validacao_fisica.sem_dobras}
            onCheckedChange={(v) => set("validacao_fisica")({ sem_dobras: v })}
            label="Sem dobras/rompimento no cabo óptico"
            disabled={readOnly}
          />
          <Cb
            checked={s.validacao_fisica.luz_verde_ok}
            onCheckedChange={(v) =>
              set("validacao_fisica")({ luz_verde_ok: v })
            }
            label="LED PON/Óptico OK"
            disabled={readOnly}
          />
          <Cb
            checked={s.validacao_fisica.roseta_ok}
            onCheckedChange={(v) => set("validacao_fisica")({ roseta_ok: v })}
            label="Roseta/adaptador em boas condições"
            disabled={readOnly}
          />
        </div>
      </Section>

      <Section n={4} title="Teste cabeado">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Cb
            checked={s.teste_cabeado.navegacao}
            onCheckedChange={(v) => set("teste_cabeado")({ navegacao: v })}
            label="Navegação testada"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_cabeado.ping}
            onCheckedChange={(v) => set("teste_cabeado")({ ping: v })}
            label="Ping testado"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_cabeado.velocidade}
            onCheckedChange={(v) => set("teste_cabeado")({ velocidade: v })}
            label="Velocidade testada"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_cabeado.cabo_substituido}
            onCheckedChange={(v) =>
              set("teste_cabeado")({ cabo_substituido: v })
            }
            label="Cabo substituído para teste"
            disabled={readOnly}
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label>Download (Mbps)</Label>
            <Input
              inputMode="decimal"
              value={s.teste_cabeado.download}
              disabled={readOnly}
              onChange={(e) =>
                set("teste_cabeado")({ download: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Upload (Mbps)</Label>
            <Input
              inputMode="decimal"
              value={s.teste_cabeado.upload}
              disabled={readOnly}
              onChange={(e) =>
                set("teste_cabeado")({ upload: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ping (ms)</Label>
            <Input
              inputMode="numeric"
              value={s.teste_cabeado.ping_ms}
              disabled={readOnly}
              onChange={(e) =>
                set("teste_cabeado")({ ping_ms: e.target.value })
              }
            />
          </div>
        </div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Resultado
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Cb
            checked={s.teste_cabeado.funcionou}
            onCheckedChange={(v) => set("teste_cabeado")({ funcionou: v })}
            label="Funcionou normalmente"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_cabeado.apresentou_falha}
            onCheckedChange={(v) =>
              set("teste_cabeado")({ apresentou_falha: v })
            }
            label="Também apresentou falha"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_cabeado.ont_reiniciou}
            onCheckedChange={(v) =>
              set("teste_cabeado")({ ont_reiniciou: v })
            }
            label="ONT reiniciou"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_cabeado.lan_falhou}
            onCheckedChange={(v) => set("teste_cabeado")({ lan_falhou: v })}
            label="Porta LAN não funcionou"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_cabeado.nao_testado}
            onCheckedChange={(v) => set("teste_cabeado")({ nao_testado: v })}
            label="Não foi possível testar"
            disabled={readOnly}
          />
        </div>
      </Section>

      <Section n={5} title="Teste Wi-Fi">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Cb
            checked={s.teste_wifi.rede_24}
            onCheckedChange={(v) => set("teste_wifi")({ rede_24: v })}
            label="Rede 2,4 GHz testada"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_wifi.rede_5}
            onCheckedChange={(v) => set("teste_wifi")({ rede_5: v })}
            label="Rede 5 GHz testada"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_wifi.mais_aparelhos}
            onCheckedChange={(v) => set("teste_wifi")({ mais_aparelhos: v })}
            label="Testado em mais de um aparelho"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_wifi.cabo_funcionando}
            onCheckedChange={(v) =>
              set("teste_wifi")({ cabo_funcionando: v })
            }
            label="Confirmado se o cabo permanece funcionando"
            disabled={readOnly}
          />
        </div>
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Resultado
        </Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Cb
            checked={s.teste_wifi.apenas_5g_desaparece}
            onCheckedChange={(v) =>
              set("teste_wifi")({ apenas_5g_desaparece: v })
            }
            label="Apenas o 5 GHz desaparece"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_wifi.ambas_desaparecem}
            onCheckedChange={(v) =>
              set("teste_wifi")({ ambas_desaparecem: v })
            }
            label="As duas redes desaparecem"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_wifi.sem_internet}
            onCheckedChange={(v) => set("teste_wifi")({ sem_internet: v })}
            label="Wi-Fi visível, mas sem internet"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_wifi.um_aparelho}
            onCheckedChange={(v) => set("teste_wifi")({ um_aparelho: v })}
            label="Ocorreu apenas em um aparelho"
            disabled={readOnly}
          />
          <Cb
            checked={s.teste_wifi.nao_reproduzida}
            onCheckedChange={(v) => set("teste_wifi")({ nao_reproduzida: v })}
            label="Falha não foi reproduzida"
            disabled={readOnly}
          />
        </div>
      </Section>

      <Section n={6} title="Evidências marcadas (fotos anexadas abaixo)">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Cb
            checked={s.evidencias_marcadas.etiqueta}
            onCheckedChange={(v) =>
              set("evidencias_marcadas")({ etiqueta: v })
            }
            label="Foto da etiqueta (modelo e serial)"
            disabled={readOnly}
          />
          <Cb
            checked={s.evidencias_marcadas.leds}
            onCheckedChange={(v) => set("evidencias_marcadas")({ leds: v })}
            label="Foto dos LEDs da ONT"
            disabled={readOnly}
          />
          <Cb
            checked={s.evidencias_marcadas.fonte}
            onCheckedChange={(v) => set("evidencias_marcadas")({ fonte: v })}
            label="Foto da fonte/conexões"
            disabled={readOnly}
          />
          <Cb
            checked={s.evidencias_marcadas.teste_cabeado}
            onCheckedChange={(v) =>
              set("evidencias_marcadas")({ teste_cabeado: v })
            }
            label="Evidência do teste cabeado"
            disabled={readOnly}
          />
          <Cb
            checked={s.evidencias_marcadas.teste_wifi}
            onCheckedChange={(v) =>
              set("evidencias_marcadas")({ teste_wifi: v })
            }
            label="Evidência do teste Wi-Fi"
            disabled={readOnly}
          />
        </div>
      </Section>

      <Section n={7} title="Resultado após reset/teste final">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Cb
            checked={s.resultado_final.permaneceu}
            onCheckedChange={(v) =>
              set("resultado_final")({ permaneceu: v })
            }
            label="Falha permaneceu"
            disabled={readOnly}
          />
          <Cb
            checked={s.resultado_final.parou}
            onCheckedChange={(v) => set("resultado_final")({ parou: v })}
            label="Falha parou"
            disabled={readOnly}
          />
          <Cb
            checked={s.resultado_final.nao_reproduzida}
            onCheckedChange={(v) =>
              set("resultado_final")({ nao_reproduzida: v })
            }
            label="Não foi reproduzida"
            disabled={readOnly}
          />
        </div>
        <Row>
          <YesNoField
            label="Solicitação encaminhada ao NOC?"
            value={s.resultado_final.encaminhado_noc}
            onChange={(v) => set("resultado_final")({ encaminhado_noc: v })}
            disabled={readOnly}
          />
          <YesNoField
            label="Interrompeu o atendimento?"
            value={s.resultado_final.interrompeu}
            onChange={(v) => set("resultado_final")({ interrompeu: v })}
            disabled={readOnly}
          />
        </Row>
        <div className="space-y-1.5">
          <Label>Motivo (quando aplicável)</Label>
          <Textarea
            rows={3}
            value={s.resultado_final.motivo}
            disabled={readOnly}
            onChange={(e) =>
              set("resultado_final")({ motivo: e.target.value })
            }
          />
        </div>
      </Section>

      <Section n={8} title="Relato objetivo do técnico">
        <Textarea
          rows={6}
          placeholder="O que aconteceu e em qual teste a falha apareceu?"
          value={s.relato}
          disabled={readOnly}
          onChange={(e) => onDataChange((p) => ({ ...p, relato: e.target.value }))}
        />
      </Section>

      <Section n={9} title="Equipamento e conclusão da troca">
        <YesNoField
          label="A ONT foi fisicamente substituída neste atendimento?"
          value={
            header.troca_realizada === true
              ? "sim"
              : header.troca_realizada === false
                ? "nao"
                : null
          }
          onChange={(v) =>
            onHeaderChange({
              troca_realizada: v === "sim" ? true : v === "nao" ? false : null,
            })
          }
          disabled={readOnly}
        />
        <p className="text-xs text-muted-foreground">
          Registre os dados do equipamento retirado. Se houve troca, preencha
          também o equipamento instalado.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Modelo da ONT retirada</Label>
            <Input
              value={header.modelo_ont_retirada ?? header.modelo ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onHeaderChange({ modelo_ont_retirada: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Serial da ONT retirada</Label>
            <Input
              value={header.serial_ont_retirada ?? header.serial ?? ""}
              disabled={readOnly}
              onChange={(e) =>
                onHeaderChange({ serial_ont_retirada: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Modelo da ONT instalada</Label>
            <Input
              value={header.modelo_ont_instalada ?? ""}
              disabled={readOnly || header.troca_realizada !== true}
              placeholder={
                header.troca_realizada === true
                  ? ""
                  : "Preencha somente se houve troca"
              }
              onChange={(e) =>
                onHeaderChange({ modelo_ont_instalada: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Serial da ONT instalada</Label>
            <Input
              value={header.serial_ont_instalada ?? ""}
              disabled={readOnly || header.troca_realizada !== true}
              placeholder={
                header.troca_realizada === true
                  ? ""
                  : "Preencha somente se houve troca"
              }
              onChange={(e) =>
                onHeaderChange({ serial_ont_instalada: e.target.value })
              }
            />
          </div>
        </div>
      </Section>

      <Section n={10} title="Registro da autorização do NOC">
        <YesNoField
          label="Troca autorizada pelo NOC?"
          value={s.noc.autorizada}
          onChange={(v) => set("noc")({ autorizada: v })}
          disabled={readOnly}
        />
        <Row>
          <div className="space-y-1.5">
            <Label>Analista responsável</Label>
            <Input
              value={s.noc.analista}
              disabled={readOnly}
              onChange={(e) => set("noc")({ analista: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Protocolo/OS do NOC</Label>
            <Input
              value={s.noc.protocolo}
              disabled={readOnly}
              onChange={(e) => set("noc")({ protocolo: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input
              type="date"
              value={s.noc.data}
              disabled={readOnly}
              onChange={(e) => set("noc")({ data: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hora</Label>
            <Input
              type="time"
              value={s.noc.hora}
              disabled={readOnly}
              onChange={(e) => set("noc")({ hora: e.target.value })}
            />
          </div>
        </Row>
      </Section>
    </div>
  );
}
