# Product Improvement Phase 1 Report - Audit

## 1. Objective

Audit the existing user-driven product against the new development instructions.
Preserve working functionality, the blue visual identity, ripple background,
tenant boundaries, and deterministic scoring. This phase does not implement
backend or frontend improvements or change CI/CD.

## 2. Work completed

- Inspected the README, combined build brief, operating instructions, progress
  notes, frontend entry point and API client, backend routes, models, services,
  engine, AI service, database configuration, tests, and local delivery settings.
- Restored dependencies from the existing npm and uv lockfiles. No dependencies
  were added or upgraded. uv selected Python 3.14.7 for the local environment.
- Created this report and updated the progress log. Application source, styles,
  migrations, configuration, and the existing SQLite database were not edited.
- Initial Git status: clean working tree on `project`.

### Existing implementation

- The active frontend provides Dashboard, System Builder, Impact Analysis, and
  History. Workspace creation, component editing/archival, graph connections,
  dependency editing, weight decisions, event creation, runs, and history use
  the typed API client rather than synthetic runtime results.
- FastAPI provides workspace/dashboard routes, entity/dependency/event/trigger
  CRUD, assessment and decision routes, analysis/results/paths, and scenarios.
  Domain services and repositories exist, although newer workspace and
  assessment operations still contain business/database logic in the router.
- SQLAlchemy models include organization-scoped references, relationship
  uniqueness and range constraints. Alembic migrations construct the schema.
- Ollama requests use asynchronous HTTP, a structured assessment schema, output
  validation, timeout/error handling, explicit pending recommendations, and
  separate effective dependency weights. Manual override is available.
- The pure NetworkX engine uses sorted simple-path traversal, per-path cycle
  avoidance, bounded depth/path/node counts, deterministic tie-breaking, max or
  capped-sum aggregation, review-quality confidence, and explicit limit status.
- Runs persist canonical inputs, a hash, algorithm/configuration, results, paths,
  and deterministic explanations. Replay and isolation have automated tests.

### Actual scoring

For a trigger and a path with k edges, the engine computes:

```text
trigger_score = severity * trigger_exposure * (1 - trigger_mitigation)
path_score = trigger_score * product(weight_i * attenuation * (1 - mitigation_i))
```

Severity and output scores are on 0-100 scales; weights, attenuation, exposure,
and mitigation are on 0-1 scales. Default attenuation is 0.8. The engine uses
the event-trigger association's exposure. Entity exposure is snapshotted but
is not an additional multiplier in this formula. Max selects the best path;
capped sum selects the best path per distinct final edge and caps at 100.
Scores are estimates, not probabilities. Confidence is the weakest dependency
review status on the primary path, not AI certainty or outcome likelihood.

### Gaps, ordered for follow-up

1. **Incomplete collection loading.** `loadData` in `frontend/src/App.tsx` takes
   only the first page of entities, dependencies, events, and runs. The client
   requests 100 items per page. `openRun` paginates results but not each result's
   paths. Larger systems/history can therefore be silently incomplete in the UI.
2. **AI commentary is not persistent.** The explanation endpoint returns model
   output without saving it; the frontend holds one explanation in memory and
   clears it when opening a run. Deterministic engine explanations are stored,
   but generated commentary cannot currently be revisited as originally shown.
3. **Snapshot context is narrower than the new acceptance criteria.** Canonical
   snapshots retain calculation inputs and approved numeric weights but not
   dependency assessment reasoning/decisions or component/event descriptions.
   Generated commentary has no persisted record linked to the snapshot.
4. **Clean-install conflict in Compose.** `docker-compose.yml` explicitly enables
   `SEED_DEMO_DATA`. The README's local-account workflow creates no workspaces,
   but the Compose path still preloads illustrative data. Do not delete existing
   user/demo databases while correcting installation defaults.
5. **Assessment context and approval lifecycle need strengthening.** Assessment
   context contains both components and the relationship, but not workspace name
   or description. Concurrent edits during inference are checked; approval does
   not re-check a saved fingerprint of the component/workspace assessment inputs.
   Reassessment also changes a validated edge to draft, so pending versus
   effective approval semantics need an explicit, tested treatment.
6. **Graph UX is not fully integrated.** The active `AnalysisResults` renders its
   own graph in a four-column grid, styles nodes by impact band, and labels edges
   with weights. Direct/indirect labels exist in result summaries, but the graph
   itself does not distinguish those roles explicitly. The richer `ImpactGraph`
   component is not imported by the active app; its passing tests do not prove
   the active analysis graph has those capabilities.
7. **Backend modularity remains uneven.** Workspace/dashboard, assessment, and
   convenience trigger workflows include orchestration and queries in `api.py`.
   Improve these incrementally behind unchanged contracts, not by a broad rewrite.
8. **Verification gaps.** Component tests cover dashboard/workspace basics; the
   live Playwright journey is opt-in. The standalone AI service tests cover chat
   transport failures, while assessment decisions use mocked model output in API
   tests. Add focused assessment-validation, pagination, stale-approval, saved AI
   history, and active graph tests before claiming those improvements complete.
