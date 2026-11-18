import { useEffect, useState } from "react";

export type VsTheme = "dark" | "light";

/** Тема VS Code: на <body> вебвью висит vscode-light / vscode-dark / vscode-high-contrast(-light). */
function read(): VsTheme {
  const c = document.body.classList;
  if (c.contains("vscode-light") || c.contains("vscode-high-contrast-light")) return "light";
  if (c.contains("vscode-dark") || c.contains("vscode-high-contrast")) return "dark";
  // Вне VS Code (витрина) — по системе.
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Светлая или тёмная тема — живьём, вместе с переключением темы в VS Code. */
export function useVsTheme(): VsTheme {
  const [theme, setTheme] = useState<VsTheme>(read);
  useEffect(() => {
    const update = () => setTheme(read());
    const mo = new MutationObserver(update);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    mq?.addEventListener("change", update);
    return () => {
      mo.disconnect();
      mq?.removeEventListener("change", update);
    };
  }, []);
  return theme;
}
