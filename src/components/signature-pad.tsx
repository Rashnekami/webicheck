import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Eraser, Check, Maximize2 } from "lucide-react";
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
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(!!value);
  const [isPortrait, setIsPortrait] = useState(false);

  const paintImage = useCallback((src: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(rect.width / img.width, rect.height / img.height, 1);
      const width = img.width * scale;
      const height = img.height * scale;
      ctx.drawImage(img, 0, 0, width, height);
      setHasInk(true);
    };
    img.src = src;
  }, []);

  const setup = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const currentImage = hasInk ? canvas.toDataURL("image/png") : value || null;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgb(15 23 42)";
    if (currentImage) {
      paintImage(currentImage);
    }
  }, [hasInk, paintImage, value]);

  const updateOrientation = useCallback(() => {
    setIsPortrait(window.innerHeight > window.innerWidth);
  }, []);

  useEffect(() => {
    updateOrientation();
    window.requestAnimationFrame(setup);
    const prev = document.body.style.overflow;
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    window.addEventListener("resize", setup);
    window.addEventListener("resize", updateOrientation);
    window.addEventListener("orientationchange", updateOrientation);
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll;
      window.removeEventListener("resize", setup);
      window.removeEventListener("resize", updateOrientation);
      window.removeEventListener("orientationchange", updateOrientation);
    };
  }, [setup, updateOrientation]);

  useEffect(() => {
    const shell = shellRef.current;
    const requestFullscreen = shell?.requestFullscreen;
    if (requestFullscreen) {
      requestFullscreen.call(shell).catch(() => undefined);
    }

    const orientation = window.screen?.orientation;
    orientation?.lock?.("landscape").catch(() => undefined);

    return () => {
      orientation?.unlock?.();
      if (document.fullscreenElement === shell) {
        document.exitFullscreen?.().catch(() => undefined);
      }
    };
  }, []);

  function pos(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function onDown(e: React.PointerEvent) {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    const point = pos(e);
    if (!point) return;
    drawingRef.current = true;
    lastRef.current = point;
  }
  function onMove(e: React.PointerEvent) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const previous = lastRef.current;
    if (!canvas || !previous) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    if (!p) return;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastRef.current = p;
  }
  function onUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setHasInk(true);
  }
  function done() {
    const canvas = canvasRef.current;
    onConfirm(hasInk && canvas ? canvas.toDataURL("image/png") : value || null);
  }

  const overlay = (
    <div ref={shellRef} className="fixed inset-0 z-[2147483647] overflow-hidden bg-white">
      <div
        className={cn(
          "grid bg-white text-slate-950",
          isPortrait
            ? "absolute left-1/2 top-1/2 h-[100dvw] w-[100dvh] -translate-x-1/2 -translate-y-1/2 rotate-90 grid-rows-[1fr_auto]"
            : "h-[100dvh] w-[100dvw] grid-rows-[1fr_auto]",
        )}
      >
        <div className="relative min-h-0 bg-white">
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={onUp}
            className="h-full w-full touch-none bg-white"
          />
        </div>
        <div className="flex justify-end border-t bg-background px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <Button type="button" onClick={done} className="h-12 min-w-40 text-base font-semibold">
            <Check className="mr-2 h-5 w-5" /> Concluído
          </Button>
        </div>
      </div>
    </div>
  );

  return typeof document === "undefined" ? null : createPortal(overlay, document.body);
}
