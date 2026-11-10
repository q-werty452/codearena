import { motion, AnimatePresence } from "motion/react";
import { useEffect } from "react";
import type { ConnStatus } from "@codearena/shared";
import { cn } from "../lib/cn.ts";
import { useT } from "../lib/i18n.ts";

/** Точка статуса соединения: зелёная — в сети, оранжевая пульсирует — переподключение. */
export function StatusDot({ status, withText = true }: { status: ConnStatus; withText?: boolean }) {
  const t = useT();
  const online = status === "online";
  const label = online ? t("net.online") : status === "reconnecting" ? t("net.lost") : t("net.connecting");
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" title={label}>
      <span className="relative flex size-2">
        {!online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", online ? "bg-success" : "bg-warning")} />
      </span>
      {withText && <span className="truncate">{online ? t("net.online") : t("net.connecting")}</span>}
    </span>
  );
}

/** Всплывающее уведомление снизу, исчезает само. */
export function Toast({ toast, onDone }: { toast: { id: number; text: string } | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(onDone, 2600);
    return () => clearTimeout(id);
  }, [toast, onDone]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="max-w-[360px] rounded-btn border border-border bg-surface-2 px-3.5 py-2 text-[13px] shadow-lg"
            role="status"
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
