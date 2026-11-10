import * as vscode from "vscode";
import { basename, extname } from "node:path";
import {
  AI_KEY_URL,
  AiRequest,
  buildAiPrompt,
  buildRepairPrompt,
  distribute,
  parseAiResponse,
  parseTasksText,
  type AiState,
  type HostToUi,
  type ImportResult,
  type MySet,
  type SkippedTask,
  type Task,
} from "@codearena/shared";
import { docxToText } from "./docx.ts";
import { pickFlashModel, verifyTask } from "./aiVerify.ts";

/**
 * «Мои задания»: свои файлы учителя и ИИ-генерация.
 * Всё, что загружено или сгенерировано, раскладывается по играм и сохраняется
 * в библиотеку (globalState) — она видна в банке задач каждой игры.
 */
const LIB_KEY = "codearena.myTasks";
const SECRET_KEY = "codearena.geminiKey";
const MAX_SETS = 100;
const AI_TIMEOUT_MS = 120_000;
const DEFAULT_ENDPOINT = "https://generativelanguage.googleapis.com";

const ru = () => vscode.env.language.toLowerCase().startsWith("ru");

type Post = (m: HostToUi) => void;

export class MyTasks implements vscode.Disposable {
  private ai: AiState = { hasKey: false, busy: false };
  private abort: AbortController | null = null;
  /** Текст последнего нераспознанного файла — для «Разобрать с ИИ». */
  private pendingText: { text: string; fileName: string } | null = null;
  private model: string | null = null;
  /** Последний итог (для e2e). */
  lastResult: ImportResult | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly post: Post,
  ) {
    this.disposables.push(
      vscode.commands.registerCommand("codearena.importTasks", (uri?: vscode.Uri) => this.importFile(uri)),
      vscode.commands.registerCommand("codearena.setAiKey", () => this.askKey()),
      vscode.commands.registerCommand("codearena.clearAiKey", () => this.clearKey()),
      ctx.secrets.onDidChange((e) => e.key === SECRET_KEY && void this.refreshKey()),
      vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("codearena.ai") && (this.model = null)),
    );
    void this.refreshKey();
  }

  /* ─────────────── Библиотека ─────────────── */

  sets(): MySet[] {
    return this.ctx.globalState.get<MySet[]>(LIB_KEY) ?? [];
  }

  /** Снимок для webview (при ready и после изменений). */
  pushState(): void {
    this.post({ type: "my_tasks", sets: this.sets() });
    this.post({ type: "ai_state", state: this.ai });
  }

  async add(title: string, source: MySet["source"], tasks: Task[], fileName?: string): Promise<MySet> {
    const set: MySet = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, title: title || fileName || (ru() ? "Мои задания" : "My tasks"), source, fileName, createdAt: Date.now(), tasks };
    await this.ctx.globalState.update(LIB_KEY, [set, ...this.sets()].slice(0, MAX_SETS));
    this.post({ type: "my_tasks", sets: this.sets() });
    return set;
  }

  async remove(id: string): Promise<void> {
    await this.ctx.globalState.update(LIB_KEY, this.sets().filter((s) => s.id !== id));
    this.post({ type: "my_tasks", sets: this.sets() });
  }

  /* ─────────────── Файл учителя ─────────────── */

  async importFile(uri?: vscode.Uri): Promise<void> {
    if (!uri) {
      [uri] =
        (await vscode.window.showOpenDialog({
          canSelectMany: false,
          title: ru() ? "Свои задания: JSON, текст или Word" : "Your tasks: JSON, text or Word",
          filters: { [ru() ? "Задания" : "Tasks"]: ["json", "txt", "md", "docx"] },
        })) ?? [];
    }
    if (!uri) return;
    const fileName = basename(uri.fsPath);
    let text: string;
    try {
      const buf = await vscode.workspace.fs.readFile(uri);
      text = extname(fileName).toLowerCase() === ".docx" ? docxToText(buf) : new TextDecoder().decode(buf);
    } catch {
      void vscode.window.showErrorMessage(ru() ? `Не удалось прочитать ${fileName}` : `Could not read ${fileName}`);
      return;
    }
    const parsed = parseTasksText(text);
    if (parsed.format === "none" || !parsed.tasks.length) {
      // Формат не распознан — предложим разобрать с ИИ.
      this.pendingText = { text: text.slice(0, 40_000), fileName };
      this.result({ source: "file", title: "", fileName, byGame: {}, skipped: parsed.skipped, unrecognized: true });
      return;
    }
    const title = parsed.title || fileName.replace(/\.(codearena\.)?(json|txt|md|docx)$/i, "");
    const set = await this.add(title, "file", parsed.tasks, fileName);
    this.result({ source: "file", title, fileName, byGame: distribute(parsed.tasks, parsed.game), skipped: parsed.skipped, setId: set.id });
  }

  /* ─────────────── Ключ Gemini ─────────────── */

  private async refreshKey(): Promise<void> {
    const hasKey = Boolean(await this.ctx.secrets.get(SECRET_KEY));
    this.setAi({ hasKey });
  }

  /** Ключ вводит сам учитель; хранится в SecretStorage VS Code (системная связка ключей). */
  async askKey(): Promise<boolean> {
    const open = ru() ? "Получить ключ" : "Get a key";
    const key = await vscode.window.showInputBox({
      title: ru() ? "Ключ Gemini API" : "Gemini API key",
      prompt: ru()
        ? `Бесплатный ключ: ${AI_KEY_URL} — хранится только в этом VS Code`
        : `Free key: ${AI_KEY_URL} — stored only in this VS Code`,
      password: true,
      ignoreFocusOut: true,
      placeHolder: "AIza…",
      validateInput: (v) => (v.trim().length < 20 ? (ru() ? "Ключ слишком короткий" : "Key is too short") : null),
    });
    if (key === undefined) {
      const go = await vscode.window.showInformationMessage(ru() ? "Ключ Gemini можно получить бесплатно в Google AI Studio." : "You can get a free Gemini key in Google AI Studio.", open);
      if (go) void vscode.env.openExternal(vscode.Uri.parse(AI_KEY_URL));
      return false;
    }
    await this.storeKey(key);
    return true;
  }

  async storeKey(key: string): Promise<void> {
    await this.ctx.secrets.store(SECRET_KEY, key.trim());
    this.model = null;
    this.setAi({ hasKey: true, error: undefined, errorDetail: undefined });
  }

  get aiState(): AiState {
    return this.ai;
  }

  private result(result: ImportResult): void {
    this.lastResult = result;
    this.post({ type: "import_result", result });
  }

  async clearKey(): Promise<void> {
    await this.ctx.secrets.delete(SECRET_KEY);
    this.setAi({ hasKey: false, model: undefined });
  }

  private setAi(patch: Partial<AiState>): void {
    this.ai = { ...this.ai, ...patch };
    this.post({ type: "ai_state", state: this.ai });
  }

  /* ─────────────── ИИ-генерация ─────────────── */

  cancel(): void {
    this.abort?.abort();
  }

  async generate(input: AiRequest): Promise<void> {
    if (this.ai.busy) return;
    let req = AiRequest.parse(input);
    let fileName: string | undefined;
    if (req.mode === "extract") {
      if (!req.material && this.pendingText) req = { ...req, material: this.pendingText.text };
      fileName = this.pendingText?.fileName;
    }
    let key = await this.ctx.secrets.get(SECRET_KEY);
    if (!key) {
      if (!(await this.askKey())) return;
      key = await this.ctx.secrets.get(SECRET_KEY);
      if (!key) return;
    }
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.setAi({ busy: true, stage: "model", error: undefined, errorDetail: undefined, done: undefined, total: undefined });
    try {
      const model = await this.pickModel(key, signal);
      this.setAi({ stage: "generate", model });
      const first = parseAiResponse(await this.call(key, model, buildAiPrompt(req), signal), req);
      const skipped: SkippedTask[] = [...first.skipped];
      let { ok, broken, unverified } = await this.verifyAll(first.tasks, signal);

      // Один круг починки: модель получает конкретные ошибки проверки.
      if (broken.length && !signal.aborted) {
        this.setAi({ stage: "repair" });
        const fixed = parseAiResponse(await this.call(key, model, buildRepairPrompt(req, broken), signal), req);
        const again = await this.verifyAll(fixed.tasks, signal);
        ok = [...ok, ...again.ok];
        unverified += again.unverified;
        for (const b of again.broken) skipped.push({ where: b.task.prompt.slice(0, 40), reason: b.reason, detail: b.problem });
        // Если модель вернула меньше заданий, чем было сломано — недостающие тоже пропущены.
        for (const b of broken.slice(fixed.tasks.length)) skipped.push({ where: b.task.prompt.slice(0, 40), reason: b.reason, detail: b.problem });
      }
      if (!ok.length) {
        this.setAi({ busy: false, stage: undefined, error: "no_tasks", errorDetail: skipped.map((s) => s.detail ?? s.reason).slice(0, 3).join("; ") });
        return;
      }
      const title = first.title || req.topic || (ru() ? "Задания от ИИ" : "AI tasks");
      const set = await this.add(title, "ai", ok, fileName);
      const byGame = req.mode === "extract" ? distribute(ok) : distribute(ok, req.game === "race" ? "race" : undefined);
      this.result({ source: "ai", title, fileName, byGame, skipped, unverified, setId: set.id });
      if (req.mode === "extract") this.pendingText = null;
      this.setAi({ busy: false, stage: undefined });
    } catch (e) {
      const err = e as AiError;
      this.setAi({ busy: false, stage: undefined, error: signal.aborted ? "cancelled" : (err.code ?? "server"), errorDetail: err.code ? err.detail : String(err.message ?? e).slice(0, 200) });
    } finally {
      this.abort = null;
    }
  }

  /** Проверка эталонов: решение проходит все проверки, заготовка/сломанный код — нет. */
  private async verifyAll(tasks: Task[], signal: AbortSignal) {
    const ok: Task[] = [];
    const broken: { task: Task; problem: string; reason: SkippedTask["reason"] }[] = [];
    let unverified = 0;
    const toCheck = tasks.filter((t) => t.type === "code" || t.type === "fix_bug").length;
    let done = 0;
    if (toCheck) this.setAi({ stage: "verify", done: 0, total: toCheck });
    for (const t of tasks) {
      if (signal.aborted) break;
      if (t.type !== "code" && t.type !== "fix_bug") {
        ok.push(t);
        continue;
      }
      const v = await verifyTask(t);
      this.setAi({ done: ++done });
      if (v === "ok") ok.push(t);
      else if (v === "unverified") {
        unverified++;
        ok.push(t);
      } else broken.push({ task: t, problem: v.problem, reason: v.reason });
    }
    return { ok, broken, unverified };
  }

  private endpoint(): string {
    return (vscode.workspace.getConfiguration("codearena").get<string>("ai.endpoint") || DEFAULT_ENDPOINT).replace(/\/+$/, "");
  }

  /** Модель: из настройки или самая новая стабильная «flash», доступная ключу. */
  private async pickModel(key: string, signal: AbortSignal): Promise<string> {
    const configured = vscode.workspace.getConfiguration("codearena").get<string>("ai.model")?.trim();
    if (configured) return configured.replace(/^models\//, "");
    if (this.model) return this.model;
    const r = await this.fetch(`${this.endpoint()}/v1beta/models?pageSize=1000`, { headers: { "x-goog-api-key": key }, signal });
    const data = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    this.model = pickFlashModel(data.models ?? []);
    return this.model;
  }

  private async call(key: string, model: string, prompt: string, signal: AbortSignal): Promise<string> {
    const r = await this.fetch(`${this.endpoint()}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
      }),
      signal,
    });
    const data = (await r.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) throw new AiError("blocked", data.promptFeedback.blockReason);
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (!text.trim()) throw new AiError("empty", data.candidates?.[0]?.finishReason);
    return text;
  }

  /** fetch с таймаутом и понятными ошибками (неверный ключ, лимит бесплатного тарифа, сеть). */
  private async fetch(url: string, init: RequestInit & { signal: AbortSignal }): Promise<Response> {
    const timeout = AbortSignal.timeout(AI_TIMEOUT_MS);
    let r: Response;
    try {
      r = await fetch(url, { ...init, signal: AbortSignal.any([init.signal, timeout]) });
    } catch (e) {
      if (init.signal.aborted) throw e;
      throw new AiError("network", timeout.aborted ? "timeout" : String((e as Error).message));
    }
    if (r.ok) return r;
    const body = await r.text().catch(() => "");
    const msg = /"message":\s*"([^"]+)"/.exec(body)?.[1] ?? body.slice(0, 200);
    if (r.status === 400 && /api key|API_KEY/i.test(body)) throw new AiError("bad_key", msg);
    if (r.status === 401 || r.status === 403) throw new AiError("bad_key", msg);
    if (r.status === 429) throw new AiError("quota", msg);
    if (r.status === 404) this.model = null;
    throw new AiError("server", `${r.status} ${msg}`);
  }

  dispose(): void {
    this.abort?.abort();
    this.disposables.forEach((d) => d.dispose());
  }
}

class AiError extends Error {
  constructor(
    readonly code: NonNullable<AiState["error"]>,
    readonly detail?: string,
  ) {
    super(code + (detail ? `: ${detail}` : ""));
  }
}
