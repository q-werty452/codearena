/**
 * Витрина дизайн-системы для разработки в браузере (npm run dev:ui).
 * Имитирует тему VS Code, показывает компоненты и экраны в ширине боковой панели.
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Moon, Play, Send, Sun, Copy, Shuffle } from "lucide-react";
import "./styles.css";
import "./dev-theme.css";
import { LocaleContext, type Locale } from "./lib/i18n.ts";
import { Button } from "./ui/Button.tsx";
import { Card, Kbd, SectionTitle, Skeleton } from "./ui/Card.tsx";
import { Field } from "./ui/Input.tsx";
import { CodeCells } from "./ui/CodeCells.tsx";
import { Avatar, TeamBadge } from "./ui/Avatar.tsx";
import { ConnectionBanner, Logo, Segmented, TimerRing, Toggle } from "./ui/Controls.tsx";
import { OptionTile } from "./ui/OptionTile.tsx";
import { JoinScreen } from "./screens/Join.tsx";
import { App } from "./App.tsx";
import { installDevHost, scenario, type DevScenario } from "./devHost.ts";
import { sampleQuiz } from "./lib/game.ts";

function Gallery() {
  const [dark, setDark] = useState(() => new URLSearchParams(location.search).get("theme") !== "light");
  const [locale, setLocale] = useState<Locale>("ru");
  const [mode, setMode] = useState<"solo" | "teams2" | "teams3">("teams2");
  const [sound, setSound] = useState(false);
  const [code, setCode] = useState("4829");
  const [left, setLeft] = useState(20);
  const [picked, setPicked] = useState<number | null>(null);
  const [lost, setLost] = useState(false);
  const [tab, setTab] = useState<"ds" | DevScenario>(() => (new URLSearchParams(location.search).get("tab") as "ds" | DevScenario) ?? "ds");
  const [mount, setMount] = useState(0);
  useEffect(() => {
    if (tab !== "ds") {
      installDevHost(scenario(tab), tab === "quiz" ? { autoQuiz: sampleQuiz(locale).tasks } : {});
      setMount((m) => m + 1);
    }
  }, [tab]);

  useEffect(() => {
    document.body.className = dark ? "vscode-dark" : "vscode-light";
  }, [dark]);
  useEffect(() => {
    const id = setInterval(() => setLeft((l) => (l <= 0.1 ? 20 : +(l - 0.1).toFixed(1))), 100);
    return () => clearInterval(id);
  }, []);

  const names = ["Айбек Касымов", "Нурай А.", "Тимур Б.", "Эльдияр", "Айгерим С.", "Данияр"];

  return (
    <LocaleContext.Provider value={locale}>
      <ConnectionBanner show={lost} text="Соединение потеряно, переподключаемся…" />
      <div className="mx-auto flex max-w-[1180px] flex-col gap-8 p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Logo />
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: "ds", label: "Дизайн" },
                { value: "teacher", label: "Учитель" },
                { value: "student", label: "Ученик" },
                { value: "join", label: "Вход" },
                { value: "ended", label: "Выгнали" },
                { value: "quiz", label: "Викторина" },
              ]}
            />
            <Segmented
              value={locale}
              onChange={setLocale}
              options={[
                { value: "ru", label: "RU" },
                { value: "en", label: "EN" },
              ]}
            />
            <Button size="sm" variant="ghost" onClick={() => setLost((v) => !v)}>
              Сеть
            </Button>
            <Button size="sm" icon={dark ? <Sun size={14} /> : <Moon size={14} />} onClick={() => setDark((d) => !d)}>
              {dark ? "Светлая" : "Тёмная"}
            </Button>
          </div>
        </header>

        {tab !== "ds" ? (
          <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]">
            <div>
              <SectionTitle>Боковая панель · 300 px</SectionTitle>
              <div className="relative h-[640px] overflow-auto rounded-card border border-border bg-bg">
                <App key={`s${mount}`} view="sidebar" />
              </div>
            </div>
            <div>
              <SectionTitle>Панель игры</SectionTitle>
              <div className="relative h-[760px] overflow-auto rounded-card border border-border bg-[var(--vscode-editor-background)]">
                <App key={`p${mount}`} view="panel" />
              </div>
            </div>
          </div>
        ) : (
        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          {/* Боковая панель VS Code, 280–300 px */}
          <div>
            <SectionTitle>Боковая панель · 300 px</SectionTitle>
            <div className="overflow-hidden rounded-card border border-border bg-bg">
              <JoinScreen initialCode="482913" onJoin={() => {}} onTeacher={() => {}} />
            </div>
          </div>

          <div className="flex flex-col gap-8">
            <section>
              <SectionTitle>Кнопки</SectionTitle>
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="primary" size="lg" icon={<Play size={18} />}>
                  Начать игру
                </Button>
                <Button variant="primary" size="lg" loading>
                  Отправить
                </Button>
                <Button variant="primary" size="lg" disabled>
                  Отправить
                </Button>
                <Button icon={<Copy size={14} />}>Скопировать ссылку</Button>
                <Button variant="ghost" icon={<Shuffle size={14} />}>
                  Распределить случайно
                </Button>
                <Button variant="danger">Выгнать</Button>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div>
                <SectionTitle>Поля</SectionTitle>
                <div className="flex flex-col gap-4">
                  <Field label="Имя и фамилия" placeholder="Например, Айбек К." hint="Это имя увидит учитель" />
                  <Field label="Ответ" big defaultValue="13" error="Неверно — попробуй ещё через 3 с" />
                  <CodeCells value={code} onChange={setCode} label="Код" />
                </div>
              </div>
              <div>
                <SectionTitle>Переключатели и таймер</SectionTitle>
                <div className="flex flex-col items-start gap-4">
                  <Segmented
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "solo", label: "Каждый сам за себя" },
                      { value: "teams2", label: "2 команды" },
                      { value: "teams3", label: "3 команды" },
                    ]}
                  />
                  <Toggle checked={sound} onChange={setSound} label="Звук" />
                  <div className="flex items-center gap-4">
                    <TimerRing left={left} total={20} />
                    <TimerRing left={left} total={20} size={44} />
                    <span className="text-muted">
                      <Kbd>1</Kbd> – <Kbd>4</Kbd> выбор, <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> отправить
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <SectionTitle>Команды и игроки</SectionTitle>
              <div className="flex flex-wrap items-center gap-2">
                <TeamBadge team={0} name="Красные" />
                <TeamBadge team={1} name="Синие" />
                <TeamBadge team={2} name="Зелёные" />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {names.map((n, i) => (
                  <Avatar key={n} name={n} team={i < 2 ? 0 : i < 4 ? 1 : i === 4 ? 2 : null} offline={i === 5} />
                ))}
              </div>
            </section>

            <section>
              <SectionTitle>Викторина</SectionTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {["print(len('hello'))", "5", "hello", "Ошибка"].map((o, i) => (
                  <OptionTile
                    key={i}
                    index={i}
                    state={picked === null ? "idle" : i === 1 ? "correct" : i === picked ? "wrong" : "dim"}
                    onClick={() => setPicked(picked === null ? i : null)}
                  >
                    {o}
                  </OptionTile>
                ))}
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div>
                <SectionTitle>Загрузка</SectionTitle>
                <Card className="flex flex-col gap-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="size-8 rounded-full" />
                      <Skeleton className="h-3 flex-1" />
                    </div>
                  ))}
                </Card>
              </div>
              <div>
                <SectionTitle>Карточка</SectionTitle>
                <Card className="p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Код комнаты</div>
                  <div className="mt-1 font-mono text-hero font-bold leading-none tracking-[0.08em] tabular">482 913</div>
                  <Button className="mt-4" variant="primary" icon={<Send size={14} />}>
                    Отправить
                  </Button>
                </Card>
              </div>
            </section>
          </div>
        </div>
        )}
      </div>
    </LocaleContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Gallery />
  </StrictMode>,
);
