import { useState, useRef, type WheelEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { Download, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

// Visualizador de foto em tamanho original, com zoom (roda do mouse/pinça
// no touch) e botão de download — usado tanto na tela do checklist quanto
// no link público, que antes só abriam a foto em miniatura sem forma de
// ampliar ou salvar o original.
type LightboxState = { src: string; alt: string; filename?: string } | null;

export function useImageLightbox() {
  const [state, setState] = useState<LightboxState>(null);
  const open = (src: string, alt: string, filename?: string) => setState({ src, alt, filename });
  const close = () => setState(null);
  return { state, open, close };
}

export function ImageLightbox({ state, onClose }: { state: LightboxState; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null,
  );

  if (!state || typeof document === "undefined") return null;

  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setScale((s) => Math.min(6, Math.max(1, s - e.deltaY * 0.0015)));
  };

  const handleMouseDown = (e: ReactMouseEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const handleMouseMove = (e: ReactMouseEvent<HTMLImageElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  };
  const handleMouseUp = () => {
    dragRef.current = null;
  };

  const node = (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          reset();
          onClose();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2 p-3 text-white">
        <span className="truncate text-sm text-slate-300">{state.alt}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="rounded-md border border-white/20 bg-white/10 p-2 hover:bg-white/20"
            onClick={() => setScale((s) => Math.max(1, s - 0.5))}
            aria-label="Diminuir zoom"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md border border-white/20 bg-white/10 p-2 hover:bg-white/20"
            onClick={() => setScale((s) => Math.min(6, s + 0.5))}
            aria-label="Aumentar zoom"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md border border-white/20 bg-white/10 p-2 hover:bg-white/20"
            onClick={reset}
            aria-label="Redefinir zoom"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <a
            href={state.src}
            download={state.filename ?? true}
            className="rounded-md border border-white/20 bg-white/10 p-2 hover:bg-white/20"
            aria-label="Baixar imagem original"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            className="rounded-md border border-white/20 bg-white/10 p-2 hover:bg-white/20"
            onClick={() => {
              reset();
              onClose();
            }}
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        className="flex flex-1 items-center justify-center overflow-hidden"
        onWheel={handleWheel}
      >
        <img
          src={state.src}
          alt={state.alt}
          draggable={false}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={() => (scale > 1 ? reset() : setScale(2.5))}
          style={{
            maxWidth: "94vw",
            maxHeight: "82vh",
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            cursor: scale > 1 ? "grab" : "zoom-in",
            transition: dragRef.current ? "none" : "transform 0.08s ease-out",
            touchAction: "none",
          }}
        />
      </div>
      <p className="p-2 text-center text-[10px] uppercase tracking-wider text-slate-500">
        Roda do mouse ou botões pra zoom · arraste pra mover · duplo clique alterna zoom
      </p>
    </div>
  );

  return createPortal(node, document.body);
}
