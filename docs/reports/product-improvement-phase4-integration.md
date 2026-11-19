# Product Improvement Phase 4 Report - Integration (Partial)

## 1. Objective

Verify genuine Ollama assessment/approval/commentary history, immutable results,
failure handling, and persistence across a real application restart. Preserve
existing styling, scoring, authorization, migrations, and original data. Phase 4
was explicitly approved; Phase 5 is not authorized by this report.

## 2. Work completed

- Extended `frontend/e2e/workflow.spec.ts` to compare exact saved commentary after
  reopening and refresh in the genuine-AI branch, and to assert that reopening
  does not send an inference POST. This branch is added but remains unexecuted
  against a genuine model because the local runtime is unavailable.
- Added a live-component rename after analysis and verified the historical
  snapshot remains unchanged. The history graph retains the saved names.
- Added optional `RIPPLE_PERSISTENCE_BASELINE` evidence capture under the ignored
  backend virtual environment, and an opt-in `RIPPLE_VERIFY_RESTART=1` read-only
  verification stage for use after an externally performed API restart.
- Added an actual unavailable-assessment browser check: the approved dependency
  record stays unchanged, no approval button appears, and manual input remains
  enabled. The unsaved manual input in this check does not alter baseline data.
- Updated README restart instructions, progress notes, and this report.
- No production application source, dependency, schema, auth, scoring, or CI/CD
  change was needed or made in this phase.

## 3. Decisions

- Use a separate loopback Phase 4 stack and fresh SQLite file. Do not disturb the
  Phase 3 preview or the original database.
- Keep manual-mode evidence explicitly separate from genuine inference. No
  mocked model service was introduced to make live acceptance appear complete.
- Do not install Ollama, download a model, add a paid service, or weaken checks
  without the necessary approval/prerequisite setup.
- The live test accepts recommendation values in the API's existing inclusive
  0-1 range; production numerical rules were not changed.
- Keep Phase 4 PARTIAL rather than advance while its genuine-AI criteria are unmet.

## 4. Verification performed

Frontend commands run from `frontend`; backend tests use uv's explicit backend
working directory. The dedicated UI/API were `127.0.0.1:5194` / `127.0.0.1:8034`.

| Check/command | Result | Evidence |
|---|---|---|
| `GET http://127.0.0.1:11434/api/tags` | FAIL / prerequisite unavailable | Connection refused |
| `Get-Command ollama` and standard per-user Ollama executable lookup | NOT FOUND | No executable resolved; no broad system search or install performed |
| Phase 3 preview readiness through its proxy | PASS | `ready`; original preview left unchanged |
| Fresh Phase 4 SQLite migration and account registration | PASS | New `.venv/phase4-integration-20261119-1.sqlite3`; no workspace/graph seed |
| Live Chrome initial baseline run | PASS with intentional restart-stage skip | 2 passed, 1 skipped at that stage: journey and responsive history passed; restart waits for an actual process restart |
| Live Chrome `--grep 'keeps approved weights'` | PASS | 1 passed against actual unavailable assessment; dependency JSON unchanged |
| Stop isolated API and read readiness | EXPECTED CONNECTION FAILURE | Confirms the old process was no longer serving before restart |
| Restart same API/database, then `--grep 'externally performed API restart'` | PASS | 1 passed; snapshot/hash/results/dependencies and History match baseline; zero inference POSTs |
| `npm run typecheck` | PASS | Existing application TypeScript gate |
| `npm run lint` | PASS | Existing ESLint gate, including changed integration test |
| `npm test -- --pool=forks --maxWorkers=1` | PASS | 19 passed across 4 files |
| `npx prettier --check e2e/workflow.spec.ts` | PASS | Changed test formatted |
| `uv run --locked pytest -q --tb=short` in backend | PASS | 113 passed |
| Optional standalone E2E `tsc --ignoreConfig ... --types node ...` | BLOCKED | Missing `@types/node`; no dependency installed solely for this additional check |

The initial standalone E2E compiler invocation also required TypeScript 6's
`--ignoreConfig`; rerunning with it exposed the missing Node type definitions.
The app's normal TypeScript gate passed. Do not describe standalone E2E static
type-checking as successful merely because Playwright transpiled/executed it.

The four distinct browser checks passed across staged executions, not a single
four-test command. The first baseline run preceded addition of the separate
unavailable-assessment case; its three-test result was 2 passed / 1 intentionally
skipped. The added failure case and post-restart case each passed independently.

