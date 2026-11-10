# Changelog

## 0.2.0

- **Task bank: 469 tasks** (was 146). New medium-level sets for HTML/CSS and JavaScript,
  and new **Python** and **Dart** sets for every game — quiz, tug of war, find the bug, Codewars.
  Medium questions have a catch: «what will this print?», references vs copies, edge cases.
- **Dart code tasks run**: Codewars and «fix the bug» in Dart are checked on the student's computer
  (needs the Dart SDK or Flutter), like Python.
- Multi-line code in questions is shown as a code block.
- Fixed: the Codewars screen showed «JavaScript» for HTML, CSS and Dart tasks.

## 0.1.2

- Fixed: the «AI» dialog went blank after picking a game, language or difficulty.
- Links («Get a free key», «How to install Python») now open in your browser through VS Code.
- Every screen and dialog is now clicked through automatically in a real VS Code before each release.

## 0.1.1

- Fixed: the teacher panel went blank after choosing a game (also when editing tasks) in VS Code.
- A UI error now shows a message with a «Back» button instead of an empty screen, and is logged to Output → CodeArena.

## 0.1.0 — first public preview

- **Lesson mode** (default): students mark «Done / Still writing / Lost», anonymous «Explain again»;
  the teacher shows one file read-only, sets checkpoints and sees every student's progress.
- **Games** on top of the lesson: Quiz, Tug of war, Codewars, Race, Find the bug.
- Tasks in HTML/CSS, JavaScript and Python; built-in task bank (≈150 tasks).
- **My tasks**: import JSON, text or Word, or paste text — tasks are sorted into games automatically.
- **AI tasks** with the teacher's own free Gemini key; code tasks are verified before the lesson.
- Anti-cheat for games (paste guard, focus tracking, AI extensions), live teacher table, CSV export.
- English and Russian interface.
