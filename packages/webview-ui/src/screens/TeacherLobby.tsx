import { AnimatePresence, motion } from "motion/react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Check, ChevronDown, Copy, DoorClosed, Flag, Radio, Gamepad2, Link2, MessageCircleQuestion, MoreHorizontal, Pencil, Shuffle, UserX, Users, WifiOff } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isDone, shuffleIntoTeams, type LessonSnapshot, type LessonStatus, type PlayerInfo, type SessionSnapshot, type TeamIndex, type TeamMode } from "@codearena/shared";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { Avatar, teamColor } from "../ui/Avatar.tsx";
import { Logo, Segmented } from "../ui/Controls.tsx";
import { TeamIcon } from "../ui/Shapes.tsx";
import { StatusDot } from "../ui/Status.tsx";
import { cn } from "../lib/cn.ts";
import { prettyCode, useT } from "../lib/i18n.ts";
import { host } from "../lib/session.ts";

type Assignment = Record<string, TeamIndex | null>;
const NONE = "none";

const teamCount = (m: TeamMode) => (m === "teams2" ? 2 : m === "teams3" ? 3 : 0);

/**
 * Урок у учителя — стартовый экран комнаты: кто готов, кто застрял,
 * анонимное «объясните ещё раз», код комнаты, команды для игр и «Начать игру».
 */
