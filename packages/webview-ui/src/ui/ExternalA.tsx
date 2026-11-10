import type { ReactNode } from "react";
import { host } from "../lib/session.ts";

/**
 * Внешняя ссылка: открывает браузер через расширение (vscode.env.openExternal),
 * а не переходом внутри webview — иначе панель может уйти на пустую страницу.
 */
export function ExternalA({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault();
        host.post({ type: "open_url", url: href });
      }}
    >
      {children}
    </a>
  );
}
