# AutoInvite — Project Restructure Specification

**Author:** Architecture Analysis (Read-Only Pass)
**Date:** 2026-04-04
**Scope:** Structural reorganization only — no logic changes, no dependency upgrades.

---

## Executive Summary

The project is a functioning Node.js SaaS backend with a co-located React landing page. The core `src/` layout is solid. The problems are almost entirely at the **root level**: dead files from three different eras of the codebase (CLI prototype, Replit experiment, SaaS rebuild) have accumulated without being cleaned up. Additionally, there are naming inconsistencies, misplaced static assets, and the landing page has an internal layout issue (component files scattered in the project root instead of `src/`).

The restructuring work is low-risk because it is almost entirely **deletion of dead code** and **moving files with no import dependencies**. The two highest-risk tasks — the `scripts/post-merge.sh` Replit reference and the `server.js` hardcoded landing path to `taqreerk/dist` — are explicitly flagged below.

---

## Current Structure Issues

### 1. Root-Level Clutter (High Priority)

The project root is used as a dumping ground for files from multiple abandoned approaches:

- **CLI-era files still present:** `src/index.js`, `grid_test.js`, `grid_test.png`, `test_verify.js`, `test_output.txt`, `data - Sheet1.csv`, `template.png`, `main.py`
- **Replit platform artifacts committed to the repo:** `.replit`, `replit.md`, `replit.nix`, `pyproject.toml` — these have no function on a VPS or Docker deployment
- **Binary executables checked into the repo:** `claude.exe`, `specify.exe`, `uv.exe`, `uvw.exe`, `uvx.exe` — these are Windows developer tools, not app dependencies
- **Duplicate deployment documentation:** `DEPLOYMENT.md`, `DEPLOYMENT-GUIDE.md`, `deploy.sh.txt`, `ZERO-DAY-REPORT.md`, `AutoInvite_Guide_AR.md`, `verification-report.md` — operational docs that belong in a `docs/` folder or should be deleted
- **Stale AI agent context directory:** `.agents/` is committed despite being in `.gitignore`
- **Duplicate font file:** `TSNAS-BOLD.OTF` exists at both the project root and `assets/TSNAS-BOLD.OTF` — only `assets/` should exist since `src/config/settings.js` references `assets/TSNAS-BOLD.OTF`

### 2. Database Layer Has Dead Legacy Files

`src/database/` contains files from three different eras:
- `db.js` — SQLite legacy client (replaced by `pg-client.js`)
- `init.js` — Original SQLite schema (replaced by `init_saas.js`)
- `migrate_v2.js` — SQLite migration script (replaced by `migrate_saas.js`)

These still exist alongside the active PostgreSQL files, creating confusion about which files are authoritative.

### 3. Landing Page Has Loose Component Files at Its Root

`landing-autoinvite/` has component `.tsx` files scattered at its own root rather than in a `src/` directory:
- `App.tsx`, `CTA.tsx`, `Comparison.tsx`, `FAQ.tsx`, `FeaturesBento.tsx`, `Footer.tsx`, `Hero.tsx`, `Timeline.tsx`, `main.tsx`, `index.css`

These sit alongside `package.json` and `vite.config.ts` when they should be in `landing-autoinvite/src/`. Note: `components/Hero.tsx` and `components/Navbar.tsx` already exist in a proper subdirectory — the root-level `Hero.tsx` is likely a duplicate.

### 4. Uploads Directory at Project Root

`uploads/` at the project root contains real user-uploaded files (images, CSV, XLSX). The active application code in `src/middleware/uploadStorage.js` writes new uploads to `storage/tenant_{id}/uploads/`, making the root `uploads/` directory a legacy artifact that will never receive new files. It is also covered by `.gitignore`.

### 5. `public/` Contains a Mix of Legacy and Active Files

`public/` contains:
- Active files: `assets/fonts/`, `assets/images/`, `assets/template.csv`, `assets/template.xlsx`, `public/js/`, `public/style.css`, `public/landing.css`
- Legacy single-page files from the pre-EJS era: `client.js`, `create_campaign.html`, `create_campaign.js`, `index.html`, `login.html`, `landing.html`, `template.csv`, `video_excel.mp4`

The EJS views in `src/views/` now handle all HTML rendering. The legacy `.html` and root-level `.js` files in `public/` are no longer served intentionally but still sit in the static middleware path.

### 6. `scripts/` References the Wrong Landing Page Directory

