# Life OS

A local-first personal operating system: today, week, calendar, tasks, focus, academics, fitness, sleep, diet,
mindfulness, finance, projects & hackathons, habits, goals, analytics and reviews — with a subtle RPG layer.

## Run

Double-click **`Start Life OS.cmd`**, or:

```
npm install      # first time only
npm start        # builds, serves http://localhost:4321 and opens the browser
```

Keep that window open while you use the app — closing it stops the server ("site can't be reached").

- **Phone, anywhere (recommended):** Tailscale on laptop + phone, then open **https://tharun.tail608ed9.ts.net**
  (set up once with `tailscale serve --bg 4321`; only your own Tailscale devices can reach it; turn off with
  `tailscale serve --https=443 off`). Needs Life OS running on the laptop and Tailscale connected on both.
- `npm run start:lan` — reachable from anyone on the same Wi-Fi (no login: trusted networks only).
- `npm run dev` — rebuilds and reloads the page when source files change.
- `npm test` — logic self-checks (recurrence, sleep window, streaks, XP, finance, demo data).
- `npm run typecheck`

## Your data

- Stored in `data/lifeos.json` next to this file; a daily copy goes to `data/backups/` (last 30 days).
- Settings → Data: export / import a JSON backup, remove demo data, reset demo data, delete everything.
- Deletes show an **Undo** toast (also `Ctrl+Z`).
- If the page is opened without the server, it falls back to browser storage and says so in the sidebar.

## Keys

`Ctrl/⌘+K` search & commands · `C` quick capture · `T` today · `W` week · `F` focus · `H` home

## Notes

- Vite can't build from a folder whose path contains `#`, so `server.mjs` uses esbuild + a tiny Node server instead.
- XP is derived from your history (never stored), so changing XP values in Settings applies retroactively.
  Tasks and focus sessions done inside your protected sleep window earn no XP.