export function TeacherLobby({ session, onChooseGame }: { session: SessionSnapshot; onChooseGame: () => void }) {
  const t = useT();
  const lobby = session.lobby;
  const code = session.code ?? "";
  const players = lobby?.players ?? [];
  const mode = lobby?.mode ?? "solo";
  const teams = lobby?.teams ?? [];

  // Оптимистичные перемещения: показываем сразу, сервер подтвердит лобби.
  const [overrides, setOverrides] = useState<Assignment>({});
  useEffect(() => { setOverrides({}); }, [lobby]);
  const teamOf = (p: PlayerInfo) => (p.id in overrides ? overrides[p.id]! : p.team);

  const assignment = (): Assignment => Object.fromEntries(players.map((p) => [p.id, teamOf(p)]));
  const sendTeams = (nextMode: TeamMode, a: Assignment) => host.send({ type: "set_teams", mode: nextMode, assignment: a });

  const move = (playerId: string, team: TeamIndex | null) => {
    setOverrides((o) => ({ ...o, [playerId]: team }));
    sendTeams(mode, { ...assignment(), [playerId]: team });
  };

  const shuffle = () => {
    const n = teamCount(mode);
    if (!n) return;
    const groups = shuffleIntoTeams(players.map((p) => p.id), n);
    const a: Assignment = {};
    groups.forEach((ids, team) => ids.forEach((id) => (a[id] = team as TeamIndex)));
    setOverrides(a);
    sendTeams(mode, a);
  };

  const lesson = session.lesson;
  const [teamsOpen, setTeamsOpen] = useState(mode !== "solo");

  return (
    <div className="mx-auto flex min-h-full max-w-[1100px] flex-col gap-5 px-6 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="rounded-full bg-success/15 px-2.5 py-1 text-[12px] font-semibold text-success">
            {t("lesson.title")}
            {lesson.checkpoint > 0 && <> · {t("live2.checkpointN", { n: lesson.checkpoint })}</>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot status={session.status} />
          <Button size="sm" variant="ghost" icon={<DoorClosed size={14} />} onClick={() => host.post({ type: "leave" })}>
            {t("teacher.closeRoom")}
          </Button>
        </div>
      </header>

      <LessonHero code={code} link={session.webLink ?? session.link ?? ""} players={players} lesson={lesson} />

      {players.length === 0 ? <EmptyState link={session.webLink ?? session.link ?? ""} /> : <LessonStudents players={players} lesson={lesson} />}

      {players.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            onClick={() => setTeamsOpen((v) => !v)}
            className="flex items-center gap-2 self-start rounded-[8px] px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted hover:text-fg"
            aria-expanded={teamsOpen}
          >
            <ChevronDown size={14} className={cn("transition-transform", !teamsOpen && "-rotate-90")} />
            {t("lesson.teams")} · {t(`teacher.mode.${mode}`)}
          </button>
          <AnimatePresence initial={false}>
            {teamsOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="flex flex-col gap-3 overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Segmented<TeamMode>
                    value={mode}
                    onChange={(m) => sendTeams(m, assignment())}
                    options={[
                      { value: "solo", label: <><Users size={13} />{t("teacher.mode.solo")}</> },
                      { value: "teams2", label: t("teacher.mode.teams2") },
                      { value: "teams3", label: t("teacher.mode.teams3") },
                    ]}
                  />
                  {mode !== "solo" && (
                    <Button icon={<Shuffle size={14} />} onClick={shuffle}>
                      {t("teacher.shuffle")}
                    </Button>
                  )}
                </div>
                {mode === "solo" ? (
                  <Card className="p-3">
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                      <AnimatePresence>
                        {players.map((p) => (
                          <PlayerChip key={p.id} player={p} team={null} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </Card>
                ) : (
                  <TeamBoard players={players} teams={teams} teamOf={teamOf} onMove={move} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      <footer className="sticky bottom-0 z-20 -mx-6 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="flex items-center justify-end gap-3 px-6 py-3">
          <Button variant="primary" size="lg" icon={<Gamepad2 size={18} />} onClick={onChooseGame}>
            {t("lesson.startGame")}
          </Button>
        </div>
      </footer>
    </div>
  );
}

/* ───────────────────────── Урок: счётчики и ученики ───────────────────────── */

const STATUS_COLOR: Record<LessonStatus, string> = { done: "var(--ca-success)", writing: "var(--ca-accent)", lost: "var(--ca-warning)" };
const STATUS_ORDER: Record<LessonStatus, number> = { lost: 0, writing: 1, done: 2 };

function LessonHero({ code, link, players, lesson }: { code: string; link: string; players: PlayerInfo[]; lesson: LessonSnapshot }) {
  const t = useT();
  const total = players.length;
  const done = players.filter((p) => isDone(lesson, p.id)).length;
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
      <Card className="relative overflow-hidden p-5">
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full opacity-[0.12] blur-3xl" style={{ background: "var(--ca-success)" }} />
        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            {t("lesson.title")}
          </div>
          <motion.div key={done} initial={{ scale: 1.08 }} animate={{ scale: 1 }} className="mt-2 text-[34px] font-bold leading-none tabular">
            {t("lesson.doneOf", { n: done, total })}
          </motion.div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full rounded-full bg-success" animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 160, damping: 24 }} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className={cn("inline-flex items-center gap-2 rounded-btn px-3 py-1.5", lesson.confused ? "bg-warning/15 text-warning" : "bg-surface-2 text-muted")}>
              <MessageCircleQuestion size={16} />
              <span className="text-[14px] font-semibold tabular">{t("lesson.confusedCount", { n: lesson.confused })}</span>
              <span className="text-[11px] opacity-80">{t("lesson.confusedAnon")}</span>
            </div>
            <Button size="sm" icon={<Flag size={14} />} title={t("live2.checkpointHint")} onClick={() => host.post({ type: "checkpoint" })}>
              {t("live2.checkpoint")}
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {lesson.share ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success">
                  <Radio size={14} className="animate-pulse" /> {t("live2.sharing", { f: lesson.share.fileName })}
                </span>
                <Button size="sm" variant="ghost" onClick={() => host.post({ type: "share_stop" })}>
                  {t("live2.stop")}
                </Button>
              </>
            ) : (
              <Button size="sm" icon={<Radio size={14} />} title={t("live2.shareHint")} onClick={() => host.post({ type: "share_file" })}>
                {t("live2.share")}
              </Button>
            )}
            <span className="text-[11px] text-muted">{lesson.share ? t("live2.checkpointHint") : t("live2.shareHint")}</span>
          </div>
        </div>
      </Card>
      <Card className="p-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("teacher.code")}</div>
        <div className="mt-2 font-mono text-[44px] font-bold leading-none tracking-[0.06em] tabular">{prettyCode(code)}</div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <CopyButton text={link} label={t("teacher.copyLink")} icon={<Link2 size={14} />} primary />
          <CopyButton text={code} label={t("teacher.copyCode")} icon={<Copy size={14} />} />
        </div>
        <p className="mt-2 truncate text-[12px] text-muted" title={link}>
          {t("teacher.linkHint")}
        </p>
      </Card>
    </div>
  );
}

/** Ученики урока: сначала «не понял», потом «пишет», потом «готово». */
function LessonStudents({ players, lesson }: { players: PlayerInfo[]; lesson: LessonSnapshot }) {
  const t = useT();
  const status = (p: PlayerInfo): LessonStatus => (isDone(lesson, p.id) ? "done" : (lesson.statuses[p.id] ?? "writing"));
  const pct = (p: PlayerInfo) => lesson.progress[p.id] ?? -1;
  // Отстающие сверху: «не понял», потом по прогрессу по возрастанию; готовые внизу.
  const sorted = [...players].sort((a, b) => STATUS_ORDER[status(a)] - STATUS_ORDER[status(b)] || pct(a) - pct(b) || a.name.localeCompare(b.name));
  const anyProgress = Object.keys(lesson.progress).length > 0;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          {t("lesson.students")} · {players.length}
        </span>
        <span className="text-[11px] text-muted">{t("live2.peekHint")}</span>
      </div>
      <motion.div layout className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
        <AnimatePresence>
          {sorted.map((p) => {
            const st = status(p);
            return (
              <motion.button
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                onClick={() => p.connected && host.post({ type: "peek", playerId: p.id })}
                disabled={!p.connected}
                className="relative flex h-12 items-center gap-2.5 overflow-hidden rounded-[10px] border border-border bg-surface px-2.5 text-left transition-colors enabled:hover:bg-surface-2"
                style={{ borderLeft: `3px solid ${STATUS_COLOR[st]}` }}
              >
                {anyProgress && (
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-surface-2">
                    <motion.span className="block h-full" style={{ background: STATUS_COLOR[st] }} animate={{ width: `${Math.max(0, pct(p))}%` }} />
                  </span>
                )}
                <Avatar name={p.name} team={p.team} size={26} offline={!p.connected} />
                <span className={cn("min-w-0 flex-1 truncate text-[13px] font-medium", !p.connected && "text-muted")}>{p.name}</span>
                {pct(p) >= 0 && <span className="shrink-0 text-[12px] font-bold tabular text-muted">{pct(p)}%</span>}
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ color: STATUS_COLOR[st], background: `color-mix(in srgb, ${STATUS_COLOR[st]} 14%, transparent)` }}>
                  {t(`lesson.status.${st}`)}
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}

function CopyButton({ text, label, icon, primary }: { text: string; label: string; icon: ReactNode; primary?: boolean }) {
  const t = useT();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const id = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(id);
  }, [done]);
  return (
    <Button
      variant={primary ? "primary" : "secondary"}
      icon={done ? <Check size={14} /> : icon}
      onClick={() => {
        host.post({ type: "copy", text });
        setDone(true);
      }}
    >
      {done ? t("teacher.copied") : label}
    </Button>
  );
}

function EmptyState({ link }: { link: string }) {
  const t = useT();
  return (
    <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-surface-2">
        <Users size={22} className="text-muted" />
      </div>
      <div>
        <div className="text-[16px] font-semibold">{t("teacher.empty")}</div>
        <p className="mt-1 text-muted">{t("teacher.emptyHint")}</p>
      </div>
      <CopyButton text={link} label={t("teacher.copyLink")} icon={<Link2 size={14} />} primary />
    </Card>
  );
}

/* ───────────────────────── Команды ───────────────────────── */

function TeamBoard({
  players,
  teams,
  teamOf,
  onMove,
}: {
  players: PlayerInfo[];
  teams: { index: TeamIndex; name: string }[];
  teamOf: (p: PlayerInfo) => TeamIndex | null;
  onMove: (id: string, team: TeamIndex | null) => void;
}) {
  const t = useT();
  const [dragId, setDragId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor));
  const dragged = players.find((p) => p.id === dragId);
  const unassigned = players.filter((p) => teamOf(p) === null);

  const onDragEnd = (e: DragEndEvent) => {
    setDragId(null);
    const over = e.over?.id;
    if (!over) return;
    const target = over === NONE ? null : (Number(String(over).slice(5)) as TeamIndex);
    const p = players.find((x) => x.id === e.active.id);
    if (p && teamOf(p) !== target) onMove(p.id, target);
  };

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setDragId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setDragId(null)}>
      {/* Колонки переносятся по ширине панели, а не окна. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <Column id={NONE} title={t("teacher.noTeam")} hint={unassigned.length ? t("teacher.noTeamHint") : undefined} count={unassigned.length} muted>
          {unassigned.map((p) => (
            <DraggableChip key={p.id} player={p} team={null} quickAssign={teams.map((x) => x.index)} onAssign={(team) => onMove(p.id, team)} />
          ))}
        </Column>
        {teams.map((team) => {
          const members = players.filter((p) => teamOf(p) === team.index);
          return (
            <Column key={team.index} id={`team-${team.index}`} team={team.index} title={team.name} count={members.length}>
              {members.map((p) => (
                <DraggableChip key={p.id} player={p} team={team.index} />
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22,1,0.36,1)" }}>
        {dragged ? <ChipBody player={dragged} team={teamOf(dragged)} lifted /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  id,
  team,
  title,
  hint,
  count,
  muted,
  children,
}: {
  id: string;
  team?: TeamIndex;
  title: string;
  hint?: string;
  count: number;
  muted?: boolean;
  children: ReactNode;
}) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({ id });
  const color = team !== undefined ? teamColor(team) : "var(--ca-border)";
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative flex min-h-[220px] flex-col overflow-hidden rounded-card border transition-colors duration-150",
        muted ? "border-dashed border-border bg-transparent" : "border-border bg-surface",
      )}
      style={isOver ? { borderColor: color, background: `color-mix(in srgb, ${color} 8%, var(--ca-surface))` } : undefined}
    >
      {team !== undefined && <div className="h-1 w-full" style={{ background: color }} />}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        {team !== undefined && (
          <span className="flex size-6 items-center justify-center rounded-full text-white" style={{ background: color }}>
            <TeamIcon team={team} size={13} />
          </span>
        )}
        {team !== undefined ? <TeamName team={team} name={title} /> : <span className="text-[13px] font-semibold text-muted">{title}</span>}
        <span className="ml-auto rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular text-muted">{count}</span>
      </div>
      {hint && <p className="px-3 pb-2 text-[12px] text-muted">{hint}</p>}
      <div className="flex flex-1 flex-col gap-1.5 px-2 pb-2">
        <AnimatePresence>{children}</AnimatePresence>
        {count === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-[10px] border border-dashed border-border py-6 text-[12px] text-muted">
            {t("teacher.dropHere")}
          </div>
        )}
      </div>
    </div>
  );
}

/** Название команды: клик — редактирование, Enter — сохранить. */
function TeamName({ team, name }: { team: TeamIndex; name: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  useEffect(() => { setValue(name); }, [name]);
  const commit = () => {
    setEditing(false);
    const v = value.trim();
    if (v && v !== name) host.send({ type: "rename_team", team, name: v.slice(0, 24) });
    else setValue(name);
  };
  return editing ? (
    <input
      autoFocus
      value={value}
      maxLength={24}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setValue(name);
          setEditing(false);
        }
      }}
      className="min-w-0 flex-1 rounded-[6px] border border-[var(--ca-focus)] bg-input px-1.5 py-0.5 text-[14px] font-semibold outline-none"
    />
  ) : (
    <button onClick={() => setEditing(true)} className="group inline-flex min-w-0 items-center gap-1.5 rounded-[6px] px-1 py-0.5 text-[14px] font-semibold hover:bg-hover">
      <span className="truncate">{name}</span>
      <Pencil size={11} className="shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

/* ───────────────────────── Игрок ───────────────────────── */

function DraggableChip(props: { player: PlayerInfo; team: TeamIndex | null; quickAssign?: TeamIndex[]; onAssign?: (t: TeamIndex) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.player.id });
  return (
    <motion.div
      ref={setNodeRef}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.3 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.18 }}
      className="touch-none"
      {...attributes}
      {...listeners}
    >
      <ChipBody {...props} />
    </motion.div>
  );
}

function PlayerChip(props: { player: PlayerInfo; team: TeamIndex | null }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.18 }}>
      <ChipBody {...props} />
    </motion.div>
  );
}

