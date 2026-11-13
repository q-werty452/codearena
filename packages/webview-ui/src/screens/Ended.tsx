import { motion } from "motion/react";
import { DoorClosed, UserX } from "lucide-react";
import { Button } from "../ui/Button.tsx";
import { useT } from "../lib/i18n.ts";

/** Экран после того, как ученика выгнали или комнату закрыли. */
export function EndedScreen({ reason, onAgain }: { reason: "kicked" | "room_closed"; onAgain: () => void }) {
  const t = useT();
  const Icon = reason === "kicked" ? UserX : DoorClosed;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto flex max-w-[320px] flex-col items-center gap-4 px-4 py-12 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-card border border-border bg-surface">
        <Icon size={26} className="text-muted" />
      </div>
      <div>
        <h1 className="text-[18px] font-semibold">{reason === "kicked" ? t("ended.kicked") : t("ended.closed")}</h1>
        <p className="mt-1 text-muted">{t("ended.hint")}</p>
      </div>
      <Button variant="primary" size="lg" block onClick={onAgain}>
        {t("ended.again")}
      </Button>
    </motion.div>
  );
}
