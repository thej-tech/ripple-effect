# Product Improvement Phase 3 Report - Frontend

## 1. Objective

Complete the approved frontend follow-up: paginate active workspace/history
data and paths, restore saved commentary in History, and improve active graph
roles, selection, and responsive framing. Preserve existing blue styling,
navigation, ripple background, scoring, authorization, and user records.

## 2. Work completed

| File | Purpose |
|---|---|
| `frontend/src/api.ts` | Shared complete-page collector, offset support, and saved-commentary GET with explicit missing/error handling |
| `frontend/src/App.tsx` | Load every active collection/result/path page; lazy per-result saved commentary; independent inference/retry states; depth-based graph roles and selection; responsive fitting |
| `frontend/src/styles.css` | Scoped role borders, node labels, commentary spacing, readable built-in graph controls, and narrow-canvas height |
| `frontend/src/api.test.ts` | Pagination/progress validation, collection offsets, saved GET, and 404 versus service-failure cases |
| `frontend/src/App.test.tsx` | Active history/path paging, saved commentary reopening, remount persistence, failed-regeneration safety, retrieval retry, and role/depth layout |
| `frontend/e2e/workflow.spec.ts` | Strengthen the real browser journey and add saved-history mobile/desktop framing regression; serial execution preserves the fresh-install precondition |
| `README.md`, `docs/progress.md`, this report | Updated user workflow, exact evidence, limits, and next approval boundary |

No backend source, migrations, runtime dependencies, authentication, CI/CD, or
original database was changed in this phase. Backend edits made between phases
were preserved and the current backend suite was rerun.

### Delivered behavior

- All active entity, dependency, event, run, result, and retained-path pages are
  loaded. Invalid or non-advancing pagination fails visibly instead of silently
  truncating the model. Per-result path requests run in batches of at most eight.
- Expanding a result loads its latest saved commentary with GET, never automatic
  inference. Loading and retrieval failures are visible; retrieval has Retry.
- Commentary generation is local to the result rather than locking the whole
  workspace. Regeneration is explicit and preserves saved text on failure.
  Every commentary panel is labelled as requiring human review.
- The active graph displays saved names, scores, relationships, weights, and
  propagation roles. Starting, direct, and indirect nodes have textual cues and
  distinct borders. Node selection opens and highlights matching result details.
- Layout uses the backend's minimum depth without recomputing impact. Narrow
  canvases use vertical propagation; resize fitting keeps nodes in view.
  Existing zoom/fit controls and list/path alternatives remain available.
- Blue/ripple visual identity, existing forms, navigation, and manual weight
  workflow remain intact. No new demo data is inserted at application startup.

## 3. Decisions

- Reuse the existing typed client and React Flow controls. No icon/layout/state
  package or framework change was needed.
- Keep commentary retrieval lazy to avoid thousands of model-history requests
  when opening a large run. Missing commentary is distinct from a service error.
- Preserve the latest saved response across failed regeneration. Stored model
  text is not replaced with a fake success or error string.
- Keep impact calculations server-side. Positioning and visual cues use saved
  depth/provenance; the frontend does not generate scores or relationships.
- Restrict formatting changes to touched frontend files. Do not mask the full
  formatting gate's remaining baseline failures.

## 4. Verification performed

Frontend commands run from the canonical `frontend` directory. Backend commands
use `uv run --directory <workspace>/backend --locked ...`.

| Command/check | Result | Evidence |
|---|---|---|
| `npm test -- --pool=forks --maxWorkers=1` | PASS | 19 passed across 4 files on final source |
| `npm run typecheck` | PASS | TypeScript passed; final build also recompiles types |
| `npm run lint` | PASS | ESLint/hooks passed on final source |
| `npx prettier --check src/App.tsx src/App.test.tsx src/api.ts src/api.test.ts src/styles.css e2e/workflow.spec.ts` | PASS | All six changed frontend files formatted |
| `npm run format:check` | FAIL, baseline remains | 18 untouched files flagged, reduced from the audit's 24 after formatting touched files; no configuration weakened |
| `npm run build` | PASS | Final TypeScript/Vite production build succeeded |
| `uv run --locked pytest -q --tb=short` in backend | PASS | 113 passed against current backend files |
| Live Chrome `npm run test:e2e` with isolated URL and manual mode | PASS | Final run: 2 passed, 0 failed, 0 skipped |
| Saved-run resize test with `--repeat-each=3 --workers=1` | PASS | 3 consecutive passes after the framing timing fix |
| Editor diagnostics | PASS | No errors in changed frontend source/tests/styles |

