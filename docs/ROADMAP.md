# Roadmap

The original spec is [TZ.pdf](TZ.pdf). Two addenda changed priorities.

**Addendum 1 — frontend first.** Languages: HTML/CSS → JavaScript → Python.
Django/DRF and Flutter only in Quiz and Find the bug (no execution). Runners are
modules behind one interface so Dart is a single new module.

**Addendum 2 — Lesson mode is the default.** A room is a lesson; games run on top
of it and return to it. Students mark *Done / Still writing / Lost / Explain again*
from the status bar; the teacher streams one file read-only, sets checkpoints and
sees everyone's progress.

| # | Step | Status |
|---|---|---|
| 1 | Skeleton, design system | ✅ |
| 2 | Rooms, lobby, teams, reconnect | ✅ |
| 3 | Quiz | ✅ |
| 4 | Find the bug + HTML/CSS rules, runner modules, HTML/CSS task bank | ✅ |
| 5 | Tug of war | ✅ |
| 6 | Codewars (HTML/CSS, JS, Python) | ✅ |
| 7 | JavaScript task bank | ✅ |
| 8 | **Lesson, base**: room starts in Lesson, status bar «Join lesson» → status picker, «Start game», back to lesson after results | ✅ |
| 9 | Race | ✅ |
| 9½ | **Server online**: https://codearena.codearena-server.workers.dev, per-IP rate limits | ✅ |
| 10 | Anti-cheat (off in Lesson), live teacher table, CSV export | ✅ |
| 11 | **Lesson, part 2**: teacher shares one file read-only (`codearena:` FileSystemProvider, follow cursor, batched every 400 ms), checkpoints with line-diff progress, «Done N of M», laggards on top, click → student's code | ✅ |
| 12 | **My tasks + AI**: import JSON / text / Word or paste text → tasks sorted into games and kept in *My tasks*; Gemini generation (teacher's key in SecretStorage) with local verification of reference solutions and one repair round | ✅ |
| 13 | **Published** 0.1.0 (preview): [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=q-werty452.codearena), GitHub Release; Open VSX — after the `OVSX_PAT` secret | ✅ |
| 14 | Projector page, Docker server | |

## Lesson protocol

`lesson_share` / `lesson_share_stop` (teacher code, batched), `checkpoint_set` → `checkpoint`,
`peek` → `peek_request` → `peek_reply` → `peek_code` (teacher looks at a student's file),
`progress` (percent + checkpoint), `status`, `confused` (anonymous), `lesson_state`
(teacher: everyone's progress).

Progress is sent only when it changes (at most every 2 s); percent = share of the
checkpoint's lines found in the student's file, ignoring whitespace, indentation and
blank lines; extra student lines are not penalised.