function ChipBody({
  player,
  team,
  lifted,
  quickAssign,
  onAssign,
}: {
  player: PlayerInfo;
  team: TeamIndex | null;
  lifted?: boolean;
  quickAssign?: TeamIndex[];
  onAssign?: (t: TeamIndex) => void;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "group flex h-10 cursor-grab items-center gap-2 rounded-[10px] border border-border bg-bg px-2 active:cursor-grabbing",
        lifted && "rotate-[-2deg] shadow-xl ring-2 ring-accent/50",
      )}
    >
      <Avatar name={player.name} team={team} size={26} offline={!player.connected} />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13px] font-medium", !player.connected && "text-muted")}>{player.name}</div>
      </div>
      {!player.connected && (
        <span title={t("teacher.offline")} className="shrink-0 text-muted">
          <WifiOff size={13} />
        </span>
      )}
      {quickAssign && onAssign && (
        <div className="flex shrink-0 gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {quickAssign.map((ti) => (
            <button
              key={ti}
              title={String(ti + 1)}
              onClick={() => onAssign(ti)}
              className="flex size-5 items-center justify-center rounded-full text-white opacity-80 transition hover:scale-110 hover:opacity-100"
              style={{ background: teamColor(ti) }}
            >
              <TeamIcon team={ti} size={10} />
            </button>
          ))}
        </div>
      )}
      {!lifted && <PlayerMenu player={player} />}
    </div>
  );
}

