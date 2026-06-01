# Running FOODPRO POS on Windows 11

This monorepo was originally tuned for the Replit Linux container. The two
quirks that bite Windows users have been fixed:

1. **`preinstall` script** used `sh -c` → replaced with a Node.js script
   (`scripts/preinstall.mjs`) that runs identically on Windows, macOS, Linux.
2. **`pnpm-workspace.yaml` overrides** previously removed Windows native
   binaries to shrink the Linux image. Now the **win32-x64** variants of
   `@esbuild`, `@rollup`, `lightningcss`, and `@tailwindcss/oxide` are
   re-enabled so Windows can install them.

## Prerequisites

| Tool       | Version       | Where to get it                              |
|------------|---------------|----------------------------------------------|
| Node.js    | 20.x LTS or 22 | https://nodejs.org/en/download                |
| pnpm       | 9 or 10       | `npm install -g pnpm`                         |
| PostgreSQL | 15 or 16      | https://www.postgresql.org/download/windows/  |
| Git        | latest        | https://git-scm.com/download/win              |

> **Important**: open a fresh PowerShell or Windows Terminal **after**
> installing pnpm/Node so the `PATH` is picked up.

## One-time setup

```powershell
# clone (or unzip) the repo, then:
cd C:\path\to\foodpro
pnpm install
```

`pnpm install` should complete in 2–3 minutes. You will see:
- `preinstall: Done` (the Node script ran).
- All workspace packages resolved, no errors about
  `@rollup/rollup-win32-x64-msvc`.

### Database

1. Create a database + user matching the existing connection string:
   ```
   postgres://foodoro:foodoro123@localhost:5432/foodoro_db
   ```
   In `psql`:
   ```sql
   CREATE USER foodoro WITH PASSWORD 'foodoro123';
   CREATE DATABASE foodoro_db OWNER foodoro;
   GRANT ALL PRIVILEGES ON DATABASE foodoro_db TO foodoro;
   ```
   Or change the URL in `artifacts/api-server/.env` to whatever you prefer.

2. **Run the bootstrap SQL** in `scripts/bootstrap.sh`. On Windows it's easier
   to just execute the SQL section directly:
   ```powershell
   $env:PGPASSWORD = "foodoro123"
   Get-Content scripts/bootstrap.sh | Select-String -Pattern "CREATE" -Context 0,9999 |
     psql -h localhost -U foodoro -d foodoro_db
   ```
   Or open `scripts/bootstrap.sh` in an editor, copy the SQL between
   `psql ... <<'SQL'` and `SQL`, and paste into pgAdmin or `psql`.

### Environment

Both apps look for `.env` files:

```powershell
copy artifacts\api-server\.env.example artifacts\api-server\.env
copy artifacts\foodoro\.env.example      artifacts\foodoro\.env
```

Edit `artifacts/api-server/.env` and adjust at minimum:
```
DATABASE_URL=postgresql://foodoro:foodoro123@localhost:5432/foodoro_db
JWT_SECRET=<32+ random characters>
EMERGENT_LLM_KEY=<your key from Emergent profile>
```

## Running the apps

Open two PowerShell terminals.

### Terminal 1 — Backend (port 8001)
```powershell
cd artifacts\api-server
pnpm run build
node dist\index.mjs
```

Or for hot-reload during development:
```powershell
cd artifacts\api-server
pnpm run dev
```

### Terminal 2 — Frontend (port 3000)
```powershell
cd artifacts\foodoro
pnpm run dev
```

Open http://localhost:3000 in your browser. Sign in with:
- email: `demo@foodpro.com`
- password: `Demo2026!`

## If you still hit `@rollup/rollup-win32-x64-msvc` missing

Pnpm sometimes caches an old store keyed off the previous overrides. Force a
clean install:

```powershell
Remove-Item -Recurse -Force node_modules, artifacts\*\node_modules, lib\*\node_modules
pnpm store prune
pnpm install
```

## Optional: AI sidecar (Python)

The AI features (predictions, recommendations, anomaly detection) call a
Python FastAPI sidecar. If you don't need them locally, the rest of the app
runs fine without it. To enable:

```powershell
cd ai-sidecar
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:EMERGENT_LLM_KEY = "<your key>"
uvicorn app:app --host 127.0.0.1 --port 9000
```

---

**Tested on**: Windows 11 24H2, Node 20.18 LTS, pnpm 9.15.5, PostgreSQL 16.
