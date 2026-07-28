import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FileUp,
  Gauge,
  Image as ImageIcon,
  Loader2,
  Locate,
  MapPin,
  Package,
  Plus,
  Route as RouteIcon,
  Trash2,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WebiCitySelect } from "@/components/checklist/webi-city-select";
import { useChecklistAutoFill } from "@/hooks/use-checklist-autofill";
import { MapRouteEditor } from "@/components/checklist/map-route-editor";
import { supabase } from "@/integrations/supabase/client";
import { generateMapSnapshot } from "@/lib/map-snapshot.functions";
import { getOtdrLaudoUrl } from "@/lib/intervencao-ai.functions";
import {
  CAUSA_OPCOES,
  routeLengthMeters,
  signalGainDb,
} from "@/lib/intervencao";
import type {
  ChecklistRow,
  IntervencaoData,
  MapAtivoTipo,
  OtdrMomento,
  TipoIntervencao,
  YesNo,
} from "@/lib/checklist-schema";

type HeaderShape = Pick<
  ChecklistRow,
  "os" | "cliente" | "cidade" | "endereco" | "data_atendimento" | "hora_atendimento"
>;

type Props = {
  tipo: TipoIntervencao;
  header: HeaderShape;
  data: IntervencaoData;
  checklistId: string;
  tecnicoId: string;
  readOnly?: boolean;
  onHeaderChange: (patch: Partial<HeaderShape>) => void;
  onDataChange: (updater: (prev: IntervencaoData) => IntervencaoData) => void;
};

const TYPES_BY_TIPO: Record<TipoIntervencao, MapAtivoTipo[]> = {
  rompimento: ["INICIO", "ROMPIMENTO", "FUSAO", "POSTE", "FIM", "OUTRO"],
  readequacao: ["INICIO", "POSTE", "CAIXA_EMENDA", "CEO", "CTO", "FIM", "OUTRO"],
  melhoria_sinal: ["CTO", "CEO", "FUSAO", "CAIXA_EMENDA", "POSTE", "OUTRO"],
};

function Section({
  n,
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  n: number;
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden rounded-2xl border-cyan-500/35 bg-[#06152d] text-slate-100 shadow-[inset_0_0_32px_rgba(0,105,255,0.07),0_0_22px_rgba(0,105,255,0.08)]">
      <CardHeader
        className="cursor-pointer select-none border-b border-blue-500/20 pb-3"
        onClick={() => setOpen((v) => !v)}
      >
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-xs text-white shadow-[0_0_16px_rgba(0,119,255,0.35)]">
              {n}
            </span>
            {icon}
            {title}
          </span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="space-y-3 pt-4">{children}</CardContent>}
    </Card>
  );
}

function YesNoToggle({
  value,
  disabled,
  onChange,
}: {
  value: YesNo;
  disabled?: boolean;
  onChange: (v: YesNo) => void;
}) {
  return (
    <div className="flex gap-2">
      {(["sim", "nao"] as const).map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === option ? null : option)}
          className={
            "rounded-md border px-4 py-1.5 text-xs font-semibold uppercase transition " +
            (value === option
              ? "border-cyan-400 bg-blue-600 text-white"
              : "border-blue-500/40 bg-[#071b3a] text-slate-300")
          }
        >
          {option === "sim" ? "Sim" : "Não"}
        </button>
      ))}
    </div>
  );
}

