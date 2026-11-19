# Product Improvement Phase 4 Report - Integration

## 1. Objective

Verify genuine local AI assessment, explicit human weight approval, deterministic
analysis, saved AI commentary, immutable history, failure handling, and exact
persistence across a real API/embedded-SQLite restart. Preserve the original blue
visual identity, scoring, authorization, migrations, and existing user data.

Phase 4 was explicitly approved. The human then authorized downloading the
portable Ollama runtime and `qwen2.5:3b` into ignored workspace storage. Phase 5
is not authorized by this report.

## 2. Work completed

| File/area | Purpose |
|---|---|
| `frontend/e2e/workflow.spec.ts` | Genuine assessment/approval, saved-commentary reopening, immutable history after live edits, no-inference history checks, baseline capture, offline-assessment safety, and post-restart comparison |
| `backend/app/ai_service.py` | Concise commentary request (at most 90 words, 224-token ceiling), selected-result focus, named-trigger grounding, and feasibility wording for unrecorded failover options |
| `backend/app/api.py` | Commentary context now uses named immutable trigger entities from the run snapshot and omits duplicated engine prose and competing neighboring summaries |
| `backend/tests/test_ai_service.py`, `backend/tests/test_api.py` | Regressions for concise prompting, safeguards, selected-result focus, named-trigger context, and persistence/tenancy |
| `docs/runbooks/local-ollama-portable.md`, `README.md` | Official portable Windows setup, checksum, isolated storage, cloud-disabled loopback runtime, and model licence notes |
| `docs/progress.md`, this report | Evidence, limitations, and approval boundary |

No runtime Python/npm dependency, schema, scoring formula, authorization rule,
timeout, original database, CI/CD, or cloud configuration was changed.

## 3. Decisions

- Install no system service, PATH entry, Windows setting, paid API, or project
  package. The verified portable runtime and model stay under ignored
  `backend/.venv/` storage.
- Retain the existing 90-second Ollama deadline. The first genuine commentary
  attempt reached it on this CPU-only machine; the fix reduced generation scope
  instead of hiding the failure with a longer timeout.
- Keep commentary separate from scoring. It is generated from immutable run
  inputs and persisted results, then saved separately and labelled for human review.
- Treat reviewed real-model output as test evidence. A passing run that contained
  a factual trigger-source error was not accepted as the final result.
- Ollama uses MIT terms. The 3B Qwen model uses the Qwen Research License for
  non-commercial research/evaluation; commercial use or redistribution requires
  review and may need a separate licence.

## 4. Verification performed

Frontend commands run from `frontend`; backend commands use
`uv run --directory <workspace>/backend --locked ...`.

| Check | Result | Evidence |
|---|---|---|
| Official v0.40.16 portable archive | PASS | 1,618,244,995 bytes; SHA-256 `50fcf5ad54277f2fa5d173ebfc93bcb017adbc0c9ef2314daabc96ca9e6aa64e` matched |
| Runtime binding/configuration | PASS | `/api/version` returned 0.40.16; listener was `127.0.0.1:11434`; cloud disabled in the process environment |
| Model pull and identity | PASS | `qwen2.5:3b`, 1,929,912,432 bytes, digest `357c53fb659c5076de1d65ccb0b397446227b71a42be9d1603d46168015c9e4b`, Q4_K_M |
| Direct local generation | PASS | Returned `READY` in about 9.5 seconds, CPU-only |
| First genuine browser attempt | FAIL, retained | Two assessments returned HTTP 200 in 49.36s and 55.36s; commentary returned HTTP 500 at 1m30s |
| Concise-commentary API retry | PASS with review finding | Real response in 54.74s, but mislabeled a neighboring impact band; selected-result focus was then added |
| Second genuine browser run | PASS with review finding | Persistence passed, but saved text incorrectly named Backend API as trigger |
| Final fresh genuine browser run | PASS | 2 passed, 2 intentional stage skips: genuine journey and responsive history |
| Final saved commentary review | PASS | Names Database as trigger, retains selected band, and frames failover as a feasibility review |
| Final API restart with Ollama stopped | PASS | Exact snapshot/hash, results, approved dependencies, History, and saved commentary restored; zero inference POSTs |
| Backend `pytest -q --tb=short` | PASS | 114 passed |
| Backend Ruff application/tests/scripts/new migration | PASS | All checks passed |
| Backend `ruff format --check app tests scripts migrations` | PASS | 28 files already formatted |
| Frontend tests | PASS | 19 passed |
| Frontend `npm run lint` | PASS | ESLint passed |
| Frontend `npm run build` | PASS | TypeScript and Vite production build succeeded |

