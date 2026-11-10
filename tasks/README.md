# Task bank

Ready-made task sets that teachers open with **«From the bank»** in the task editor.
Each file is a `TaskSet` (see `packages/shared/src/tasks.ts`) with a `game` field.

469 tasks in two levels: **basic** (`quiz.json`, …) and **medium** (`quiz-medium.json`, …;
the Python and Dart sets are medium). Medium tasks have a catch: «what will this print?»,
reference vs copy, edge cases. Many are based on real college classwork (forms, specificity,
orders and menus, the Dart calculator).

| Folder | Basic | Medium |
|---|---|---|
| `html-css/` | quiz 19 · tug 19 · bug 20 · Codewars 16 | quiz 24 · tug 20 · bug 19 · Codewars 16 |
| `javascript/` | quiz 19 · tug 19 · bug 20 · Codewars 16 | quiz 24 · tug 21 · bug 20 · Codewars 16 |
| `python/` | — | quiz 24 · tug 20 · bug 21 · Codewars 16 |
| `dart/` | — | quiz 24 · tug 20 · bug 20 · Codewars 16 |

Every task with code is checked automatically (`npm test -w codearena`):
the broken code or starter must fail its checks and the reference solution must pass.
Python tasks need `python3`, Dart tasks need `dart` (Dart SDK or Flutter) on the machine that runs the tests.

In a question, put multi-line code in a fenced block — it is shown as a code block in the game:

````text
Что выведет код?
```python
print(7 // 2)
```
````

## Send your tasks

1. Fork the repo, add or edit a JSON file in this folder.
2. Run `npm test` — the bank test validates your tasks.
3. Open a pull request.
