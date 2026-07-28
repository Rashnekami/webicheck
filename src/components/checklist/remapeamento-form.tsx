import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  MapPin,
  Locate,
  Plus,
  Trash2,
  Wifi,
  Camera,
  Images,
  Loader2,
  Activity,
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
import { MapPicker } from "@/components/checklist/map-picker";
import {
  FIBER_COLORS,
  computeSplitterStats,
  fiberColorBySlug,
  haversineMeters,
  portsForSplitter,
  reconcilePorts,
} from "@/lib/remapeamento-fibers";
import type {
  ChecklistRow,
  RemapPortStatus,
  RemapeamentoData,
  SplitterKind,
} from "@/lib/checklist-schema";
import {
  deleteFoto,
  listFotos,
  signedFotoUrl,
  uploadFoto,
} from "@/lib/checklists";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type HeaderShape = Pick<
  ChecklistRow,
  "os" | "cliente" | "cidade" | "endereco" | "data_atendimento" | "hora_atendimento"
>;

type Props = {
  header: HeaderShape;
  data: RemapeamentoData;
  checklistId: string;
  tecnicoId: string;
  readOnly?: boolean;
  onHeaderChange: (patch: Partial<HeaderShape>) => void;
  onDataChange: (updater: (prev: RemapeamentoData) => RemapeamentoData) => void;
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

export function RemapeamentoForm({
  header,
  data,
  checklistId,
  tecnicoId,
  readOnly,
  onHeaderChange,
  onDataChange,
}: Props) {
  useChecklistAutoFill({ header, readOnly, onHeaderChange });
  const stats = useMemo(() => computeSplitterStats(data), [data]);

  const setSplitter = (patch: Partial<RemapeamentoData["splitter"]>) =>
    onDataChange((p) => {
      const next = { ...p, splitter: { ...p.splitter, ...patch } };
      if (patch.tipo !== undefined && patch.tipo !== p.splitter.tipo) {
        next.portas =
          patch.tipo && patch.tipo !== "outro"
            ? portsForSplitter(patch.tipo)
            : reconcilePorts(p.portas, p.portas.length);
      }
      return next;
    });

  const setPorta = (numero: number, patch: Partial<RemapeamentoData["portas"][number]>) =>
    onDataChange((p) => ({
      ...p,
      portas: p.portas.map((port) => (port.numero === numero ? { ...port, ...patch } : port)),
    }));

  const setCountForOutro = (count: number) =>
    onDataChange((p) => ({ ...p, portas: reconcilePorts(p.portas, Math.max(0, count)) }));

  // Geolocalização
  const [capturing, setCapturing] = useState(false);
  const captureGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocalização indisponível neste dispositivo.");
      return;
    }
    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const gps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: Math.round(pos.coords.accuracy ?? 0),
          captured_at: new Date().toISOString(),
        };
        onDataChange((p) => ({
          ...p,
          localizacao: { ...p.localizacao, gps_original: gps, confirmada: p.localizacao.confirmada ?? { lat: gps.lat, lng: gps.lng } },
        }));
        setCapturing(false);
      },
      (err) => {
        setCapturing(false);
        toast.error(`Não foi possível capturar GPS: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  const confirmMarker = (lat: number, lng: number) => {
    onDataChange((p) => {
      const distancia =
        p.localizacao.gps_original
          ? haversineMeters(p.localizacao.gps_original, { lat, lng })
          : null;
      return {
        ...p,
        localizacao: { ...p.localizacao, confirmada: { lat, lng }, distancia_m: distancia },
      };
    });
    toast.success("Posição da CTO confirmada.");
  };

  // Fusões
  const addFusao = () =>
    onDataChange((p) => ({
      ...p,
      fusao: {
        ...p.fusao,
        itens: [...p.fusao.itens, { fibra: "", motivo: "", antes_dbm: "", depois_dbm: "" }],
      },
    }));
  const removeFusao = (idx: number) =>
    onDataChange((p) => ({
      ...p,
      fusao: { ...p.fusao, itens: p.fusao.itens.filter((_, i) => i !== idx) },
    }));
  const setFusao = (idx: number, patch: Partial<RemapeamentoData["fusao"]["itens"][number]>) =>
    onDataChange((p) => ({
      ...p,
      fusao: {
        ...p.fusao,
        itens: p.fusao.itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
      },
    }));

  return (
    <div className="space-y-4 rounded-3xl border border-blue-500/30 bg-[#020817] p-3 text-slate-100 shadow-[inset_0_0_48px_rgba(0,105,255,0.08),0_0_28px_rgba(0,105,255,0.12)] sm:p-5 [&_input]:border-cyan-500/35 [&_input]:bg-[#041126] [&_input]:text-slate-100 [&_input]:placeholder:text-slate-500 [&_label]:text-slate-300 [&_textarea]:border-cyan-500/35 [&_textarea]:bg-[#041126] [&_textarea]:text-slate-100">
      <div className="rounded-2xl border border-blue-500/35 bg-[radial-gradient(circle_at_top_right,rgba(0,170,255,.18),transparent_38%),linear-gradient(145deg,#06152d,#020817)] px-4 py-5 text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/50 bg-blue-600/20 text-cyan-300 shadow-[0_0_22px_rgba(0,200,255,.2)]">
          <Wifi className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-black tracking-wide text-white">
          REMAPEAMENTO DE <span className="text-cyan-300">CTO / NAP</span>
        </h2>
        <p className="mt-1 text-sm text-slate-400">Identificação e mapeamento de portas do splitter</p>
      </div>

      {/* 1 Identificação */}
      <Section n={1} title="Identificação">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Código/identificação da CTO / NAP</Label>
            <Input
              value={data.identificacao.cto_codigo}
              disabled={readOnly}
              placeholder="Ex.: CTO-CTR-042"
              onChange={(e) =>
                onDataChange((p) => ({ ...p, identificacao: { ...p.identificacao, cto_codigo: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cidade</Label>
            <WebiCitySelect
              value={header.cidade}
              disabled={readOnly}
              dark
              onChange={(cidade) => onHeaderChange({ cidade })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Setor / região</Label>
            <Input
              value={data.identificacao.setor}
              disabled={readOnly}
              placeholder="Ex.: Centro, Jd. Primavera"
              onChange={(e) =>
                onDataChange((p) => ({ ...p, identificacao: { ...p.identificacao, setor: e.target.value } }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Data</Label>
            <Input
              type="date"
              value={header.data_atendimento ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ data_atendimento: e.target.value || null })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hora</Label>
            <Input
              type="time"
              value={header.hora_atendimento ?? ""}
              disabled={readOnly}
              onChange={(e) => onHeaderChange({ hora_atendimento: e.target.value || null })}
            />
          </div>
        </div>
      </Section>

      {/* 2 Localização */}
      <Section n={2} title="Localização da CTO" icon={<MapPin className="h-4 w-4 text-cyan-300" />}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={captureGps} disabled={readOnly || capturing}>
            {capturing ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Locate className="mr-1.5 h-4 w-4" />}
            Capturar minha localização
          </Button>
          {data.localizacao.gps_original && (
            <Badge className="bg-blue-500/15 text-cyan-200">
              GPS: {data.localizacao.gps_original.lat.toFixed(6)}, {data.localizacao.gps_original.lng.toFixed(6)} · ±{data.localizacao.gps_original.accuracy_m ?? 0}m
            </Badge>
          )}
          {data.localizacao.distancia_m !== null && data.localizacao.distancia_m !== undefined && (
            <Badge className="bg-amber-500/15 text-amber-200">
              Deslocamento marcado: {data.localizacao.distancia_m} m
            </Badge>
          )}
        </div>

        {data.localizacao.gps_original ? (
          <MapPicker
            center={
              data.localizacao.confirmada ?? {
                lat: data.localizacao.gps_original.lat,
                lng: data.localizacao.gps_original.lng,
              }
            }
            userLocation={data.localizacao.gps_original}
            marker={data.localizacao.confirmada ?? {
              lat: data.localizacao.gps_original.lat,
              lng: data.localizacao.gps_original.lng,
            }}
            disabled={readOnly}
            onConfirm={confirmMarker}
          />
        ) : (
          <div className="rounded-xl border border-blue-500/30 bg-[#041126] p-4 text-sm text-slate-400">
            Toque em <b>Capturar minha localização</b> para abrir o mapa em modo satélite e posicionar o poste da CTO.
          </div>
        )}

        {data.localizacao.confirmada && (
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
            <div className="rounded-lg border border-blue-500/20 bg-[#041126] p-2">
              <div className="text-slate-400">Coordenada confirmada</div>
              <div className="font-mono text-cyan-200">
                {data.localizacao.confirmada.lat.toFixed(6)}, {data.localizacao.confirmada.lng.toFixed(6)}
              </div>
            </div>
            <a
              className="rounded-lg border border-cyan-500/40 bg-[#041126] p-2 text-cyan-300 hover:bg-blue-950"
              href={`https://maps.google.com/?q=${data.localizacao.confirmada.lat},${data.localizacao.confirmada.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir no Google Maps
            </a>
          </div>
        )}
      </Section>

      {/* 3 Foto ANTES */}
      <Section n={3} title="Foto ANTES (interior da CTO como encontrada)">
        <RemapPhotos
          checklistId={checklistId}
          tecnicoId={tecnicoId}
          slot="antes"
          readOnly={readOnly}
        />
      </Section>

      {/* 4 Splitter */}
      <Section n={4} title="Splitter instalado">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select
              value={data.splitter.tipo ?? ""}
              onValueChange={(v) => setSplitter({ tipo: v as SplitterKind })}
              disabled={readOnly}
            >
              <SelectTrigger className="bg-[#041126] text-slate-100">
                <SelectValue placeholder="Selecionar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1x4">1 x 4</SelectItem>
                <SelectItem value="1x8">1 x 8</SelectItem>
                <SelectItem value="1x16">1 x 16</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {data.splitter.tipo === "outro" && (
            <div className="space-y-1.5">
              <Label>Quantidade de portas</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={64}
                value={data.portas.length || ""}
                disabled={readOnly}
                onChange={(e) => setCountForOutro(parseInt(e.target.value || "0", 10))}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Potência de entrada (dBm)</Label>
            <Input
              inputMode="decimal"
              placeholder="Ex.: -14.80"
              value={data.splitter.potencia_entrada_dbm}
              disabled={readOnly}
              onChange={(e) => setSplitter({ potencia_entrada_dbm: e.target.value })}
            />
          </div>
        </div>
      </Section>

      {/* 5 Alimentação */}
      <Section n={5} title="Fibra que alimenta o splitter">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(["cabo", "tubo", "fibra", "cor_fibra", "origem"] as const).map((k) => (
            <div key={k} className="space-y-1.5">
              <Label>
                {k === "cabo" ? "Cabo"
                  : k === "tubo" ? "Tubo"
                  : k === "fibra" ? "Fibra"
                  : k === "cor_fibra" ? "Cor da fibra"
                  : "Origem"}
              </Label>
              <Input
                value={data.alimentacao[k]}
                disabled={readOnly}
                onChange={(e) =>
                  onDataChange((p) => ({ ...p, alimentacao: { ...p.alimentacao, [k]: e.target.value } }))
                }
              />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label>Observação</Label>
          <Textarea
            rows={2}
            value={data.alimentacao.observacao}
            disabled={readOnly}
            onChange={(e) =>
              onDataChange((p) => ({ ...p, alimentacao: { ...p.alimentacao, observacao: e.target.value } }))
            }
          />
        </div>
      </Section>

      {/* 6 Portas */}
      <Section n={6} title={`Mapeamento das portas (${data.portas.length})`}>
        {data.portas.length === 0 ? (
          <p className="text-sm text-slate-400">
            Selecione o tipo de splitter para gerar as portas.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data.portas.map((porta) => (
              <PortaCard
                key={porta.numero}
                porta={porta}
                readOnly={readOnly}
                onChange={(patch) => setPorta(porta.numero, patch)}
              />
            ))}
          </div>
        )}
      </Section>

      {/* 7 Análise */}
      <Section n={7} title="Análise automática" icon={<Activity className="h-4 w-4 text-cyan-300" />} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Ocupadas" value={String(stats.ocupadas)} />
          <Stat label="Livres" value={String(stats.livres)} />
          <Stat label="Não identificado" value={String(stats.nao_identificado)} />
          <Stat label="Entrada" value={stats.entrada_dbm !== null ? `${stats.entrada_dbm} dBm` : "—"} />
          <Stat label="Média saídas" value={stats.media_saida_dbm !== null ? `${stats.media_saida_dbm} dBm` : "—"} />
          <Stat label="Perda média" value={stats.perda_media_db !== null ? `${stats.perda_media_db} dB` : "—"} />
          <Stat label="Melhor" value={stats.melhor ? `P${String(stats.melhor.porta).padStart(2, "0")} ${stats.melhor.dbm} dBm` : "—"} />
          <Stat label="Pior" value={stats.pior ? `P${String(stats.pior.porta).padStart(2, "0")} ${stats.pior.dbm} dBm` : "—"} />
        </div>
      </Section>

      {/* 8 Fusão */}
      <Section n={8} title="Fusão" defaultOpen={false}>
        <div className="flex gap-2">
          {(["nao", "sim"] as const).map((v) => (
            <Button
              key={v}
              type="button"
              disabled={readOnly}
              variant="outline"
              className={
                data.fusao.necessaria === v
                  ? v === "sim"
                    ? "h-10 border-amber-400 bg-amber-600 text-white hover:bg-amber-500"
                    : "h-10 border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-500"
                  : "h-10 border-blue-500/40 bg-[#071b3a] text-slate-100 hover:bg-blue-900/60"
              }
              onClick={() => onDataChange((p) => ({ ...p, fusao: { ...p.fusao, necessaria: v } }))}
            >
              {v === "sim" ? "Sim, foi necessário refazer" : "Não, sem correções"}
            </Button>
          ))}
        </div>
        {data.fusao.necessaria === "sim" && (
          <div className="space-y-2">
            {data.fusao.itens.map((item, idx) => (
              <div key={idx} className="rounded-xl border border-blue-500/25 bg-[#041126] p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Fibra/fusão</Label>
                    <Input value={item.fibra} disabled={readOnly} onChange={(e) => setFusao(idx, { fibra: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Motivo</Label>
                    <Select value={item.motivo} onValueChange={(v) => setFusao(idx, { motivo: v })} disabled={readOnly}>
                      <SelectTrigger className="bg-[#041126] text-slate-100">
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {["perda elevada", "fibra rompida", "fusão inadequada", "pigtail", "alimentação do splitter", "outro"].map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Antes (dBm)</Label>
                    <Input inputMode="decimal" value={item.antes_dbm} disabled={readOnly} onChange={(e) => setFusao(idx, { antes_dbm: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Depois (dBm)</Label>
                    <Input inputMode="decimal" value={item.depois_dbm} disabled={readOnly} onChange={(e) => setFusao(idx, { depois_dbm: e.target.value })} />
                  </div>
                </div>
                {!readOnly && (
                  <div className="mt-2 flex justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeFusao(idx)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {!readOnly && (
              <Button type="button" variant="outline" size="sm" onClick={addFusao}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar fusão
              </Button>
            )}
          </div>
        )}
      </Section>

      {/* 9 Foto DEPOIS */}
      <Section n={9} title="Foto DEPOIS (após organização/remapeamento)">
        <RemapPhotos
          checklistId={checklistId}
          tecnicoId={tecnicoId}
          slot="depois"
          readOnly={readOnly}
        />
      </Section>

      {/* 10 Finalização */}
      <Section n={10} title="Finalização">
        <div className="flex flex-wrap gap-2">
          {(["sim", "parcialmente"] as const).map((v) => (
            <Button
              key={v}
              type="button"
              disabled={readOnly}
              variant="outline"
              className={
                data.resultado.estado === v
                  ? v === "sim"
                    ? "h-10 border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-500"
                    : "h-10 border-amber-400 bg-amber-600 text-white hover:bg-amber-500"
                  : "h-10 border-blue-500/40 bg-[#071b3a] text-slate-100 hover:bg-blue-900/60"
              }
              onClick={() => onDataChange((p) => ({ ...p, resultado: { ...p.resultado, estado: v } }))}
            >
              {v === "sim" ? "✓ Remapeada corretamente" : "⚠ Parcialmente"}
            </Button>
          ))}
        </div>
        {data.resultado.estado === "parcialmente" && (
          <div className="space-y-1.5">
            <Label>Pendência encontrada</Label>
            <Textarea
              rows={3}
              value={data.resultado.pendencia}
              disabled={readOnly}
              onChange={(e) => onDataChange((p) => ({ ...p, resultado: { ...p.resultado, pendencia: e.target.value } }))}
            />
          </div>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-blue-500/25 bg-[#041126] p-3">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold text-cyan-200">{value}</div>
    </div>
  );
}

function PortaCard({
  porta,
  readOnly,
  onChange,
}: {
  porta: RemapeamentoData["portas"][number];
  readOnly?: boolean;
  onChange: (patch: Partial<RemapeamentoData["portas"][number]>) => void;
}) {
  const color = fiberColorBySlug(porta.cor);
  return (
    <div className="rounded-xl border border-blue-500/25 bg-[#041126] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold text-white">
            P{String(porta.numero).padStart(2, "0")}
          </span>
          <span
            className="inline-block h-5 w-5 rounded-full border border-white/30"
            style={{ background: color.hex }}
            title={color.label}
          />
          <Select
            value={porta.cor}
            onValueChange={(v) => onChange({ cor: v })}
            disabled={readOnly}
          >
            <SelectTrigger className="h-7 w-[110px] bg-[#031027] text-xs text-slate-100">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIBER_COLORS.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-slate-500"
                      style={{ background: c.hex }}
                    />
                    {c.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-1">
          {(["ocupada", "livre", "nao_identificado"] as RemapPortStatus[]).map((s) => (
            <button
              key={s}
              type="button"
              disabled={readOnly}
              className={
                "rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition " +
                (porta.status === s
                  ? s === "ocupada"
                    ? "border-emerald-400 bg-emerald-600 text-white"
                    : s === "livre"
                      ? "border-slate-400 bg-slate-600 text-white"
                      : "border-amber-400 bg-amber-600 text-white"
                  : "border-blue-500/40 bg-[#071b3a] text-slate-300")
              }
              onClick={() => onChange({ status: s })}
            >
              {s === "ocupada" ? "Ocup." : s === "livre" ? "Livre" : "N/I"}
            </button>
          ))}
        </div>
      </div>
      {porta.status === "ocupada" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="sm:col-span-2 space-y-1">
            <Label className="text-xs">Cliente</Label>
            <Input
              className="h-8"
              value={porta.cliente ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ cliente: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ID (opcional)</Label>
            <Input
              className="h-8"
              value={porta.cliente_id ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ cliente_id: e.target.value })}
            />
          </div>
          <div className="sm:col-span-3 space-y-1">
            <Label className="text-xs">Potência saída (dBm)</Label>
            <Input
              className="h-8 font-mono"
              inputMode="decimal"
              placeholder="Ex.: -18.40"
              value={porta.potencia_dbm ?? ""}
              disabled={readOnly}
              onChange={(e) => onChange({ potencia_dbm: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function RemapPhotos({
  checklistId,
  tecnicoId,
  slot,
  readOnly,
}: {
  checklistId: string;
  tecnicoId: string;
  slot: "antes" | "depois";
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["remap-fotos", checklistId],
    queryFn: () => listFotos(checklistId),
  });
  const fotos = (query.data ?? []).filter((f) =>
    slot === "antes"
      ? (f.legenda ?? "").startsWith("antes")
      : (f.legenda ?? "").startsWith("depois"),
  );
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const up = useMutation({
    mutationFn: async (file: File) => {
      const created = await uploadFoto({ checklistId, tecnicoId, categoria: "outro", file });
      // grava legenda semântica
      const { supabase } = await import("@/integrations/supabase/client");
      await supabase.from("checklist_fotos").update({ legenda: `${slot}-cto` }).eq("id", created.id);
      return created;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["remap-fotos", checklistId] });
      qc.invalidateQueries({ queryKey: ["checklist-fotos", checklistId] });
      toast.success(slot === "antes" ? "Foto ANTES anexada." : "Foto DEPOIS anexada.");
    },
    onError: () => toast.error("Falha no upload."),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const foto = fotos.find((f) => f.id === id);
      if (!foto) return;
      await deleteFoto(foto);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remap-fotos", checklistId] }),
  });

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) up.mutate(f);
              e.currentTarget.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) up.mutate(f);
              e.currentTarget.value = "";
            }}
          />
          <Button type="button" onClick={() => cameraRef.current?.click()} disabled={up.isPending}>
            {up.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Camera className="mr-1.5 h-4 w-4" />}
            Tirar foto
          </Button>
          <Button type="button" variant="outline" onClick={() => galleryRef.current?.click()} disabled={up.isPending}>
            <Images className="mr-1.5 h-4 w-4" /> Galeria
          </Button>
        </div>
      )}
      {fotos.length === 0 ? (
        <p className="text-xs text-slate-500">Nenhuma foto anexada.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {fotos.map((f) => (
            <RemapFotoTile
              key={f.id}
              path={f.storage_path}
              onDelete={!readOnly ? () => del.mutate(f.id) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RemapFotoTile({ path, onDelete }: { path: string; onDelete?: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let cancelled = false;
    signedFotoUrl(path).then((u) => !cancelled && setUrl(u));
    return () => {
      cancelled = true;
    };
  }, [path]);
  return (
    <li className="group relative overflow-hidden rounded-md border border-blue-500/30 bg-[#041126]">
      {url ? (
        <img src={url} alt="" className="h-32 w-full object-contain" />
      ) : (
        <div className="flex h-32 w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        </div>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-1 opacity-0 shadow transition group-hover:opacity-100"
          aria-label="Remover foto"
        >
          <Trash2 className="h-3.5 w-3.5 text-red-400" />
        </button>
      )}
    </li>
  );
}
