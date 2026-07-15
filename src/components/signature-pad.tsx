import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
  className?: string;
  height?: number;
}

/**
 * Assinatura desenhada em canvas. Emite dataURL PNG (fundo transparente)
 * via onChange sempre que o usuário conclui um traço.
 */
export function SignaturePad({
  value,
  onChange,
  className,
  height = 180,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(!!value);

  const resize = useCallback(() => {
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
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#0f172a";
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = value;
      setHasInk(true);
    }
  }, [value]);

  useEffect(() => {
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: PointerEvent | React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
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
    onChange?.(canvasRef.current!.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange?.(null);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="relative rounded-lg border-2 border-dashed border-primary/30 bg-white shadow-inner"
        style={{ height }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          className="h-full w-full touch-none rounded-lg"
        />
        {!hasInk && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Assine aqui com o dedo ou caneta ✍️
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {hasInk ? (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="h-3 w-3" /> Assinatura registrada
            </span>
          ) : (
            "Sua assinatura será usada em todos os checklists gerados."
          )}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={!hasInk}
        >
          <Eraser className="mr-1 h-4 w-4" /> Limpar
        </Button>
      </div>
    </div>
  );
}
