# Product Improvement Phase 2 Report - Backend

## 1. Objective

Implement the approved backend follow-up to the Phase 1 audit: durable AI
commentary, fuller historical context, safer recommendation approval, and
focused service extraction. Preserve existing scores, authorization rules,
scenario isolation, frontend styling, and user data. Do not start Phase 3.

## 2. Work completed

| Files | Purpose |
|---|---|
| `backend/app/models.py` | Add organization-scoped append-only commentary records linked to an existing result through a composite foreign key |
| `backend/migrations/versions/f64d81a2c039_analysis_explanations.py` | Add the commentary table/index without altering prior migration files |
| `backend/app/analysis_service.py` | Save/read commentary, audit saves in the same transaction, and capture historical descriptive context |
| `backend/app/services.py` | Centralize workspace/component/relationship assessment inputs |
| `backend/app/api.py` | Add saved-commentary GET, persist POST output, release transactions during inference, and reject stale recommendation approval |
| `backend/app/ai_service.py` | Send valid JSON context and clarify manual fallback errors |
| `backend/app/schemas.py` | Reject whitespace-only assessment reasoning and uncertainty |
| `backend/app/engine.py` | Preserve optional context in canonical snapshots and replay, without changing scoring or traversal |
| `backend/tests/test_ai_service.py` | Cover structured context, pending decisions, invalid output, and transport failures |
| `backend/tests/test_api.py` | Cover commentary persistence, regeneration, failure safety, tenant constraints, stale approvals, and snapshot context |
| `backend/tests/test_engine.py` | Explicitly test replay of both legacy and enriched snapshot formats |
| `backend/tests/test_migrations.py` | Test migration round-trip, schema drift, preserved seed records, and offline PostgreSQL DDL |
| `docs/api/openapi.json` | Regenerate the API contract |
| `README.md`, `docs/api/README.md`, `docs/architecture/engine.md` | Document setup, API behavior, formula, and limitations; remove the broken handoff reference |
| `docs/progress.md`, this report | Record evidence and the next approval boundary |

No frontend code, dependencies, CI/CD, authentication configuration, existing
database, or previous migration was modified.

### Delivered behavior

- Successful commentary generation saves model text, exact supplied context,
  originating run hash, author, and UTC creation time. Regeneration appends;
  it does not overwrite prior responses or change the immutable input snapshot.
- `GET /api/v1/analysis-runs/{run_id}/ai-explanation?entity_id=<UUID>` returns
  the latest saved response without contacting Ollama. Missing saved commentary
  returns 404. The compatible response contains `model` and `explanation`.
- Failed inference saves no response or success audit, and cannot erase a prior
  response. Expected model errors return 502 or 503, not fabricated output.
- Recommendations include workspace and component context, direction,
  relationship, reasoning, uncertainty, and a pending human decision.
- Reassessment/rejection preserve an existing effective approved weight.
  New draft edges still require explicit approval or manual override.
- Approval checks both the dependency timestamp and the captured input context.
  Source, target, or workspace changes require reassessment. Manual override
  remains available without Ollama.
- New canonical snapshots preserve workspace details, event description/duration,
  component descriptions/metadata, and assessment decisions. Descriptive context
  is hashed but is not a new impact-scoring factor. Legacy snapshots keep their
  old canonical shape when replayed; missing history is not fabricated/backfilled.

## 3. Decisions

- No scoring formula, attenuation, cycle handling, aggregation, temporal default,
  review-confidence mapping, or role-permission matrix was changed.
- The commentary POST retains its existing `event:read` permission and now saves
  its generated output with an audit record. GET uses the same scoped result
  lookup; no new membership or role-management mechanism was introduced.
- Use one additive migration and existing SQLAlchemy, Pydantic, httpx, and
  NetworkX dependencies. No new runtime package or infrastructure was needed.
- Preserve effective weights independently of pending recommendations. Pending
  assessments created before context capture must be reassessed before approval.
- Broad router decomposition, frontend integration, and installation-default
  cleanup are not silently included in this phase.

## 4. Verification performed

Commands below run from the named project directory; backend execution used
`uv run --directory <workspace>/backend --locked ...` where appropriate.

