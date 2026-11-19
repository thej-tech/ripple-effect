# Product Improvement Phase 5 Report - Final Polish

## 1. Objective

Complete the five-phase improvement plan: resolve remaining quality-gate
failures, make fresh installations start empty, fix observed UI defects, and
reconcile documentation. Preserve the blue theme, ripple background, scoring,
authorization, migrations, and user data. Phase 5 was explicitly approved.

## 2. Phase 5 work completed

| File/area | Change |
|---|---|
| `.gitattributes` | Frontend files use LF, matching Prettier and preventing Windows checkout failures |
| 18 frontend config/source files | Line-ending normalization only; Git reports no content diff |
| `backend/migrations/versions/b4fceea3f1e2_initial_data_foundation.py` | Style-only lint fixes; offline PostgreSQL DDL is byte-for-byte identical |
| `docker-compose.yml`, `.env.example`, `infra/phase10/kubernetes.yaml` | Demo seeding is opt-in (`SEED_DEMO_DATA=false` by default); Azure was already false |
| `frontend/src/App.tsx` | Builder lays out unsaved components left to right by cycle-safe dependency level with left/right handles; saved positions remain authoritative. History graph fits after every node is measured and on width changes |
| `frontend/src/styles.css` | Role-legend classes no longer inherit unrelated legend colours |
| `frontend/src/App.test.tsx`, `frontend/src/test/setup.ts`, `frontend/e2e/workflow.spec.ts` | Builder layout and cycle regression, jsdom `ResizeObserver` stub, initial desktop framing check |
| `README.md`, `docs/viva-notes.md`, architecture/runbook docs | Current verification commands, seeding defaults, and active component architecture |

## 3. Final deliverable summary

### Architectural changes across the improvement plan

- Generated AI commentary is stored in a separate, tenant-constrained,
  append-only `analysis_explanations` table with same-transaction audit records.
  It can be retrieved without Ollama and never mutates run inputs or scores.
- Assessment context is built in the service layer. It includes workspace,
  component, direction, and relationship details. Approval is rejected when
  that context has changed.
- Reassessment and rejection preserve existing effective approved weights.
- New run snapshots retain descriptive and assessment context. Context is hashed
  but excluded from scoring; legacy snapshots replay unchanged.
- The frontend loads every collection page and fails visibly on invalid paging.
- Commentary requests are concise, focused on the selected saved result, and
  grounded in named immutable triggers. The 90-second deadline was not raised.

### Features completed

- Empty fresh install; users create workspaces, components, and directed
  dependencies through the UI.
- Genuine local Qwen weight recommendations with reasoning, confidence,
  uncertainty, assumptions, and missing information.
- Explicit approval, rejection, and manual override; AI unavailability leaves
  approved weights intact and manual entry available.
- Event creation and deterministic NetworkX analysis with direct and indirect
  propagation, paths, weights, and cycle-safe bounds.
- Readable propagation graph with role text and borders, node selection linked
  to details, weight labels, zoom/fit controls, and mobile vertical layout.
- History reopens immutable saved runs and saved commentary after refresh and
  API restart, including with Ollama stopped.

### Features still incomplete or unreachable

- Production identity provider and authentication adapter.
- Scenario comparison exists in the backend and tested `ScenarioWorkspace.tsx`,
  but the active app does not mount it. `ImpactGraph.tsx` and `demoData.ts` are
  likewise unmounted; they were not deleted without approval.
- Generated commentary history exposes only the latest response per result.
- Live PostgreSQL, concurrency, and production deployment are unverified.
- The current Nginx/Compose frontend has no identity-entry or injection path,
  so local authentication is supplied by the Vite development proxy.

## 4. Setup

Backend (from `backend`):

```powershell
uv sync --locked
$env:APP_ENV = 'development'
$env:ENABLE_LOCAL_AUTH = 'true'
$env:DATABASE_URL = 'sqlite:///./ripple-local.sqlite3'
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_MODEL = 'qwen2.5:3b'
uv run alembic upgrade head
uv run python -m app.local_account
uv run uvicorn app.main:app --host 127.0.0.1 --port 8020
```

Frontend (from `frontend`):