`scripts/post-merge.sh` hardcodes `cd taqreerk` but the actual landing page directory is `landing-autoinvite/`. The script would fail on any fresh checkout.

### 7. Naming Mismatch: `taqreerk` vs `landing-autoinvite`

`src/server.js` references `../taqreerk/dist` as the landing page build output path (lines 161-183). The actual directory is `landing-autoinvite/`. This means the auto-build and static serving of the landing page is **silently broken** on any environment. The directory needs to either be renamed to `taqreerk` or `server.js` must be updated.

### 8. `bin/` Directory is Empty

An empty `bin/` directory exists at the project root with no contents and no reference in `package.json`. It should be removed.

### 9. `data/` Directory Duplicates a Root-Level CSV

`data/data - Sheet1.csv` is an exact path duplicate of the root-level `data - Sheet1.csv`. Both are test data files that should not be in the repository.

### 10. Config File (`CLAUDE.md.txt`) Has Wrong Extension

`CLAUDE.md.txt` is the AI context file for this project but uses a `.txt` extension. The standard convention is `CLAUDE.md` so that tools like Claude Code recognize it automatically.

---

## Restructuring Checklist

Tasks are grouped by category and ordered by safety (safest first). Each task notes what to do, the target location, and why.

---

### Category A — Safe Deletions (Zero Risk)

These files have no imports, no references in active code, and are either duplicates or leftovers from abandoned approaches.

- [ ] **A-01** Delete `database.db` from the project root. It is the legacy SQLite database file. The `.gitignore` already lists it — it should never have been committed. The app uses PostgreSQL in all active code paths.

- [ ] **A-02** Delete `grid_test.js` and `grid_test.png` from the project root. These are one-off canvas debugging scripts with no imports or references anywhere in the codebase.

- [ ] **A-03** Delete `test_verify.js` and `test_output.txt` from the project root. `test_verify.js` is a standalone utility script that tests `normalizePhone` and `generateImage` directly; it has no test runner integration and is not referenced anywhere.

- [ ] **A-04** Delete `data - Sheet1.csv` from the project root. It is a sample test CSV file. The copy inside `data/` is a duplicate. Neither belongs in source control.

- [ ] **A-05** Delete the `data/` directory entirely (`data/data - Sheet1.csv`). Same reason as A-04.

- [ ] **A-06** Delete `template.png` from the project root. The canonical template image lives at `assets/TEMPLATE2.png`, which is what `src/config/settings.js` references. The root-level `template.png` is an old copy.

- [ ] **A-07** Delete `TSNAS-BOLD.OTF` from the project root. The canonical copy is at `assets/TSNAS-BOLD.OTF`, which is what `src/config/settings.js` references. The root-level copy is a duplicate.

- [ ] **A-08** Delete `main.py` from the project root. This is a Python stub from the Replit workspace scaffold. The project has no Python runtime — `pyproject.toml` confirms it is an empty placeholder project.

- [ ] **A-09** Delete `pyproject.toml` from the project root. Same reason as A-08. It defines an empty Python project named `repl-nix-workspace`.

- [ ] **A-10** Delete `.replit` from the project root. This is the Replit platform configuration file. It has no function on VPS or Docker deployment and is already listed in `.gitignore` — it should not have been committed.

- [ ] **A-11** Delete `replit.md` from the project root. Replit-generated documentation file. Same reason as A-10.

- [ ] **A-12** Delete `replit.nix` from the project root. The Nix environment definition for Replit. The production environment is Dockerfile-based (Ubuntu/Node 18). Same reason as A-10.

- [ ] **A-13** Delete `claude.exe`, `specify.exe`, `uv.exe`, `uvw.exe`, `uvx.exe` from the project root. These are Windows developer tool binaries. They are not Node.js dependencies, not referenced by any script in `package.json`, and should never be committed to a repository.

- [ ] **A-14** Delete the `bin/` directory from the project root. It is empty and has no entry in `package.json`'s `bin` field.

- [ ] **A-15** Delete `logs/report.txt` from the project root's `logs/` directory. The `.gitignore` correctly excludes `logs/*.log` but `report.txt` slips through. Only `logs/.gitkeep` should be committed. Add `logs/report.txt` to `.gitignore` or delete it from the tracked files.

---

### Category B — Legacy Database File Cleanup

These files are superseded by their PostgreSQL equivalents. Verify no scripts reference them before deleting.

- [ ] **B-01** Delete `src/database/db.js`. This is the SQLite database client (`better-sqlite3`). It is superseded by `src/database/pg-client.js`. Verify no file has `require('./db')` or `require('../database/db')` before deleting. Current scan shows zero active references.