export function IntervencaoForm({
  tipo,
  header,
  data,
  checklistId,
  tecnicoId,
  readOnly,
  onHeaderChange,
  onDataChange,
}: Props) {
  useChecklistAutoFill({ header, readOnly, onHeaderChange });
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [laudoMomento, setLaudoMomento] = useState<OtdrMomento>("depois");
  const [uploading, setUploading] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const extensaoCalc = useMemo(() => routeLengthMeters(data.rota.pontos), [data.rota.pontos]);
  const ganho = useMemo(
    () => signalGainDb(data.sinal.antes_dbm, data.sinal.depois_dbm),
    [data.sinal.antes_dbm, data.sinal.depois_dbm],
  );

  const patch = <K extends keyof IntervencaoData>(
    key: K,
    value: Partial<IntervencaoData[K]>,
  ) =>
    onDataChange((prev) => ({
      ...prev,
      [key]: { ...(prev[key] as object), ...value },
    }));

  const captureGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocalização indisponível neste dispositivo.");
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        patch("rota", {
          gps_tecnico: {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy_m: Math.round(pos.coords.accuracy ?? 0),
            captured_at: new Date().toISOString(),
          },
        });
        setCapturing(false);
        toast.success("GPS do técnico capturado.");
      },
      () => {
        setCapturing(false);
        toast.error("Não foi possível obter o GPS.");
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  const snapshot = useMutation({
    mutationFn: () => generateMapSnapshot({ data: { checklistId, force: true } }),
    onSuccess: (info) => {
      patch("rota", { snapshot: info });
      toast.success("Evidência cartográfica gerada.");
      qc.invalidateQueries({ queryKey: ["checklist", checklistId] });
    },
    onError: (e) => toast.error((e as Error).message || "Falha ao gerar o mapa."),
  });

  async function uploadLaudo(file: File) {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O laudo OTDR deve ter no máximo 15 MB.");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "pdf";
      const path = `${tecnicoId}/${checklistId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("intervencao-laudos")
        .upload(path, file, { contentType: file.type || "application/pdf", upsert: false });
      if (error) throw error;
      onDataChange((prev) => ({
        ...prev,
        otdr: {
          ...prev.otdr,
          realizado: "sim",
          laudos: [
            ...prev.otdr.laudos,
            {
              id: crypto.randomUUID(),
              momento: laudoMomento,
              storage_path: path,
              filename: file.name,
              size_bytes: file.size,
              uploaded_at: new Date().toISOString(),
            },
          ],
        },
      }));
      toast.success("Laudo OTDR anexado.");
    } catch (e) {
      toast.error((e as Error).message || "Falha ao enviar o laudo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const openLaudo = async (path: string) => {
    try {
      const url = await getOtdrLaudoUrl({ data: { path } });
      if (url) window.open(url, "_blank", "noopener");
      else toast.error("Laudo indisponível.");
    } catch {
      toast.error("Não foi possível abrir o laudo.");
    }
  };

  const addMedicao = (momento: OtdrMomento) =>
    onDataChange((prev) => ({
      ...prev,
      otdr: {
        ...prev.otdr,
        realizado: prev.otdr.realizado ?? "sim",
        medicoes: [
          ...prev.otdr.medicoes,
          {
            id: crypto.randomUUID(),
            momento,
            fibra: "",
            distancia_km: "",
            atenuacao_db: "",
            perda_evento_db: "",
            observacao: "",
          },
        ],
      },
    }));

  const setMedicao = (id: string, values: Partial<IntervencaoData["otdr"]["medicoes"][number]>) =>
    onDataChange((prev) => ({
      ...prev,
      otdr: {
        ...prev.otdr,
        medicoes: prev.otdr.medicoes.map((m) => (m.id === id ? { ...m, ...values } : m)),
      },
    }));

  const removeMedicao = (id: string) =>
    onDataChange((prev) => ({
      ...prev,
      otdr: { ...prev.otdr, medicoes: prev.otdr.medicoes.filter((m) => m.id !== id) },
    }));

  return (
    <div className="space-y-4">
      {/* 1. Identificação */}
      <Section n={1} title="Identificação do atendimento" icon={<MapPin className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Ordem de serviço / chamado</Label>
            <Input
              value={header.os ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ os: e.target.value })}
              placeholder="Ex.: OS-88231"
            />
          </div>
          <div>
            <Label>Cidade</Label>
            <WebiCitySelect
              value={header.cidade ?? ""}
              disabled={readOnly}
              onChange={(city) => onHeaderChange({ cidade: city })}
            />
          </div>
          <div>
            <Label>Data</Label>
            <Input
              type="date"
              value={header.data_atendimento ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ data_atendimento: e.target.value })}
            />
          </div>
          <div>
            <Label>Hora</Label>
            <Input
              type="time"
              value={header.hora_atendimento ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ hora_atendimento: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Referência / endereço aproximado</Label>
            <Input
              value={header.endereco ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ endereco: e.target.value })}
              placeholder="Trecho, bairro ou referência da rota"
            />
          </div>
          <div>
            <Label>CTO/NAP relacionada (opcional)</Label>
            <Input
              value={data.contexto.cto_codigo}
              disabled={readOnly}
              onChange={(e) => patch("contexto", { cto_codigo: e.target.value })}
              placeholder="Ex.: CTO-1042"
            />
          </div>
          <div>
            <Label>Clientes afetados (estimativa)</Label>
            <Input
              inputMode="numeric"
              value={data.contexto.afetados_estimados}
              disabled={readOnly}
              onChange={(e) => patch("contexto", { afetados_estimados: e.target.value })}
              placeholder="Ex.: 38"
            />
          </div>
        </div>
      </Section>

      {/* 2. Contexto */}
      <Section n={2} title="Contexto e causa" icon={<AlertTriangle className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Causa</Label>
            <Select
              value={data.contexto.causa || undefined}
              disabled={readOnly}
              onValueChange={(v) => patch("contexto", { causa: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a causa" />
              </SelectTrigger>
              <SelectContent>
                {CAUSA_OPCOES[tipo].map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Urgência</Label>
            <Select
              value={data.contexto.urgencia ?? undefined}
              disabled={readOnly}
              onValueChange={(v) =>
                patch("contexto", { urgencia: v as IntervencaoData["contexto"]["urgencia"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {tipo === "rompimento" && (
            <>
              <div>
                <Label>Início da interrupção</Label>
                <Input
                  type="datetime-local"
                  value={data.contexto.inicio_interrupcao}
                  disabled={readOnly}
                  onChange={(e) => patch("contexto", { inicio_interrupcao: e.target.value })}
                />
              </div>
              <div>
                <Label>Normalização</Label>
                <Input
                  type="datetime-local"
                  value={data.contexto.fim_interrupcao}
                  disabled={readOnly}
                  onChange={(e) => patch("contexto", { fim_interrupcao: e.target.value })}
                />
              </div>
            </>
          )}
          <div className="sm:col-span-2">
            <Label>Descrição da ocorrência</Label>
            <Textarea
              rows={3}
              value={data.contexto.descricao}
              disabled={readOnly}
              onChange={(e) => patch("contexto", { descricao: e.target.value })}
              placeholder="Descreva o que foi encontrado em campo e o que foi executado."
            />
          </div>
        </div>
      </Section>

      {/* 3. Rota georreferenciada */}
      <Section n={3} title="Rota e localização" icon={<RouteIcon className="h-4 w-4" />}>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={readOnly || capturing} onClick={captureGps}>
            {capturing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Locate className="mr-1.5 h-3.5 w-3.5" />}
            Capturar GPS do técnico
          </Button>
          {data.rota.gps_tecnico && (
            <Badge variant="outline" className="font-mono text-[10px]">
              {data.rota.gps_tecnico.lat.toFixed(5)}, {data.rota.gps_tecnico.lng.toFixed(5)} (±
              {data.rota.gps_tecnico.accuracy_m ?? "?"}m)
            </Badge>
          )}
        </div>

        <MapRouteEditor
          points={data.rota.pontos}
          userLocation={data.rota.gps_tecnico}
          readOnly={readOnly}
          initialStyle={data.rota.meta?.basemap_style}
          allowedTypes={TYPES_BY_TIPO[tipo]}
          onChange={(pontos, meta) =>
            patch("rota", {
              pontos,
              meta: {
                map_provider: "arcgis",
                map_engine: "maplibre",
                basemap_style: meta.basemap_style,
                zoom: meta.zoom,
                gps_accuracy_m: data.rota.gps_tecnico?.accuracy_m ?? null,
                distancia_tecnico_ativo_m: null,
              },
            })
          }
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Extensão informada (m)</Label>
            <Input
              inputMode="decimal"
              value={data.rota.extensao_estimada_m}
              disabled={readOnly}
              onChange={(e) => patch("rota", { extensao_estimada_m: e.target.value })}
              placeholder={`Calculado pelos pontos: ${extensaoCalc} m`}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={readOnly || snapshot.isPending || data.rota.pontos.length === 0}
              onClick={() => snapshot.mutate()}
            >
              {snapshot.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="mr-1.5 h-3.5 w-3.5" />
              )}
              Gerar evidência cartográfica
            </Button>
          </div>
        </div>
        {data.rota.snapshot && (
          <p className="text-xs text-emerald-300">
            Evidência gerada em {new Date(data.rota.snapshot.generated_at).toLocaleString("pt-BR")} ·
            SHA-256 {data.rota.snapshot.sha256.slice(0, 16)}…
          </p>
        )}
      </Section>

      {/* 4. Materiais */}
      <Section n={4} title="Materiais aplicados" icon={<Package className="h-4 w-4" />} defaultOpen={false}>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <Label>Tipo de cabo</Label>
            <Input
              value={data.materiais.cabo_tipo}
              disabled={readOnly}
              onChange={(e) => patch("materiais", { cabo_tipo: e.target.value })}
              placeholder="Ex.: ASU 12FO"
            />
          </div>
          <div>
            <Label>Cabo (m)</Label>
            <Input
              inputMode="decimal"
              value={data.materiais.cabo_metros}
              disabled={readOnly}
              onChange={(e) => patch("materiais", { cabo_metros: e.target.value })}
            />
          </div>
          <div>
            <Label>Fusões</Label>
            <Input
              inputMode="numeric"
              value={data.materiais.fusoes_qtd}
              disabled={readOnly}
              onChange={(e) => patch("materiais", { fusoes_qtd: e.target.value })}
            />
          </div>
          <div>
            <Label>Conectores</Label>
            <Input
              inputMode="numeric"
              value={data.materiais.conectores_qtd}
              disabled={readOnly}
              onChange={(e) => patch("materiais", { conectores_qtd: e.target.value })}
            />
          </div>
          <div>
            <Label>Postes utilizados</Label>
            <Input
              inputMode="numeric"
              value={data.materiais.postes_qtd}
              disabled={readOnly}
              onChange={(e) => patch("materiais", { postes_qtd: e.target.value })}
            />
          </div>
          <div className="sm:col-span-3">
            <Label>Outros materiais</Label>
            <Textarea
              rows={2}
              value={data.materiais.outros}
              disabled={readOnly}
              onChange={(e) => patch("materiais", { outros: e.target.value })}
            />
          </div>
        </div>
      </Section>

      {/* 5. OTDR */}
      <Section n={5} title="Medições OTDR" icon={<Activity className="h-4 w-4" />}>
        <div className="flex flex-wrap items-center gap-3">
          <Label className="m-0">Ensaio OTDR realizado?</Label>
          <YesNoToggle
            value={data.otdr.realizado}
            disabled={readOnly}
            onChange={(v) => patch("otdr", { realizado: v })}
          />
        </div>

        {data.otdr.realizado === "sim" && (
          <>
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => addMedicao("antes")}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Medição antes
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => addMedicao("depois")}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Medição depois
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {data.otdr.medicoes.map((m) => (
                <div
                  key={m.id}
                  className="grid gap-2 rounded-lg border border-blue-500/25 bg-[#031027] p-2 sm:grid-cols-6"
                >
                  <Badge
                    className={
                      m.momento === "antes"
                        ? "self-center bg-amber-500/15 text-amber-300"
                        : "self-center bg-emerald-500/15 text-emerald-300"
                    }
                  >
                    {m.momento === "antes" ? "Antes" : "Depois"}
                  </Badge>
                  <Input
                    value={m.fibra}
                    disabled={readOnly}
                    placeholder="Fibra"
                    onChange={(e) => setMedicao(m.id, { fibra: e.target.value })}
                  />
                  <Input
                    value={m.distancia_km}
                    disabled={readOnly}
                    placeholder="Dist. (km)"
                    onChange={(e) => setMedicao(m.id, { distancia_km: e.target.value })}
                  />
                  <Input
                    value={m.atenuacao_db}
                    disabled={readOnly}
                    placeholder="Atenuação (dB)"
                    onChange={(e) => setMedicao(m.id, { atenuacao_db: e.target.value })}
                  />
                  <Input
                    value={m.perda_evento_db}
                    disabled={readOnly}
                    placeholder="Perda evento (dB)"
                    onChange={(e) => setMedicao(m.id, { perda_evento_db: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Input
                      value={m.observacao}
                      disabled={readOnly}
                      placeholder="Obs."
                      onChange={(e) => setMedicao(m.id, { observacao: e.target.value })}
                    />
                    {!readOnly && (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => removeMedicao(m.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-2 rounded-lg border border-blue-500/25 bg-[#031027] p-3">
              <p className="text-sm font-semibold">Laudos anexados (PDF/imagem do OTDR)</p>
              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={laudoMomento} onValueChange={(v) => setLaudoMomento(v as OtdrMomento)}>
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="antes">Antes</SelectItem>
                      <SelectItem value="depois">Depois</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,image/*,.sor,.trc"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadLaudo(file);
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileUp className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Anexar laudo
                  </Button>
                </div>
              )}
              {data.otdr.laudos.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum laudo anexado.</p>
              ) : (
                <ul className="space-y-1">
                  {data.otdr.laudos.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">{l.momento === "antes" ? "Antes" : "Depois"}</Badge>
                      <button
                        type="button"
                        className="truncate text-cyan-300 underline-offset-2 hover:underline"
                        onClick={() => void openLaudo(l.storage_path)}
                      >
                        {l.filename}
                      </button>
                      <span className="text-slate-500">{Math.round(l.size_bytes / 1024)} KB</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </Section>

      {/* 6. Sinal (melhoria e demais) */}
      <Section
        n={6}
        title="Potência óptica antes e depois"
        icon={<Gauge className="h-4 w-4" />}
        defaultOpen={tipo === "melhoria_sinal"}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Antes (dBm)</Label>
            <Input
              inputMode="decimal"
              value={data.sinal.antes_dbm}
              disabled={readOnly}
              onChange={(e) => patch("sinal", { antes_dbm: e.target.value })}
              placeholder="-27,4"
            />
          </div>
          <div>
            <Label>Depois (dBm)</Label>
            <Input
              inputMode="decimal"
              value={data.sinal.depois_dbm}
              disabled={readOnly}
              onChange={(e) => patch("sinal", { depois_dbm: e.target.value })}
              placeholder="-19,8"
            />
          </div>
          <div>
            <Label>Ganho apurado</Label>
            <div
              className={
                "flex h-10 items-center rounded-md border px-3 text-sm font-bold " +
                (ganho === null
                  ? "border-slate-600 text-slate-400"
                  : ganho >= 1
                    ? "border-emerald-500/50 text-emerald-300"
                    : "border-amber-500/50 text-amber-300")
              }
            >
              {ganho === null ? "—" : `${ganho > 0 ? "+" : ""}${ganho} dB`}
            </div>
          </div>
          <div className="sm:col-span-3">
            <Label>Cliente/circuito de referência</Label>
            <Input
              value={data.sinal.cliente_afetado}
              disabled={readOnly}
              onChange={(e) => patch("sinal", { cliente_afetado: e.target.value })}
              placeholder="Cliente ou circuito usado como referência da medição"
            />
          </div>
        </div>
      </Section>

      {/* 7. Execução e resultado */}
      <Section n={7} title="Execução e resultado" icon={<Activity className="h-4 w-4" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Equipe</Label>
            <Input
              value={data.execucao.equipe}
              disabled={readOnly}
              onChange={(e) => patch("execucao", { equipe: e.target.value })}
              placeholder="Nomes / identificação da equipe"
            />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Label>Intervenção concluída?</Label>
              <YesNoToggle
                value={data.execucao.concluida}
                disabled={readOnly}
                onChange={(v) => patch("execucao", { concluida: v })}
              />
            </div>
          </div>
          <div>
            <Label>Início da execução</Label>
            <Input
              type="time"
              value={data.execucao.inicio}
              disabled={readOnly}
              onChange={(e) => patch("execucao", { inicio: e.target.value })}
            />
          </div>
          <div>
            <Label>Fim da execução</Label>
            <Input
              type="time"
              value={data.execucao.fim}
              disabled={readOnly}
              onChange={(e) => patch("execucao", { fim: e.target.value })}
            />
          </div>
          <div>
            <Label>Estado final</Label>
            <Select
              value={data.resultado.estado ?? undefined}
              disabled={readOnly}
              onValueChange={(v) =>
                patch("resultado", { estado: v as IntervencaoData["resultado"]["estado"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="resolvido">Resolvido</SelectItem>
                <SelectItem value="paliativo">Paliativo</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Pendência (se houver)</Label>
            <Input
              value={data.execucao.pendencia}
              disabled={readOnly}
              onChange={(e) => patch("execucao", { pendencia: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Observações finais</Label>
            <Textarea
              rows={3}
              value={data.resultado.observacoes}
              disabled={readOnly}
              onChange={(e) => patch("resultado", { observacoes: e.target.value })}
            />
          </div>
        </div>
      </Section>
    </div>
  );
}
