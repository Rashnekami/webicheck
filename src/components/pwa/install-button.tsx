import { useEffect, useState } from "react";
import { Download, Share, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iPad = /iPad|Macintosh/.test(ua) && "ontouchend" in document;
  return /iPhone|iPod/.test(ua) || iPad;
}

interface InstallButtonProps {
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
  label?: string;
  fullWidth?: boolean;
}

export function InstallButton({
  variant = "secondary",
  size = "sm",
  className,
  label = "Instalar app",
  fullWidth,
}: InstallButtonProps) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(false);
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDevice, setIosDevice] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setIosDevice(isIOS());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleClick() {
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }
    setIosOpen(true);
  }


  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={handleClick}
        className={className}
        style={fullWidth ? { width: "100%" } : undefined}
      >
        <Download className="mr-1.5 h-4 w-4" />
        {label}
      </Button>

      <Dialog open={iosOpen} onOpenChange={setIosOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar Webifibra no iPhone</DialogTitle>
            <DialogDescription>
              O Safari não instala apps automaticamente. Siga os passos abaixo:
            </DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                1
              </span>
              <p>
                Toque no botão <strong>Compartilhar</strong>{" "}
                <Share className="inline h-4 w-4 align-text-bottom" /> na barra inferior do Safari.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                2
              </span>
              <p>
                Role até <strong>Adicionar à Tela de Início</strong>{" "}
                <Plus className="inline h-4 w-4 align-text-bottom" /> e toque.
              </p>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
                3
              </span>
              <p>
                Confirme em <strong>Adicionar</strong>. O ícone da Webifibra aparecerá na sua tela
                inicial.
              </p>
            </li>
          </ol>
          <DialogFooter>
            <Button onClick={() => setIosOpen(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
