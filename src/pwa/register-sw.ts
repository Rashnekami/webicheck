// Guarded service-worker registration wrapper.
// Follows the Lovable PWA skill: never registers in dev, preview, iframe,
// or with ?sw=off — and unregisters any existing app SW in those contexts.

const APP_SW_URL = "/sw.js";

function isRefusedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!("serviceWorker" in navigator)) return true;
  if (!import.meta.env.PROD) return true;

  // iframe (Lovable preview embeds the app in an iframe)
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get("sw") === "off") return true;

  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;

  return false;
}

async function unregisterAppSW(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(
      regs
        .filter((r) => {
          const script = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL;
          return !!script && script.endsWith(APP_SW_URL);
        })
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function registerAppServiceWorker(): void {
  if (isRefusedContext()) {
    void unregisterAppSW();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(APP_SW_URL, { scope: "/" })
      .then((registration) => {
        // Notify on new version available
        registration.addEventListener("updatefound", () => {
          const nw = registration.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent("webifibra:sw-updated"));
            }
          });
        });
      })
      .catch(() => {
        /* silent */
      });
  });
}