Earlier manual-mode checks remain valid evidence for their scope: the offline
assessment case passed, a live component rename did not alter the run snapshot,
and manual-weight history survived an API restart. They are not substituted for
the genuine-AI evidence above.

## 5. Test and model results

- Final genuine run: Database, Backend API, and Frontend Application were created
  through the UI. Ollama recommended weights 1.0 and 0.5; the test explicitly
  approved them. Severity 90 then produced 72.0 direct and 28.8 indirect impact.
- Assessment reasons stated the single-database chain and missing fallback, and
  flagged uncertainty about unlisted sources and mitigation effectiveness.
- Final saved commentary:

  > Actual Impact: Moderate
  >
  > Propagation Reason: The Database Outage triggered by the Database itself has
  > a moderate impact on the Frontend Application.
  >
  > Possible Improvements: Evaluate the feasibility of implementing a failover
  > strategy with human review, considering unknown availability and conflicting
  > information.

- The text is useful but somewhat repetitive; it is model-generated commentary,
  not a factual guarantee or a replacement for the deterministic explanation.
- Coverage, performance, accessibility, and model quality are not benchmarked.

## 6. Security and data integrity

- Original databases were not migrated, reset, seeded, or modified.
- Fresh files `phase4-genuine-ai-20261119-1/2/3.sqlite3` were initialized only
  with schema and a local development account. Workspaces and graph records were
  created through the browser. Earlier failed and passing evidence was preserved.
- Ollama was loopback-only and cloud-disabled. Runtime home/model/temp paths were
  workspace-local. No keys or full server logs were displayed or committed.
- API authorization, tenant isolation, audit behavior, and scoring are unchanged;
  the complete backend suite passed.
- No paid AI service, remote Git action, cloud resource, deployment, or system
  installation was performed. Preview processes were stopped only when they were
  started by this session.

## 7. Evidence integrity

The genuine runs used the downloaded local model and actual browser/API calls.
Mocks remain limited to unit/API tests. The first timeout failure and two reviewed
quality failures are recorded rather than removed.

Local evidence and runtime data are under ignored `backend/.venv/`, including
`phase4-genuine-final-baseline.json`. They are local acceptance artifacts, not
committed fixtures, CI results, production readiness claims, or UX research.

## 8. Remaining limitations

- Inference is slow on this 7.74 GB RAM, CPU-only machine; genuine workflow
  acceptance took about 2.6 minutes. Faster hardware or a smaller model would
  change performance but must be validated rather than assumed.
- The 3B model can still produce imperfect wording. Human review remains required.
- Ordinary frontend formatting still reports the 18 untouched baseline files;
  historical initial-migration lint findings, Compose demo-seeding defaults,
  production identity, live PostgreSQL, and brief semantic conflicts remain open.
- Optional standalone E2E TypeScript checking still lacks `@types/node`.

## 9. Progress file

`docs/progress.md` records Phase 4 completion, branch `project`, the authorized
runtime/model download, real-model and restart results, preview state, open
limitations, and Phase 5 awaiting approval. No branch or commit was created.

## 10. Human review required

- Review the persisted model reasoning and commentary in the local preview.
- Confirm that the Qwen Research License is acceptable for the intended project use.
- Approve Phase 5 final polish before any further changes.

The preview is `http://127.0.0.1:5195`, backed by isolated
`phase4-genuine-ai-20261119-3.sqlite3`; its Ollama service is loopback-only.

## 11. Phase exit assessment

YES. Genuine local Qwen recommendations, explicit approval, deterministic
analysis, generated-commentary persistence, refresh, and offline history after an
actual API restart are verified on fresh isolated data. Product-wide readiness is
still subject to Phase 5 polish and the limitations above. Stop here pending
explicit Phase 5 approval.
