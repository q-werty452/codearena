import { motion } from "motion/react";
import { DoorClosed, PanelsTopLeft } from "lucide-react";
import type { SessionSnapshot } from "@codearena/shared";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Avatar } from "../ui/Avatar.tsx";
import { StatusDot } from "../ui/Status.tsx";
import { prettyCode, useT } from "../lib/i18n.ts";
import { host } from "../lib/session.ts";

/** Боковая панель учителя: код, сколько подключилось, кнопка открыть панель. */
export function TeacherSidebar({ session }: { session: SessionSnapshot }) {
  const t = useT();
  const players = session.lobby?.players ?? [];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("teacher.code")}</span>
        <StatusDot status={session.status} withText={false} />
      </div>
      <div className="font-mono text-[40px] font-bold leading-none tracking-[0.05em] tabular">{prettyCode(session.code ?? "")}</div>

      <Card className="flex items-center justify-between gap-2 px-3 py-2.5">
        <span className="whitespace-nowrap text-[13px] text-muted">{t("teacher.inRoom", { n: players.length })}</span>
        <div className="flex -space-x-1.5">
          {players.slice(-4).map((p) => (
            <Avatar key={p.id} name={p.name} team={p.team} size={22} offline={!p.connected} className="ring-2 ring-[var(--ca-bg)]" />
          ))}
        </div>
      </Card>

      <Button variant="primary" size="lg" block icon={<PanelsTopLeft size={18} />} onClick={() => host.post({ type: "open_panel" })}>
        {t("teacher.openPanel")}
      </Button>
      <Button variant="ghost" size="sm" icon={<DoorClosed size={14} />} onClick={() => host.post({ type: "leave" })} className="self-center">
        {t("teacher.closeRoom")}
      </Button>
    </motion.div>
  );
}