The final live run used `RIPPLE_RUN_LIVE_E2E=1`, `RIPPLE_E2E_MANUAL=1`,
`RIPPLE_E2E_URL=http://127.0.0.1:5193`, and `PLAYWRIGHT_USE_CHROME=1`.

Browser testing exposed two real framing defects: initial mobile clipping and
an intermittent fit before React Flow committed resized positions. Both were
repaired; assertions were retained, repeated resize checks passed, and the full
two-test journey was rerun on another fresh database. An early repeated
invocation correctly failed the empty-workspace guard; no database was reset
and no acceptance guard was weakened. Intermediate test-environment/query
typing issues were repaired before the final passes.

## 5. Test results

- Frontend unit/component: 19 passed, 0 failed, 0 skipped.
- Backend: 113 passed, 0 failed, 0 skipped; backend files were not edited here.
- Final live Chrome suite: 2 passed, 0 failed, 0 skipped.
- Coverage/performance: not measured; no scale or latency claim is made.
- Live manual weights 0.8 and 0.75, severity 90, produced direct score 57.6 and
  indirect score 34.56, consistent with the saved paths and attenuation formula.
  These are observed inputs/results, not hardcoded product outputs.
- The browser verified empty installation, workspace creation, component edits,
  both connection methods, manual weight approval, event creation, analysis,
  graph selection, real AI-unavailable feedback, History, refresh, mobile
  overflow, resize framing, and absence of uncaught page errors.

## 6. Security and data integrity

- No authorization, tenant scope, scoring, or API contract was weakened.
- Original databases were not migrated, reset, seeded, or modified. Browser
  records were created through the UI in new SQLite files under `backend/.venv/`.
- Only a local development user was registered during isolated setup. No seed
  graph, default workspace, or event was loaded by application startup.
- Previous test databases were preserved when fresh state was required.
- No secrets/environment files were read; no package addition, remote Git,
  deployment, cloud operation, container scan, or dependency audit was performed.

## 7. Evidence integrity

Screenshots were generated by real Chrome under `frontend/test-results/` and
inspected at desktop 1400x900 and mobile 390x844. These ignored local artifacts
can be regenerated by the acceptance tests; they are not claimed as committed
or remote evidence. The preview contains only isolated acceptance-test records.

Saved-commentary restoration/failure cases use explicit automated test mocks.
Live browser testing used real backend/manual-weight data and a real unavailable
AI response. Genuine Ollama recommendation/commentary quality was not verified;
no fabricated model output was presented as real inference. Human UX evidence
remains TODO(human).

## 8. Deviations and blockers

- Genuine local inference remains unavailable. Phase 4 must verify `qwen2.5:3b`
  recommendations and saved commentary end to end when Ollama is running.
- Full frontend formatting still fails on 18 untouched checkout files. The audit's
  historical initial-migration Ruff findings are also not resolved by this phase.
- SQLite UI refresh/history works; database-process restart and live PostgreSQL
  behavior/concurrency are not claimed.
- Pagination correctness is tested, but large-graph rendering and loading cost
  are not benchmarked. Collections changing during paging can require a retry.
- Compose still enables demo seeding; installation-default cleanup remains open.
  No original data or existing synthetic fixture files were deleted.
- Temporal default/expiry and zero-weight brief conflicts remain unchanged and
  need explicit resolution before altering backend semantics.
- Broader product polish and integration are not silently treated as completed.

## 9. Progress file

`docs/progress.md` records approval, implementation, current branch `project`,
test results, preview URL, blockers, and Phase 4 awaiting approval. Earlier
reports/evidence are preserved. No Git commit or new branch was created.

## 10. Human review required

- Review History commentary restoration and the graph on desktop/mobile.
- Local preview: `http://127.0.0.1:5193`; isolated API: `http://127.0.0.1:8033`.
  Services bind only loopback and use `.venv/phase3-browser-20261119-4.sqlite3`,
  not the original workspace database. Acceptance records are test data.
- Approve Phase 4 integration before further work. Suggested focus: genuine
  Ollama approval/history round trip, restart persistence, and remaining failure
  cases. Resolve the documented semantic conflicts separately.

## 11. Phase exit assessment

YES for the approved frontend slice: implementation, scoped checks, manual-mode
live journey, screenshots, and responsive regression are complete. Overall
application acceptance is still incomplete, with genuine inference, installation
defaults, quality-baseline cleanup, and broader integration/polish outstanding.
Stop here pending explicit Phase 4 approval.