/** Меню игрока: переименовать, выгнать (с подтверждением). */
function PlayerMenu({ player }: { player: PlayerInfo }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmKick, setConfirmKick] = useState(false);
  const [name, setName] = useState(player.name);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) reset();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && reset();
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const reset = () => {
    setOpen(false);
    setRenaming(false);
    setConfirmKick(false);
    setName(player.name);
  };

  const saveName = () => {
    const v = name.trim().replace(/\s+/g, " ");
    if (v.length >= 2 && v !== player.name) host.send({ type: "rename_player", playerId: player.id, name: v });
    reset();
  };

  return (
    <div ref={ref} className="relative shrink-0" onPointerDown={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="menu"
        className={cn(
          "flex size-6 items-center justify-center rounded-[6px] text-muted transition hover:bg-hover hover:text-fg",
          open ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
        )}
      >
        <MoreHorizontal size={15} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-7 z-30 w-56 rounded-btn border border-border bg-[var(--vscode-menu-background,var(--ca-bg))] p-1 shadow-xl"
          >
            {renaming ? (
              <form
                className="flex flex-col gap-1.5 p-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveName();
                }}
              >
                <input
                  autoFocus
                  value={name}
                  maxLength={40}
                  onChange={(e) => setName(e.target.value)}
                  className="h-8 rounded-[7px] border border-[var(--ca-focus)] bg-input px-2 text-[13px] outline-none"
                />
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" type="button" onClick={reset}>
                    {t("common.cancel")}
                  </Button>
                  <Button size="sm" variant="primary" type="submit">
                    {t("teacher.save")}
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <MenuItem icon={<Pencil size={14} />} onClick={() => setRenaming(true)}>
                  {t("teacher.rename")}
                </MenuItem>
                <MenuItem
                  icon={<UserX size={14} />}
                  danger
                  onClick={() => {
                    if (!confirmKick) return setConfirmKick(true);
                    host.send({ type: "kick_player", playerId: player.id });
                    reset();
                  }}
                >
                  {confirmKick ? t("teacher.kickConfirm") : t("teacher.kick")}
                </MenuItem>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon, children, danger, onClick }: { icon: ReactNode; children: ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-[7px] px-2 text-left text-[13px] transition-colors",
        danger ? "text-error hover:bg-error/10" : "hover:bg-hover",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

