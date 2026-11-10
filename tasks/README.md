# Task bank

Ready-made task sets that teachers open with **«From the bank»** in the task editor.
Each file is a `TaskSet` (see `packages/shared/src/tasks.ts`) with a `game` field.

| Folder | Sets |
|---|---|
| `html-css/` | quiz (19), tug of war (19), find the bug (20), Codewars (16) |
| `javascript/` | quiz (19), tug of war (19), find the bug (20), Codewars (16) |

Every task with code is checked automatically (`npm test -w codearena`):
the broken code or starter must fail its checks and the reference solution must pass.

## Send your tasks

1. Fork the repo, add or edit a JSON file in this folder.
2. Run `npm test` — the bank test validates your tasks.
3. Open a pull request.
