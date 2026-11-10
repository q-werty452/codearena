# CodeArena

**Kahoot + Codewars inside VS Code.** The teacher creates a room, students join with a 6-digit code or a link, and the whole class plays coding games right in the editor — tug of war, quiz, Codewars, race and find-the-bug.

Open source (MIT), zero cost: students' code runs on their own machines, the game server runs on Cloudflare's free plan.

Made by [**q-werty452**](https://github.com/q-werty452).

> 🚧 Work in progress. Ready: rooms & teams, **Quiz**, **Find the bug**, **Tug of war**, **Codewars**, task bank. Next: **Lesson mode** (the default room mode), Race, anti-cheat. See the [roadmap](docs/ROADMAP.md) and the [spec](docs/TZ.pdf).

Built for frontend teachers: **HTML/CSS → JavaScript → Python**. HTML and CSS are checked with selector rules (“there is a `<footer>`”, “every `img` has `alt`”, “`.card` has `display: flex`”), JavaScript and Python with test calls — all on the student's computer. Django/DRF and Flutter snippets are supported in Quiz and Find the bug (no code execution).

## Repository layout

| Package | What's inside | Stack |
|---|---|---|
| [`packages/extension`](packages/extension) | VS Code extension: sidebar, game panel, join links, running tests, anti-cheat | TypeScript, VS Code API, esbuild |
| [`packages/webview-ui`](packages/webview-ui) | All game UI inside VS Code (student and teacher panels) | React, Vite, Tailwind CSS, Motion |
| [`packages/server`](packages/server) | Rooms, players, teams, scores, timers, answer checking | Cloudflare Workers, Durable Objects (SQLite), WebSocket Hibernation |
| [`packages/shared`](packages/shared) | Message protocol, task schemas, scoring logic | TypeScript, Zod |
| [`tasks/`](tasks) | Open task bank: HTML/CSS and JavaScript sets for every game (148 tasks), validated by tests — send yours as a pull request | JSON |

## Development

Requires Node.js 20+ and VS Code.

```sh
npm install
npm test                 # shared logic, server (inside workerd), runners, task bank
npm run e2e -w codearena # drives a real VS Code instance (needs npm run dev:server)
npm run typecheck

npm run dev:server       # local game server on http://127.0.0.1:8787
npm run dev:ui           # design-system gallery on http://127.0.0.1:5173

npm run build            # builds webview UI into the extension, then the extension
```

To try the extension: open this folder in VS Code and run **Run Extension** (F5), or build a `.vsix`:

```sh
npm run build && npm run package -w codearena
```

then in VS Code: *Extensions → … → Install from VSIX*.

## Design principles

1. One main action per screen.
2. Understandable in 5 seconds without instructions.
3. Instant feedback on every action.
4. Native to VS Code: base colors come from the user's theme, bright colors only for game elements.
5. Not only color: teams and answers also differ by shape or icon.
6. No browser-default ugliness — every element is styled.

## License

[MIT](LICENSE) © q-werty452
