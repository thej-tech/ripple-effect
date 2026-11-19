# Ripple engine

The implemented engine is `backend/app/engine.py`. It accepts plain snapshot
dataclasses, constructs a NetworkX directed graph, and returns deterministic
results without importing FastAPI, SQLAlchemy, Ollama, or frontend code.

## Direction and scoring

An edge source -> target means a disruption in source may affect target.
For a trigger and a qualifying simple path, the implementation computes:

```text
trigger_score = severity * trigger_exposure * (1 - trigger_mitigation)
path_score = trigger_score * product(weight_i * attenuation * (1 - mitigation_i))
```

Severity and output scores use 0-100 scales; the factors use 0-1 scales.
Default attenuation is 0.8 per entered edge. Trigger exposure comes from the
event-trigger association; entity exposure is retained but is not an extra
multiplier. Component criticality metadata is descriptive, not a scoring factor.
Scores are heuristic estimates, never probabilities.

With severity 90, weights 0.8 and 0.7, no mitigation, and exposure 1, the
two-edge score is 32.256, displayed as 32.3. Weights of 1 on both edges give
72.0 at the direct target and 57.6 at the indirect target. These follow from
inputs, not hardcoded scenarios.

## Traversal and aggregation

- Sorted simple-path enumeration never revisits a vertex within a path.
- Separate breadth-first traversal computes minimum depth; the strongest path
	may be longer. Disconnected components are not impact results.
- Default maximum depth is 4, with explicit depth/path/node safety bounds.
	Truncated runs report `completed_with_limits` and incompleteness metadata.
- `max` selects the strongest path. `capped_sum` selects the strongest path
	per distinct final dependency across triggers, then sums and caps at 100.
- Ties prefer fewer edges, then lexical entity/dependency ordering. Provenance
	retains the originating trigger, paths, weights, and dependency reviews.
- Review confidence is the weakest primary-path review: draft 0.5/low,
	reviewed 0.8/medium, validated 1.0/high. It is not AI confidence or likelihood.

## Persistence and AI boundary

The analysis service persists snapshots, configuration, algorithm version,
canonical SHA-256 hash, results, paths, and deterministic explanations.
New snapshots also retain optional descriptive and assessment `context`.
Context participates in hashing but not scoring; legacy snapshots without it
replay with their prior canonical shape. Scenario overlays remain isolated.

Ollama recommends weights for explicit human approval. Generated commentary is
stored in the separate `analysis_explanations` table with the supplied context,
model, author, and run hash; it never replaces engine results or mutates a run's
input snapshot. Retrieval does not require the model to be online.

## Current semantic differences from the brief

The live service defaults `as_of` to current UTC time, while the pure engine
defaults to event start. Validity ends are exclusive in the engine. The live
service deactivates zero-weight and draft edges before scoring, whereas the
pure engine can retain zero-impact paths. These pre-existing differences were
reported during the improvement audit and are unchanged pending a human
decision. They must not be silently presented as matching the original brief.

Tests are in `backend/tests/test_engine.py`, `test_api.py`, and
`test_migrations.py`. Passing SQLite and offline PostgreSQL DDL tests do not
establish live PostgreSQL concurrency behavior or production performance.