```powershell
npm ci
$env:RIPPLE_LOCAL_USER_ID = '<UUID printed by app.local_account>'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:8020'
npm run dev -- --host 127.0.0.1 --port 5180 --strictPort
```

Back up existing databases before migrating them.

Ollama: install or start Ollama, then run `ollama pull qwen2.5:3b`. The
workspace-local, checksum-verified alternative is documented in
[the portable runbook](../runbooks/local-ollama-portable.md). The model uses the
Qwen Research License for non-commercial research/evaluation.

### Environment variables

| Variable | Purpose |
|---|---|
| `APP_ENV` | `development` or `test` enables local-only features |
| `ENABLE_LOCAL_AUTH` | `true` enables the development identity header; never production |
| `DATABASE_URL` | SQLite or PostgreSQL SQLAlchemy URL |
| `OLLAMA_BASE_URL` | Local Ollama URL, default `http://localhost:11434` |
| `OLLAMA_MODEL` | Model name, default `qwen2.5:3b` |
| `SEED_DEMO_DATA` | Container entrypoint opt-in for synthetic fixtures; default `false` |
| `RIPPLE_LOCAL_USER_ID` | Vite proxy development identity |
| `VITE_API_PROXY_TARGET` | Vite proxy API target |
| `VITE_API_BASE_URL` | Optional API origin; same-origin by default |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Local Compose database values |
| `RIPPLE_RUN_LIVE_E2E`, `RIPPLE_E2E_URL`, `RIPPLE_E2E_MANUAL`, `PLAYWRIGHT_USE_CHROME`, `RIPPLE_PERSISTENCE_BASELINE`, `RIPPLE_VERIFY_RESTART` | Live browser acceptance controls |

## 5. Verification performed

| Check | Result |
|---|---|
| Backend `pytest -q --tb=short` | PASS, 114 passed |
| Backend `ruff check app tests scripts migrations` | PASS, full scope including historical migration |
| Backend `ruff format --check app tests scripts migrations` | PASS, 28 files |
| Offline PostgreSQL DDL before/after migration style edit | PASS, identical |
| Frontend `npm test` | PASS, 20 passed |
| Frontend `npm run lint` | PASS |
| Frontend `npm run format:check` | PASS, full repository scope |
| Frontend `npm run build` | PASS |
| Fresh Phase 5 genuine-Qwen Chrome journey | PASS; weights 1.0 and 0.5 approved, 72.0 direct and 28.8 indirect |
| Initial-desktop and resize framing regression | PASS |
| API restart persistence on the Phase 5 run | PASS, zero inference requests |
| Graph fit latency after render | 46-139 ms; earlier delay was API loading |
| `docker compose config` | NOT RUN, Docker CLI unavailable in this shell |
| Standalone E2E TypeScript check | NOT RUN, `@types/node` not installed |

Mobile and desktop screenshots were inspected with no page errors or horizontal
overflow. The 18 normalized files appear modified in `git status` because the
line-ending attribute changed, but `git diff` reports no content changes.

## 6. Security and data integrity

No authorization, tenant scope, scoring, timeout, dependency, or schema behavior
changed in this phase. Original databases were not migrated, reset, or seeded.
Acceptance used new isolated SQLite files under ignored `backend/.venv/`. No
remote Git action, cloud resource, deployment, paid AI service, or secret access
occurred.

## 7. Known limitations

- CPU-only inference on this machine takes about 50 seconds per assessment and
  about 3 minutes for the complete genuine browser workflow.
- The 3B model can produce imperfect wording; commentary requires human review.
- The brief/code differences remain unresolved: live `as_of` defaults to the
  current time, validity ends are exclusive, and zero-weight edges are disabled.
- Human UX research, Figma prototyping, and usability results remain TODO(human).
- CI/CD and cloud delivery were outside this improvement priority.

## 8. Human review required

- Review the preview at `http://127.0.0.1:5195`; it contains acceptance data only.
- Decide whether to mount scenario comparison or remove unused components.
- Confirm Qwen licence suitability and the three outstanding semantic decisions.
- Review and commit the working-tree changes; no commit or branch was created.

## 9. Phase exit assessment

YES. The planned audit, backend, frontend, integration, and polish phases are
complete with passing quality gates and genuine local AI evidence. Production
readiness still depends on the limitations listed above.
