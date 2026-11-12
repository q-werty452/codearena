import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, ExternalLink, ShieldAlert, Smartphone, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { host } from "../lib/session.ts";
import { useT } from "../lib/i18n.ts";
import { Button } from "./Button.tsx";
import { ExternalA } from "./ExternalA.tsx";

/** QR-код одним path: тёмные модули на белом (сканеры телефонов ждут именно так). */
function Qr({ text }: { text: string }) {
  const { d, size } = useMemo(() => {
    const qr = encode(text, { ecc: "M", border: 0 });
    let path = "";
    qr.data.forEach((row, y) => row.forEach((on, x) => on && (path += `M${x} ${y}h1v1h-1z`)));
    return { d: path, size: qr.size };
  }, [text]);
  return (
    <svg viewBox={`-2 -2 ${size + 4} ${size + 4}`} className="size-[220px] rounded-[12px] bg-white" role="img" aria-label="QR" shapeRendering="crispEdges">
      <path d={d} fill="#111" />
    </svg>
  );
}

/**
 * «Смотреть с телефона»: QR-код и ссылка на страницу урока только для просмотра.
 * Учитель вышел из класса — видит с телефона, кто готов, кто застрял, и ход игры.
 */
export function WatchDialog({ link, open, onClose }: { link: string | null; open: boolean; onClose: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!open) return;
    setCopied(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px] sm:p-6" onClick={onClose}>
          <motion.div
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mt-10 w-full max-w-[420px] rounded-card border border-border bg-[var(--vscode-editor-background,var(--ca-bg))] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={t("watch.title")}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-accent/15 text-accent">
                <Smartphone size={18} />
              </span>
              <h2 className="flex-1 text-[18px] font-bold">{t("watch.title")}</h2>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg" aria-label="close">
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-[13px] text-muted">{t("watch.hint")}</p>
            {link ? (
              <>
                <div className="mt-4 flex justify-center">
                  <Qr text={link} />
                </div>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Button
                    icon={copied ? <Check size={14} /> : <Copy size={14} />}
                    onClick={() => {
                      host.post({ type: "copy", text: link });
                      setCopied(true);
                    }}
                  >
                    {copied ? t("watch.copied") : t("watch.copy")}
                  </Button>
                  {link.startsWith("https://") && (
                    <ExternalA href={link} className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-muted hover:bg-hover hover:text-fg">
                      <ExternalLink size={14} />
                      {t("watch.open")}
                    </ExternalA>
                  )}
                </div>
                <p className="mt-4 flex items-start gap-2 rounded-[10px] bg-warning/10 px-3 py-2 text-[12px] text-warning">
                  <ShieldAlert size={14} className="mt-[1px] shrink-0" />
                  {t("watch.private")}
                </p>
              </>
            ) : (
              <p className="mt-6 text-center text-[13px] text-muted">{t("watch.preparing")}</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
