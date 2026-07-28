import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
  className?: string;
  height?: number;
}

/**
 * Assinatura em tela cheia. O bloco inline serve apenas de pré-visualização;
 * o desenho acontece em um overlay que ocupa toda a tela do aparelho.
 */
export function SignaturePad({
  value,
  onChange,
  className,
  height = 180,
}: SignaturePadProps) {
  const [open, setOpen] = useState(false);
  const hasInk = !!value;

  return (
    <div className={cn("space-y-2", className)}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex w-full items-center justify-center rounded-lg border-2 border-dashed border-primary/30 bg-white shadow-inner"
        style={{ height }}
      >
        {value ? (
          <img
            src={value}
            alt="Assinatura registrada"
            className="max-h-full max-w-full object-contain p-2"
          />
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Maximize2 className="h-4 w-4" /> Toque para assinar em tela cheia ✍️
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {hasInk ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="h-3 w-3" /> Assinatura registrada
            </span>
          ) : (
            "A assinatura abre em tela cheia para facilitar o traço."
          )}
        </p>
        <div className="flex items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <Maximize2 className="mr-1 h-4 w-4" /> {hasInk ? "Refazer" : "Assinar"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange?.(null)}
            disabled={!hasInk}
          >
            <Eraser className="mr-1 h-4 w-4" /> Limpar
          </Button>
        </div>
      </div>

      {open && (
        <FullscreenSignature
          value={value}
          onCancel={() => setOpen(false)}
          onConfirm={(data) => {
            onChange?.(data);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FullscreenSignature({
  value,
  onCancel,
  onConfirm,
}: {
  value?: string | null;
  onCancel: () => void;
  onConfirm: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(!!value);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#0f172a";
    if (value) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(rect.width / img.width, rect.height / img.height, 1);
        ctx.drawImage(img, 0, 0, img.width * scale, img.height * scale);
      };
      img.src = value;
      setHasInk(true);
    }
  }, [value]);

  useEffect(() => {
    setup();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("resize", setup);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("resize", setup);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pos(e);
  }
  function onMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current!.x, lastRef.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  }
  function onUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHasInk(true);
  }
  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Assine em tela cheia</p>
          <p className="text-xs text-muted-foreground">
            Use o dedo ou a caneta. Vire o aparelho para ter mais espaço.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onCancel} aria-label="Fechar">
          <X className="h-5 w-5" />
        </Button>
      </div>
      <div className="flex-1 p-3">
        <div className="relative h-full w-full rounded-xl border-2 border-dashed border-primary/30 bg-white">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
            className="h-full w-full touch-none rounded-xl"
          />
          {!hasInk && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Assine aqui ✍️
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <Button type="button" variant="outline" onClick={clear} disabled={!hasInk}>
          <Eraser className="mr-1 h-4 w-4" /> Limpar
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(hasInk ? canvasRef.current!.toDataURL("image/png") : null)}
            disabled={!hasInk}
          >
            <Check className="mr-1 h-4 w-4" /> Confirmar assinatura
          </Button>
        </div>
      </div>
    </div>
  );
}
