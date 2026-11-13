import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { host } from "../lib/session.ts";

/**
 * Ошибка в интерфейсе не превращается в пустой тёмный экран:
 * показываем, что случилось, и кнопку «Назад» (экран монтируется заново).
 * Текст ошибки уходит в расширение — в канал вывода «CodeArena».
 */
export class ErrorBoundary extends Component<{ children: ReactNode; labels: { title: string; hint: string; back: string } }, { error: Error | null; key: number }> {
  state = { error: null as Error | null, key: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    host.post({ type: "ui_error", message: String(error?.stack ?? error).slice(0, 4000) });
  }

  render() {
    const { error, key } = this.state;
    const { labels } = this.props;
    if (!error) return <div key={key} className="contents">{this.props.children}</div>;
    return (
      <div className="mx-auto flex max-w-[560px] flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-error/10 text-error">
          <AlertTriangle size={24} />
        </span>
        <h1 className="text-[18px] font-semibold">{labels.title}</h1>
        <p className="text-[13px] text-muted">{labels.hint}</p>
        <pre className="max-h-32 w-full overflow-auto rounded-btn bg-surface p-3 text-left font-mono text-[11px] text-muted">{error.message}</pre>
        <button
          onClick={() => this.setState({ error: null, key: key + 1 })}
          className="inline-flex h-9 items-center gap-2 rounded-btn bg-accent px-4 text-[13px] font-semibold text-on-accent hover:bg-accent-hover"
        >
          <RotateCcw size={14} /> {labels.back}
        </button>
      </div>
    );
  }
}
