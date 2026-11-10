import { describe, expect, it } from "vitest";
import { distribute, parseTasksText } from "./importer.ts";

describe("parseTasksText — текст", () => {
  it("варианты с + и короткий ответ через =", () => {
    const r = parseTasksText(`# Тема: Ссылки

1. Какой тег создаёт ссылку?
- <div>
+ <a>
- <span>

2. Каким свойством меняют цвет текста?
= color | colour
`);
    expect(r.format).toBe("text");
    expect(r.title).toBe("Ссылки");
    expect(r.tasks).toHaveLength(2);
    const [q, s] = r.tasks;
    expect(q).toMatchObject({ type: "choice", topic: "Ссылки", prompt: "Какой тег создаёт ссылку?", options: ["<div>", "<a>", "<span>"], correct: 1 });
    expect(s).toMatchObject({ type: "short_answer", answers: ["color", "colour"] });
  });

  it("формат из Word: a) б) + «Ответ: b», кириллические буквы, (верно)", () => {
    const r = parseTasksText(`Вопрос 1: Тег абзаца?
a) <br>
b) <p>
Ответ: b

Вопрос 2: Какой тег для заголовка первого уровня?
а) <h1> (верно)
б) <head>
в) <header>`);
    expect(r.tasks.map((t) => t.type === "choice" && t.correct)).toEqual([1, 0]);
    expect(r.tasks[1]).toMatchObject({ options: ["<h1>", "<head>", "<header>"] });
  });

  it("«*» у всех вариантов — маркеры списка, правильный по «Ответ:»", () => {
    const r = parseTasksText(`? Сколько будет 2+2
* 3
* 4
Ответ: 4`);
    expect(r.tasks[0]).toMatchObject({ type: "choice", correct: 1 });
  });

  it("вопрос без отметки правильного и с 5 вариантами — пропускаются с причиной", () => {
    const r = parseTasksText(`1. Без ответа
- a
- b

2. Слишком много
+ 1
- 2
- 3
- 4
- 5

3. Нормальный
= ok`);
    expect(r.tasks).toHaveLength(1);
    expect(r.skipped.map((s) => s.reason)).toEqual(["no_correct", "too_many_options"]);
  });

  it("код в вопросе сохраняется вместе с текстом", () => {
    const r = parseTasksText("1. Что выведет код?\n```js\nconsole.log(1 + '1')\n```\n- 2\n+ 11\n");
    expect(r.tasks[0]!.type === "choice" && r.tasks[0]!.prompt).toContain("console.log(1 + '1')");
  });

  it("непохожий на задания текст — format none (предложим ИИ)", () => {
    const r = parseTasksText("Сегодня на уроке мы прошли flexbox. Свойство justify-content выравнивает по главной оси.");
    expect(r.format).toBe("none");
    expect(r.tasks).toHaveLength(0);
  });
});

describe("parseTasksText — JSON", () => {
  it("набор CodeArena и «примерно похожий» JSON", () => {
    const r = parseTasksText(
      JSON.stringify({
        title: "Мой набор",
        tasks: [
          { question: "2+2?", options: ["3", "4"], answer: "4" },
          { prompt: "Тег ссылки", answer: "a" },
          { type: "code", language: "javascript", prompt: "sum", starter: "function sum(a,b){}", tests: [{ call: "sum(1,2)", expected: "3" }] },
          { type: "code", language: "dart", prompt: "нет проверок", starter: "" },
          { type: "find_line", language: "html", code: "<p>\n<b>", line: 9 },
        ],
      }),
    );
    expect(r.format).toBe("json");
    expect(r.tasks.map((t) => t.type)).toEqual(["choice", "short_answer", "code"]);
    expect(r.tasks[0]).toMatchObject({ correct: 1, topic: "Мой набор" });
    expect(r.skipped.map((s) => s.reason)).toEqual(["no_checks", "invalid"]);
  });
});

describe("distribute", () => {
  it("раскладывает по играм, набор гонки остаётся гонке", () => {
    const r = parseTasksText(`1. a?\n+ 1\n- 2\n\n2. b?\n= x\n\n3. c?\n= y`);
    const d = distribute(r.tasks);
    expect(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v!.length]))).toEqual({ quiz: 1, tug: 2 });
    expect(Object.keys(distribute(r.tasks, "race"))).toEqual(["race"]);
  });
});
