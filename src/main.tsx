import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";

// Reload once automatically if a lazy-loaded chunk fails after a new production deploy
window.addEventListener("vite:preloadError", () => {
  const key = "ck_preload_reload_ts";
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last > 15_000) {
    sessionStorage.setItem(key, String(Date.now()));
    window.location.reload();
  }
});

// In production builds, detect when a newer deployment bundle is live on tab focus
if (import.meta.env.PROD) {
  const getRunningEntrySrc = () => {
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]'));
    return scripts.find((s) => s.src.includes("/assets/"))?.getAttribute("src") ?? null;
  };

  const initialEntrySrc = getRunningEntrySrc();
  let checking = false;

  const checkForNewDeployment = async () => {
    if (!initialEntrySrc || checking || document.visibilityState === "hidden") return;
    checking = true;
    try {
      const res = await fetch(`/?_ckv=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const html = await res.text();
      const match = html.match(/src="(\/assets\/[^"]+\.js)"/);
      const latestSrc = match?.[1] ?? null;
      if (latestSrc && latestSrc !== initialEntrySrc) {
        const reloadedFor = sessionStorage.getItem("ck_reloaded_bundle");
        if (reloadedFor !== latestSrc) {
          sessionStorage.setItem("ck_reloaded_bundle", latestSrc);
          window.location.reload();
        }
      }
    } catch {
      // Ignore offline/network errors
    } finally {
      checking = false;
    }
  };

  window.addEventListener("focus", () => void checkForNewDeployment());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkForNewDeployment();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