- [ ] **B-02** Delete `src/database/init.js` (if it exists — it is referenced in the old `package.json` start script but the file itself may be the original SQLite init). Confirm it is SQLite-based and not used by any npm script before deleting. The active init script is `src/database/init_saas.js`.

- [ ] **B-03** Delete `src/database/migrate_v2.js`. This is a SQLite migration that drops and recreates the `campaigns` table. It is completely superseded by `src/database/migrate_saas.js` (PostgreSQL). Running it accidentally would corrupt any SQLite remnant.

---

### Category C — Legacy Public Directory Cleanup

These files are from the single-page pre-EJS version of the app. They are served by `express.static` but are no longer linked from any active view.

- [ ] **C-01** Delete `public/client.js`. This was the Socket.IO client for the old single-page dashboard. It references `/login.html` for redirects and uses a `/auth/me` endpoint that still exists, but all dashboard socket logic is now handled inline in the EJS views (`src/views/dashboard/`). Confirm no EJS template has `<script src="/client.js">` before deleting.

- [ ] **C-02** Delete `public/create_campaign.html` and `public/create_campaign.js`. These are legacy single-page campaign creation files. The active campaign form is at `src/views/dashboard/campaign-form.ejs` served at `/campaigns/new`.

- [ ] **C-03** Delete `public/index.html`. The landing page is now served from the React build (`landing-autoinvite/dist/`) or falls back to `/login`. This HTML file is never reached.

- [ ] **C-04** Delete `public/login.html`. The active login page is the EJS template at `src/views/auth/login.ejs` served at the `/login` route. The static HTML file would only be served if a user navigated to `/login.html` directly.

- [ ] **C-05** Delete `public/landing.html` and `public/landing.css`. The landing page is handled entirely by the React build in `landing-autoinvite/`. These files are not referenced by any route.

- [ ] **C-06** Delete `public/template.csv` (the one at `public/template.csv`, not `public/assets/template.csv`). The `.gitignore` has `!public/assets/template.csv` as an exception, confirming `public/assets/template.csv` is the canonical location. The root-level `public/template.csv` is a stray duplicate.

- [ ] **C-07** Evaluate `public/video_excel.mp4`. This is a 1-minute tutorial video presumably shown on the landing or onboarding page. If it is actively linked from a view or the React landing page, keep it. If not, delete it — binary media files bloat the repository and should be served from object storage (S3/R2) in production.

---

### Category D — Legacy Source File Cleanup

- [ ] **D-01** Delete `src/index.js`. This is the original CLI entry point (interactive readline, `client.initialize()`). It creates a standalone WhatsApp client that would conflict with the `WhatsAppManager` pool. The `main` field in `package.json` points to `src/server.js`, not this file, but leaving it present creates confusion and a potential footgun if someone runs `node src/index.js` accidentally.

---

### Category E — Documentation Consolidation

These are operational/historical documents cluttering the root. They do not affect app behavior but reduce root-level clarity.

- [ ] **E-01** Move `DEPLOYMENT.md` to `docs/DEPLOYMENT.md`. Create the `docs/` directory if it does not exist. Add `docs/` to `.gitignore` if these docs are considered internal only, otherwise leave it tracked.

- [ ] **E-02** Move `DEPLOYMENT-GUIDE.md` to `docs/DEPLOYMENT-GUIDE.md`. Same reason as E-01. Having two deployment docs at the root with similar names is confusing.

- [ ] **E-03** Move `AutoInvite_Guide_AR.md` to `docs/AutoInvite_Guide_AR.md`. This is the Arabic user guide — useful content but belongs in `docs/`.

- [ ] **E-04** Move `ZERO-DAY-REPORT.md` to `docs/ZERO-DAY-REPORT.md`. This is an internal security/bug report. It should not be at the project root where it appears to be a primary entry point.

- [ ] **E-05** Move `verification-report.md` to `docs/verification-report.md`. This is the QA architecture review document. Same reason as E-04.

- [ ] **E-06** Move `deploy.sh.txt` to `scripts/deploy.sh` (remove the `.txt` extension). It is a shell script named with `.txt` so it cannot be executed directly. Move it to `scripts/` alongside `post-merge.sh` and make it executable (`chmod +x`).

- [ ] **E-07** Rename `CLAUDE.md.txt` to `CLAUDE.md`. The `.txt` extension prevents Claude Code from auto-detecting it as the project context file. This file is actively used and should follow the standard naming convention.