| Directory | Command/check | Result | Evidence |
|---|---|---|---|
| backend | `uv run --locked pytest -q --tb=short` | PASS | 113 passed |
| frontend | `npm test -- --pool=forks --maxWorkers=1` | PASS | 11 passed across 4 files |
| frontend | `npm run build` | PASS | TypeScript and Vite production output succeeded |
| backend | `uv run --locked ruff check app tests scripts migrations/versions/f64d81a2c039_analysis_explanations.py` | PASS | All checks passed |
| backend | `uv run --locked ruff format --check app tests scripts migrations` | PASS | 28 files already formatted |
| backend | `uv run --locked python -m scripts.export_openapi` | PASS | Contract regenerated; snapshot comparison passes in full tests |
| backend | Fresh SQLite upgrade, schema drift check, downgrade to `e52c93d6b018`, re-upgrade and drift check | PASS | Executed inside the migration test against a temporary database; existing seeded entity count preserved |
| backend | PostgreSQL offline migration chain generation | PASS, offline only | Test generated commentary DDL and composite result FK; no PostgreSQL connection |
| editor | Diagnostics for changed application files and primary tests | PASS | No errors reported |
| repository | `git diff --check` | PASS | No whitespace errors after implementation/setup documentation |
| loopback | `curl.exe --max-time 5 --silent --show-error http://127.0.0.1:11434/api/tags` | FAIL | Connection refused; genuine inference unavailable |

Tests were added before the corresponding fixes. Initial regressions exposed
missing GET/persistence, missing workspace context, missing snapshot context,
non-JSON assessment input, and accepted whitespace-only text. Intermediate
missing-import/test-syntax/line-length errors and an outdated OpenAPI snapshot
were repaired and the affected checks rerun; they are not final test failures.

## 5. Test results

- Backend: 113 passed, 0 failed, 0 skipped.
- Frontend: 11 passed, 0 failed, 0 skipped.
- Coverage: not measured. No benchmark or performance guarantee is claimed.
- Commentary persistence was verified across connection-pool disposal and new
  sessions, not an operating-system/database-process restart.
- Genuine Ollama quality, live Chrome acceptance, and live PostgreSQL behavior
  were not verified in this phase.

## 6. Security and data integrity

- Existing role, tenant, audit, scenario, and snapshot tests remain green.
- New commentary uses a composite organization/run/entity foreign key to an
  existing result. A cross-tenant database insert is rejected, and foreign API
  reads/generation return 404.
- Commentary and its audit row share a transaction; generation failure creates
  neither. No ordinary update/delete endpoint exposes commentary mutation.
- Inference runs without an open database transaction; persistence then checks
  the scoped run/result again. Assessment freshness checks do not constitute a
  PostgreSQL concurrent-write stress test.
- Existing SQLite files were not migrated, seeded, reset, or used for test data.
- No credentials/environment files were read; no remote Git operation, cloud
  action, dependency audit, container scan, or secret scan was performed.

## 7. Evidence integrity

Model-facing tests use explicit mock transports/adapters, not real inference.
The saved test strings are test fixtures and are not user-facing AI evidence.
No screenshots, usability findings, paid AI calls, cloud deployment, or live
PostgreSQL claims were produced. Human UX evidence remains TODO(human).

## 8. Deviations and blockers

- Local Ollama is unreachable. Start Ollama and install/select `qwen2.5:3b`
  before genuine integration acceptance; no model download was attempted.
- Saved-commentary retrieval is implemented in the backend but is not yet wired
  into the active frontend. The frontend still clears its in-memory commentary
  when a run is opened; do not claim that UI history issue is fixed yet.
- The latest-record GET does not expose a list of older generations, although
  those records remain stored. Legacy history cannot regain omitted context.
- Audit baseline failures remain: full-scope Ruff includes 12 findings in the
  historical initial migration; ordinary frontend Prettier flags 24 checkout
  line-ending differences. No checks were disabled or thresholds weakened.
- Existing brief/code conflicts remain explicit: live `as_of` defaults to now,
  expiry is exclusive, and the live service deactivates zero-weight edges.
  Human resolution is required before changing those semantics.
- Frontend pagination/graph polish and Compose's demo-seeding default remain
  open work, not completed backend features.

## 9. Progress file

`docs/progress.md` records Phase 2 approval, changes, commands/results, branch
`project`, blockers, and Phase 3 awaiting explicit approval. Historical evidence
and the Phase 1 audit are preserved. No commit was created.

## 10. Human review required

- Review the commentary schema, approval lifecycle, and additive migration.
- Back up any existing development database, then run `uv run alembic upgrade head`
  from `backend` before using this updated backend against it. This session did
  not migrate that database.
- Approve Phase 3 frontend work: complete pagination, load saved commentary into
  history, improve active graph role distinctions, and preserve blue/ripple styling.
- Resolve the documented temporal and zero-weight brief conflicts separately.

## 11. Phase exit assessment

YES for the scoped backend implementation and automated verification. Overall
application acceptance remains incomplete: genuine AI/browser integration,
frontend improvements, installation defaults, existing quality failures, and
live PostgreSQL verification remain open. Stop here pending explicit Phase 3
approval; do not start UI implementation or CI/CD work automatically.