## 5. Test results

- Frontend unit/component: 19 passed, 0 failed, 0 skipped.
- Backend: 113 passed, 0 failed, 0 skipped.
- Live checks: full manual workflow, responsive history, unavailable assessment,
  and real post-restart verification all passed in their staged invocations.
- Observed manual inputs: severity 90, weights 0.8 and 0.75. Direct score 57.6,
  indirect score 34.56. Stored results and inputs survived the restart exactly.
- Coverage/performance: not measured. Production build was not rerun in this
  test/documentation-only phase; its latest successful result is in Phase 3.
- Genuine model assessment, quality of reasoning, generated-commentary refresh,
  and generated-commentary restart restoration remain NOT RUN against Ollama.

## 6. Security and data integrity

- Original databases and Phase 3 test state were not migrated, reset, or seeded.
- Only a new Phase 4 SQLite file and local developer account were initialized.
  Workspace/components/events were then created through the browser workflow.
- The old API process was PID 23284, readiness failed after it stopped, and a
  new process (PID 21700) reopened the same database with no seeding/migration.
  This verifies API/embedded-SQLite process restart, not an operating-system
  restart or a separate PostgreSQL database-service restart.
- API authorization, tenant scope, and auditing were not changed. The complete
  existing backend suite, including isolation tests, passed.
- No secrets/environment files were read; no remote Git operation, package
  install, external model download, cloud action, or deployment was performed.

## 7. Evidence integrity

The restart evidence file is generated from real isolated API records under
`backend/.venv/phase4-persistence-baseline.json`. It records the run, results,
approved dependencies, selected entity, and saved-commentary state. It is local
test evidence, not a tracked production fixture or a measurement of AI quality.

Saved commentary was absent in this manual run. The restart test proved absence
remained explicit and no inference was triggered; it did not prove that genuine
generated commentary survived restart. Prior mocked persistence tests are not
substituted for that missing live-model evidence. Human UX evidence remains
TODO(human).

## 8. Deviations and blockers

- **Primary blocker:** Ollama is unreachable, and neither PATH nor the standard
  per-user install location yielded its executable. This does not prove that no
  installation exists elsewhere; the human may start an existing installation.
- A working local `qwen2.5:3b` is needed to finish genuine recommendation,
  approval, generation, refresh, and restart acceptance. No fake response was used.
- Standalone E2E static checking additionally lacks `@types/node`. Existing app
  checks and executed Playwright checks pass; adding a development type package
  can be evaluated separately rather than hiding this optional-check limitation.
- Phase 3's 18 untouched frontend formatting failures, historical migration lint
  findings, Compose demo-seeding default, production identity, live PostgreSQL,
  and the temporal/zero-weight brief conflicts remain open. No new claim is made
  that these were fixed or reverified here.

## 9. Progress file

`docs/progress.md` records Phase 4 approval, completed manual/restart checks,
current branch `project`, exact AI blocker, preview URL, and Phase 4 still PARTIAL.
Earlier phase reports are preserved. No branch or commit was created.

## 10. Human action required

1. Start an existing Ollama installation, or install Ollama for Windows through
   its official distribution. No installer was run by this session.
2. Load `qwen2.5:3b` with `ollama pull qwen2.5:3b` if necessary, and run the Ollama
   application or `ollama serve`. Any model download is a human-approved action,
   not something already performed by this phase.
3. Confirm `http://127.0.0.1:11434/api/tags` lists that model, then resume Phase 4.
   The genuine test needs a fresh isolated database and `RIPPLE_E2E_MANUAL=0`.
4. Repeat baseline capture and the external API restart with genuine commentary
   saved, then run the restart-only test. Do not reuse nonempty acceptance state
   for the initial fresh-install test or reset original user data.

The Phase 4 preview remains available at `http://127.0.0.1:5194`, backed by only
its isolated database; the earlier `5193` preview was left undisturbed.

## 11. Phase exit assessment

PARTIAL. Manual frontend/backend integration, immutable history after live edits,
failure handling, and actual API/SQLite restart persistence are verified. The
phase cannot honestly close until genuine AI recommendation/commentary and its
history/restart round trip are verified. Stop here for the runtime prerequisite;
do not proceed to Phase 5 or CI/CD automatically.