- [ ] **E-08** Rename `AGENTS.md` — evaluate whether this can be merged with `CLAUDE.md`. If both files contain AI agent instructions, having two separate files creates drift. Consolidate into `CLAUDE.md` unless `AGENTS.md` serves a different agent framework.

---

### Category F — Landing Page Internal Structure

These tasks apply inside `landing-autoinvite/` only. They do not affect the backend.

- [ ] **F-01** Create `landing-autoinvite/src/` directory and move all root-level `.tsx` files into it: `App.tsx`, `CTA.tsx`, `Comparison.tsx`, `FAQ.tsx`, `FeaturesBento.tsx`, `Footer.tsx`, `Hero.tsx`, `Timeline.tsx`, `main.tsx`, `index.css`. Update `index.html` to reference `./src/main.tsx` instead of `./main.tsx`. This is the standard Vite project structure.

- [ ] **F-02** Resolve the duplicate `Hero.tsx`. A `Hero.tsx` exists at `landing-autoinvite/Hero.tsx` and another at `landing-autoinvite/components/Hero.tsx`. Determine which is the active version (check imports in `App.tsx`) and delete the unused one.

- [ ] **F-03** Delete `landing-autoinvite/README.txt`. A `landing-autoinvite/README.md` already exists. The `.txt` version is a duplicate with a worse extension.

- [ ] **F-04** Delete `landing-autoinvite/metadata.json` if it is a Replit/scaffold artifact. Read its contents first — if it contains meaningful configuration, keep it. If it is an empty or auto-generated file, delete it.

---

### Category G — Critical Naming Fix (Breaking Bug)

This task fixes a silent bug where the landing page is never served correctly.

- [ ] **G-01** Resolve the `taqreerk` vs `landing-autoinvite` naming mismatch. In `src/server.js` lines 161-183, the landing page is expected at `../taqreerk/dist`. The actual directory is `landing-autoinvite/`. Also, `scripts/post-merge.sh` runs `cd taqreerk && npm install && npm run build` which would fail immediately.

  **Two valid options — pick one:**

  **Option 1 (rename the directory):** Rename `landing-autoinvite/` to `taqreerk/`. Update `package.json`'s `build:landing` script from `cd landing-autoinvite` to `cd taqreerk`. Update `.gitignore` from `landing-autoinvite/dist/` and `landing-autoinvite/node_modules/` to `taqreerk/dist/` and `taqreerk/node_modules/`. Fix `scripts/post-merge.sh` to use `taqreerk` (it already does). `server.js` requires no changes.

  **Option 2 (update server.js):** Keep the directory named `landing-autoinvite/`. Update `src/server.js` to reference `../landing-autoinvite/dist`. Fix `scripts/post-merge.sh` to use `cd landing-autoinvite`. Update `package.json`'s `build:landing` script (it already uses `landing-autoinvite`).

  Option 2 is safer because the directory name already matches the `package.json` build script and `.gitignore` entries. Only `server.js` and `post-merge.sh` need to change.

---

### Category H — .gitignore Gaps

- [ ] **H-01** Add `logs/report.txt` to `.gitignore`. The existing rule `logs/*.log` only excludes `.log` files. `report.txt` slips through. Add `logs/*.txt` or specifically `logs/report.txt`.

- [ ] **H-02** Add `*.exe` to `.gitignore` (or specifically list `claude.exe`, `specify.exe`, `uv.exe`, `uvw.exe`, `uvx.exe`). After deleting per A-13, ensure they cannot be re-committed accidentally.

- [ ] **H-03** Add `grid_test.png` and `grid_test.js` to `.gitignore` or delete them (A-02 covers deletion). If the grid test script is kept for occasional use, add `grid_test.*` to `.gitignore` so its output cannot be committed.

- [ ] **H-04** Verify `.agents/` is correctly excluded. The `.gitignore` lists `.agents/` but the directory `/.agents/agent_assets_metadata.toml` appears to be tracked. Run `git ls-files .agents/` to confirm. If tracked, run `git rm -r --cached .agents/` to untrack it.

- [ ] **H-05** Add `attached_assets/` to `.gitignore`. This directory contains AI-generated images and pasted text blobs from a design session. It is not referenced by any application code and should not be in source control.

---

### Category I — Recommended New Directories (Structure Only)

These are additions that would bring the project in line with Node.js SaaS conventions. No files are moved here — this is scaffolding for future work.

