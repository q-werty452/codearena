import { motion } from "motion/react";
import { ArrowRight, GraduationCap, User, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../ui/Button.tsx";
import { CodeCells } from "../ui/CodeCells.tsx";
import { Field } from "../ui/Input.tsx";
import { Logo } from "../ui/Controls.tsx";
import { useT } from "../lib/i18n.ts";

export interface JoinProps {
  initialCode?: string;
  initialName?: string;
  busy?: boolean;
  codeError?: string | null;
  nameError?: string | null;
  generalError?: string | null;
  onJoin: (code: string, name: string) => void;
  onTeacher: () => void;
}

/** Экран входа ученика: логотип, 6 ячеек кода, имя, одна большая кнопка. */
export function JoinScreen({ initialCode = "", initialName = "", busy, codeError, nameError, generalError, onJoin, onTeacher }: JoinProps) {
  const t = useT();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(initialName);
  const [localNameErr, setLocalNameErr] = useState<string | null>(null);
  const ready = code.length === 6 && name.trim().length >= 2;

  // Сохранённое имя приходит от расширения чуть позже первого рендера.
  useEffect(() => {
    if (initialName) setName((n) => n || initialName);
  }, [initialName]);

  const submit = () => {
    if (name.trim().length < 2) return setLocalNameErr(t("join.nameShort"));
    if (code.length === 6) onJoin(code, name.trim().replace(/\s+/g, " "));
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mx-auto flex w-full max-w-[360px] flex-col gap-6 px-4 pb-6 pt-8"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={44} withText={false} />
        <div>
          <h1 className="text-title font-bold tracking-[-0.01em]">{t("join.title")}</h1>
          <p className="mt-1 text-muted">{t("app.tagline")}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-medium text-muted">{t("join.code")}</span>
        <CodeCells
          value={code}
          onChange={setCode}
          error={!!codeError}
          autoFocus={!initialCode}
          label={t("join.code")}
          onComplete={() => document.getElementById("ca-name")?.focus()}
        />
        {codeError && <p className="text-[12px] text-error">{codeError}</p>}
      </div>

      <Field
        id="ca-name"
        big
        label={t("join.name")}
        placeholder={t("join.namePlaceholder")}
        hint={t("join.nameHint")}
        error={nameError ?? localNameErr}
        icon={<User size={16} />}
        value={name}
        autoFocus={!!initialCode && !initialName}
        maxLength={40}
        onChange={(e) => {
          setName(e.target.value);
          setLocalNameErr(null);
        }}
      />

      {generalError && (
        <div role="alert" className="flex items-start gap-2 rounded-btn border border-warning/40 bg-warning/10 px-3 py-2 text-[12px]">
          <WifiOff size={14} className="mt-0.5 shrink-0 text-warning" />
          <span>{generalError}</span>
        </div>
      )}

      <Button type="submit" variant="primary" size="lg" block disabled={!ready} loading={busy} iconRight={<ArrowRight size={18} />}>
        {t("join.submit")}
      </Button>

      <button
        type="button"
        onClick={onTeacher}
        className="mx-auto rounded-[6px] px-2 py-1 text-center text-[12px] leading-relaxed text-muted transition-colors hover:text-fg"
      >
        <GraduationCap size={14} className="mr-1.5 inline-block align-[-2px]" />
        {t("join.teacher")}
      </button>
    </motion.form>
  );
}
