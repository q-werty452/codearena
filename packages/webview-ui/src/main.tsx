/**
 * Точка входа webview внутри VS Code.
 * Расширение передаёт настройки через window.__CODEARENA__ (вид, язык).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { LocaleContext, pickLocale } from "./lib/i18n.ts";
import { App } from "./App.tsx";
import { setSoundDefault } from "./lib/game.ts";

declare global {
  interface Window {
    __CODEARENA__?: { view: "sidebar" | "panel"; language?: string };
  }
}

const boot = window.__CODEARENA__ ?? { view: "sidebar" as const };
// У учеников звук по умолчанию выключен (класс шумный); панель учителя включает его сама.
setSoundDefault(false);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleContext.Provider value={pickLocale(boot.language)}>
      <App view={boot.view} />
    </LocaleContext.Provider>
  </StrictMode>,
);