- [ ] **I-01** Create `docs/` directory with a `.gitkeep` file to hold the documentation files moved in Category E.

- [ ] **I-02** Add a `tests/` directory at the project root with a `.gitkeep`. Move `test_verify.js` here if you want to preserve it as a runnable smoke test (otherwise delete per A-03). Add a `"test"` npm script that runs `node tests/smoke.js` instead of the current `echo "Error: no test specified"`.

---

## DO NOT TOUCH

The following files and directories are sensitive, actively used, or have complex dependencies. Do not move, rename, or delete them without a full migration plan.

| Path | Reason |
|------|--------|
| `src/core/` | The WhatsApp engine. `WhatsAppManager.js`, `AntiBanEngine.js`, `BackgroundQueue.js`, `processBatch.js` are all in active production use with delicate inter-dependencies. Even small renames can break the `require('./core')` barrel import in `src/server.js` and `src/routes/campaigns.js`. |
| `src/database/pg-client.js` | The active PostgreSQL connection pool. Referenced in `server.js`, all route files, and all database scripts. |
| `src/database/init_saas.js` | The active schema init script. Referenced in `package.json`'s `db:init` script. |
| `src/database/migrate_saas.js` | The active migration script. Referenced in `package.json`'s `db:migrate` script and `scripts/post-merge.sh`. |
| `src/database/seed_admin.js` | Referenced in `package.json`'s `db:seed-admin` script. |
| `src/views/` | All EJS templates. Moving any file requires updating the `res.render()` or `res.renderPage()` calls in `src/server.js`. |
| `src/middleware/` | All middleware files are imported by name in `src/server.js` and route files. |
| `src/routes/` | All route files imported in `src/server.js`. |
| `src/config/` | `settings.js` contains absolute paths to `assets/`. `i18n.js` contains absolute paths to `src/locales/`. Moving either requires path updates. |
| `src/locales/` | i18n translation files. Path is hardcoded in `src/config/i18n.js`. |
| `assets/` | Template images and font file. Paths are hardcoded in `src/config/settings.js`. |
| `public/assets/` | Active static assets (fonts, images, template downloads). Served by `express.static` and referenced in EJS layouts. |
| `public/js/` | `campaign-editor.js` and `campaign-runner.js` are referenced from EJS views. |
| `public/style.css` | Referenced from EJS layouts. |
| `storage/` | Live tenant WhatsApp auth sessions and uploaded files. Moving this requires updating the `DATA_DIR` environment variable and `uploadStorage.js`. Never move while a campaign is running. |
| `.wwebjs_auth/` | Active Chromium session data for WPPConnect. Deleting this disconnects all live WhatsApp sessions. |
| `.wwebjs_cache/` | WPPConnect WhatsApp web version cache. Deleting forces a re-download but does not break sessions. Low risk but unnecessary disruption. |
| `.env` | Production secrets. Never commit, never move. |
| `.env.example` | The documented environment variable template. Keep at project root — this is the standard location. |
| `ecosystem.config.js` | PM2 process manager configuration. Keep at project root — PM2 expects it there by convention. |
| `nginx.conf` | Nginx reverse proxy configuration. Keep at project root for reference — it is manually copied to `/etc/nginx/sites-available/` on the VPS. |
| `Dockerfile` | Container build definition. Keep at project root — Docker requires it there. |
| `package.json` and `package-lock.json` | Node.js project manifests. Must stay at project root. |

---

## Execution Order

If you execute these tasks, do them in this sequence to minimize risk:

1. **Category A** — Pure deletions, no dependencies. Start here.
2. **Category H** — Update `.gitignore` before running `git add` after deletions.
3. **Category B** — Delete legacy database files after confirming no active references.
4. **Category C** — Delete legacy public files after confirming no EJS templates reference them.
5. **Category D** — Delete `src/index.js` after confirming no npm script calls it.
6. **Category E** — Move docs. Update any internal links between them afterward.
7. **Category G** — Fix the `taqreerk`/`landing-autoinvite` mismatch. Test that `npm start` serves the landing page after this change.
8. **Category F** — Restructure the landing page internals. Run `npm run build:landing` after moving files to confirm the Vite build still works.
9. **Category I** — Add new scaffold directories last.

After completing all tasks, run `node src/server.js` locally and verify:
- The server starts without errors
- `GET /` serves the landing page (or redirects to `/login` if the React build does not exist)
- `GET /login` renders the EJS login template
- `GET /dashboard` (with a valid session) renders the dashboard without 500 errors