9. **Documentation and checks need reconciliation.** The README links to absent
   `CONTINUATION_HANDOFF.md`; the engine architecture page still says the engine
   is unimplemented; progress/viva notes mix old and newer phase evidence.
   Required frontend formatting and full-scope backend lint are not currently green.

## 3. Decisions

- Execute the new five-phase improvement sequence one phase at a time; stop
  after this audit for approval before Phase 2 backend implementation.
- Preserve scoring, authentication/authorization, migrations, design language,
  and working features during the audit. No new ADR or runtime package was added.
- Resolve the existing brief/code conflicts before changing temporal or zero-weight
  semantics: live analysis defaults `as_of` to now rather than event start;
  validity ends are exclusive rather than inclusive; the live service disables
  zero-weight dependencies while the engine can retain zero-impact paths.
- New persistence must use an additive migration and same-transaction audit
  records. No schema change is implemented in this phase.

## 4. Verification performed

Commands below use the indicated working directory.

| Directory | Command/check | Result | Evidence |
|---|---|---|---|
| frontend | `npm ci --no-fund --no-audit` | PASS | 273 packages installed from lockfile |
| backend | `uv sync --locked` | PASS | Locked environment created; Python 3.14.7 |
| backend | `uv run --locked pytest -q` | PASS | 95 passed |
| frontend | `npm test -- --pool=forks --maxWorkers=1` | PASS | 11 passed across 4 files |
| frontend | `npm run typecheck` | PASS | TypeScript completed |
| frontend | `npm run lint` | PASS | ESLint completed |
| frontend | `npm run format:check` | FAIL | 24 files flagged |
| frontend | `npm run format:check -- --end-of-line auto` | PASS, diagnostic only | Confirms checkout line-ending differences; does not replace the required check |
| frontend | `npm run build` | PASS | Vite production output built |
| backend | `uv run --locked ruff check app tests scripts migrations` | FAIL | 12 findings, all in the initial migration |
| backend | `uv run --locked ruff format --check app tests scripts migrations` | PASS | 27 files already formatted |
| repository | `curl.exe --max-time 5 --silent --show-error http://127.0.0.1:11434/api/tags` | FAIL | Connection refused; no reachable Ollama server |
| local services | Live AI/browser acceptance, application restart, PostgreSQL | NOT RUN | No prepared isolated stack; Ollama unavailable; prior evidence not reused as a current pass |

Initial commands from the wrong directory could not locate the backend virtual
environment or import `app`. Frontend testing via a lowercase-drive absolute npm
prefix also failed suite setup; testing from the canonical frontend directory
passed. These invocation failures are not counted as application test failures.

## 5. Test results

- Backend: 95 passed, 0 failed, 0 skipped.
- Frontend: 11 passed, 0 failed, 0 skipped in the successful canonical run.
- Coverage: not measured. Live Playwright and real model inference: not run.
- SQLite API/migration tests passed; database process restart and live PostgreSQL
  compatibility were not verified in this session.

## 6. Security and data integrity

- Existing tenancy, role, audit, scenario isolation, and snapshot tests passed as
  part of the backend suite. No authorization behavior was changed.
- No existing database was migrated, seeded, reset, or queried for user content.
- No secrets or environment files were read. No remote Git operation, cloud action,
  secret scan, dependency audit, or container scan was performed.
- Production identity remains outside the local development authentication path;
  passing local tests does not establish production authentication readiness.

## 7. Evidence integrity

Evidence consists of source inspection and the command results above. Historical
AI scores, browser journeys, cloud/container claims, and test counts from older
documents are not claimed as newly verified. Human UX research remains TODO(human).
Visual responsiveness, genuine model quality, and restart behavior remain unverified.

## 8. Deviations and blockers

- Formatting/lint failures are baseline issues, not suppressed or auto-fixed.
- Local Ollama is unreachable. Start it with the configured model before the live
  integration phase; do not substitute fake assessments for acceptance evidence.
- No runtime rewrite or UI redesign was undertaken. There is no implementation
  deviation authorized by this report.

## 9. Progress file

`docs/progress.md` records this audit, baseline commands/results, current branch,
open gaps, next phase, and approval boundary. Older evidence remains historical.

## 10. Human review required

- Approve Phase 2 backend work, prioritizing saved AI history, snapshot context,
  assessment input freshness, and small service extractions with regression tests.
- Resolve event-time, inclusive expiry, and zero-weight semantics against the
  original brief before altering the engine or replay behavior.
- Later frontend work should handle all pages, integrate clearer propagation
  roles, preserve the blue/ripple styling, and correct empty-install defaults.

## 11. Phase exit assessment

PARTIAL: the audit and executable baseline are complete, but live AI/browser and
restart/PostgreSQL checks remain unverified, and the identified quality failures
remain open. The product is not declared ready. Stop here pending explicit
approval for Phase 2; no major implementation work has begun.