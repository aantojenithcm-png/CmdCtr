# Unified Response — Emergency Coordination System

A model project demonstrating a multi-department emergency coordination platform: when an emergency is triggered by any source, it is automatically routed to every relevant government department, while access to information is scoped by role — departments get full control of their own tools, and citizens see only a filtered, plain-language subset.

This version has a **real backend**: a zero-dependency Node.js server that persists incidents, enforces role-based access server-side with real login, and pushes live updates to every open dashboard over Server-Sent Events.

---

## What's included

| Path | Purpose |
|---|---|
| `server.js` | The HTTP server — serves the front-end and the JSON REST API |
| `lib/data.js` | The routing rulebook and department registry (single source of truth) |
| `lib/auth.js` | Password hashing + JWT-style token signing/verification, built on Node's `crypto` only |
| `lib/store.js` | JSON-file persistence for incidents, the event log, and demo user accounts |
| `data/store.json` | Auto-created on first run — this is the "database" |
| `public/index.html` | Landing / documentation page |
| `public/dashboard.html` | The live interactive dashboard |
| `public/dashboard.js` | Front-end logic — now talks to the real API instead of holding fake local state |
| `public/dashboard.css`, `public/styles.css` | Styling |
| `public/icons.js` | Self-hosted inline SVG icons — no external CDN dependency |

**No `npm install` required.** The backend is built entirely on Node's built-in `http` and `crypto` modules — no Express, no database driver, no JWT library. This was a deliberate choice so the project runs anywhere with zero setup friction; see "Why no dependencies?" below if you want to swap in real libraries for production.

---

## Running it

```bash
node server.js
```

Then open **http://localhost:3000** (not `file://` — the dashboard needs the server for its API calls to work). Port defaults to `3000`; override with `PORT=4000 node server.js`.

On first run, the server auto-seeds demo accounts into `data/store.json`:

| Username | Password | Role |
|---|---|---|
| `command` | `password123` | Command Centre |
| `traffic` | `password123` | Traffic Police |
| `health` | `password123` | Health / Ambulance |
| `hospital` | `password123` | Hospitals |
| `fire` | `password123` | Fire & Rescue |
| `police` | `password123` | Police |
| `municipal` | `password123` | Municipal Corp. |
| `disaster` | `password123` | Disaster Mgmt. |
| `transport` | `password123` | Transport / RTO |

The dashboard shows these credentials right on the login screen for each role, so there's nothing to look up while demoing. The **Citizen** role needs no login at all — it only ever calls the public, pre-filtered endpoint.

---

## How the backend enforces access control

This is the part worth reading closely if you're presenting this project — the access rules aren't just a front-end UI convention anymore, they're enforced by the server on every request:

- `GET /api/departments` — public. Returns only `{id, name, icon}` for each department, never their internal tools.
- `GET /api/departments/:id/full` — **requires a valid token**, and the server checks `user.role === deptId || user.role === "command"`. A logged-in Traffic Police account gets a `403` if it tries to read Hospital's full feature list — try it with curl and see for yourself.
- `GET /api/incidents/active` — requires any valid token (command or department). Returns the full incident including `routes`.
- `GET /api/incidents/active/public` — no auth at all, and structurally cannot return department names or routing internals — it only ever returns a pre-written plain-language sentence plus three generic fields. This is the endpoint the Citizen view calls, and it's a genuinely different code path from the authenticated one, not just a filtered display of the same data.
- `POST /api/incidents/trigger` — requires `role === "command"`. Any other authenticated role gets `403`.
- `POST /api/incidents/resolve` — same, command-only.
- `POST /api/incidents/report` — public (citizen SOS), but hardcoded to always classify as `"medical"` and rate-limited to one request per 10 seconds per IP.

Try the negative cases yourself:

```bash
# Log in as Traffic Police
TOKEN=$(curl -s -X POST localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"traffic","password":"password123"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")

# Try to read Hospitals' internal data — should be 403
curl -i localhost:3000/api/departments/hospital/full -H "Authorization: Bearer $TOKEN"

# Try to trigger an emergency — should be 403 (command-only)
curl -i -X POST localhost:3000/api/incidents/trigger -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"typeId":"fire"}'
```

## Live sync across multiple dashboards

Open `http://localhost:3000/dashboard.html` in two different browser tabs (or two different browsers entirely). Log in as Command Centre in one, trigger an emergency, and watch the *other* tab — whether it's sitting on the Citizen view or a Department view — update automatically within about a second. That's the `/api/stream` Server-Sent Events endpoint: the server pushes a lightweight "something changed" notification to every connected client, and each client re-fetches through its own authorized endpoint. No sensitive data ever travels through the push itself — it's just a signal to refresh.

---

## Deploying it

Because this is now a real Node server (not a static site), Netlify Drop / GitHub Pages won't work as-is — those only serve static files. Use a platform that runs a Node process:

### Render / Railway / Fly.io (easiest)
1. Push this folder to a GitHub repo
2. Connect the repo on Render.com or Railway.app
3. Build command: none needed. Start command: `node server.js`
4. Set the `PORT` environment variable if the platform requires a specific one (most auto-inject it)
5. **Important**: set `AUTH_SECRET` to a long random string in the platform's environment variables — otherwise tokens are invalidated every time the server restarts (see below)

### A VPS (DigitalOcean, EC2, etc.)
```bash
git clone <your-repo>
cd unified-response
AUTH_SECRET="$(openssl rand -hex 32)" PORT=3000 node server.js
# use pm2 or a systemd service to keep it running, and nginx as a reverse proxy for TLS
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## Why no dependencies?

This was built in an environment with no package registry access, which turned out to double as a genuinely nice property for a model project: `git clone` + `node server.js` and it just runs, on any machine with Node ≥18, with nothing to install and nothing to go wrong in `npm install`. The tradeoffs are real, though — see below.

## Known limitations (still a prototype, not production)

- **Custom auth, not a vetted library.** The token signing in `lib/auth.js` is a minimal hand-rolled HMAC scheme, not the `jsonwebtoken` package. It's implemented carefully (timing-safe comparison, expiry checks) but hasn't had the security review a widely-used library has. **Swap it for `jsonwebtoken` + `bcrypt`/`argon2` before handling anything real.**
- **Token secret resets on restart** unless you set `AUTH_SECRET` — otherwise every restart invalidates all logged-in sessions.
- **JSON-file storage**, not a real database. Fine for a demo's data volume; would not hold up under concurrent write load. Swap `lib/store.js` for Postgres/SQLite for anything beyond a demo.
- **Single active incident** — mirrors the original front-end prototype's simplification; a real system needs to track multiple concurrent incidents.
- **No HTTPS** — this serves plain HTTP. Put it behind a reverse proxy (nginx, Caddy, or your hosting platform's built-in TLS) for anything beyond `localhost`.
- **No real GPS, maps, or external data feeds** — incidents are still manually triggered, not sensor-driven.
- **Demo passwords are all identical** (`password123`) and printed in this README. Change every account's password (see `lib/store.js`'s `seed()` function) before showing this to anyone you don't want logging in.

## Suggested next steps

1. Swap the hand-rolled auth for `jsonwebtoken` + `bcrypt` once you have package-registry access.
2. Replace `store.json` with a real database and add basic input validation/schemas.
3. Support multiple concurrent incidents instead of one active incident at a time.
4. Add a real map (Leaflet/Google Maps) fed by actual department data feeds instead of trigger buttons.
5. Add HTTPS/reverse-proxy config for a production deployment.

---

## License / usage

This is a demonstration/model project. Feel free to adapt, extend, or present it as your own coursework or hackathon submission.
