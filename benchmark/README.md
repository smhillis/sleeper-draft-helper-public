# Phase 2 benchmark harness

This directory is the controlled post-core benchmark for WhoToDraftNext. It is intentionally separate from the production recommendation engine. The benchmark may observe the production engine, but it may not tune or weaken production logic in-place.

## What is held constant

Each paired trial holds the following constant across WhoToDraftNext, FantasyPros ECR, ADP, projected-points and VORP/value-based selection:

- league settings and roster shape;
- scoring settings;
- production player pool;
- production projections / production projection estimator;
- user draft slot;
- deterministic opponent preference function;
- seed and number of rounds;
- basic roster-legality/end-game completion guardrails for the non-WTDN baselines.

Different strategies can cause later opponent picks to diverge only because the available player pool has changed. Opponent preferences themselves are deterministic from seed, pick number and player identity rather than from a mutable random-number stream.

## Required league matrix

The harness contains these scenarios:

- 12-team full PPR;
- 12-team half PPR;
- 12-team standard;
- 10-team full PPR;
- 14-team full PPR;
- 12-team PPR with 4-point passing TDs;
- 12-team PPR with 6-point passing TDs;
- 12-team PPR with two FLEX slots;
- 12-team PPR superflex.

## Strategies

`wtdn` calls the production `SleeperDraftEngine.recommendations()` path after the exhaustive-scoring, draft-strategy and normalized-recommendation overlays are loaded.

`adp` takes the best available market-price rank subject only to shared roster-completion guardrails.

`projected_points` takes the highest league-scored projected season points subject to the same guardrails.

`vorp` uses league-scored projected points above a replacement level derived from league size and roster demand.

`ecr` is deliberately fail-closed in final mode. A final report may not use WhoToDraftNext's blended `consensusRank` and call it FantasyPros ECR. `--ecr=<file>` must point to a fixture marked `sourceType: "fantasypros-ecr"` and `complete: true`, with at least 90% coverage of the benchmark player pool. Smoke mode uses the production consensus rank only as an explicitly labeled proxy so CI can exercise the harness without pretending the proxy is the competitor.

The next fixture revision must split exact ECR by scoring format (PPR / half PPR / standard / superflex) before final cross-format results are eligible. Until that is done, all output remains preliminary even if simulation confidence intervals happen to be narrow. Humans do enjoy discovering new ways to make the word “consensus” ambiguous.

## Outputs

A run writes:

- `metadata.json` — configuration, source mode, seed, sample count and final-eligibility flags;
- `summary.json` — aggregate metrics and paired 95% confidence intervals;
- `grouped.json` — paired results by league configuration and draft slot;
- `rosters.jsonl` — every final roster and outcome metric;
- `decision-log.jsonl.gz` — every WTDN user decision, including roster state, the available player pool, WTDN choice, ECR/ADP/projected/VORP counterfactual choices, normalized recommendation components and downstream outcomes for every strategy;
- `report.md` — concise benchmark report with the seven required questions and explicit preliminary/final status.

Decision logs are compressed because a final multi-million-decision run is otherwise a fairly effective way to benchmark disk invoices rather than draft strategy.

## Metrics

The current harness records:

- average projected final roster strength;
- optimal projected weekly starter points;
- positional strength;
- bench value;
- replacement-level advantage;
- roster balance;
- risk/downside exposure based on confidence/expert-range uncertainty;
- paired WTDN win/tie rates;
- top-10% and bottom-10% roster rates.

`rosterStrength` is a transparent evaluation composite used for paired comparisons. The component metrics remain separately available so a strategy cannot “win” merely by exploiting one arbitrary composite weight.

## Convergence

The target simulation scale in the backlog is approximately 12 draft slots × 10,000 drafts × strategy, but the harness does not hard-code that as truth delivered from a mountain. For every paired baseline it calculates the mean WTDN roster-strength difference and a 95% confidence-interval half-width. A final run requires at least 200 paired observations and the configured half-width target for every baseline. The sample count is increased until that criterion is met and stability by league/slot is also inspected.

## Commands

CI smoke test:

```bash
npm run benchmark:smoke
```

Final-style run (fails if ECR is incomplete or paired estimates have not converged):

```bash
node benchmark/benchmark.js \
  --samples=1000 \
  --ecr=benchmark/data/fantasypros-ecr-2026-08-26.json \
  --convergence-target=0.25 \
  --output=benchmark/out
```

The sample count above is illustrative, not a final chosen count.

## Post-2026 rerun

The command accepts `--actuals=<json>` as the preserved post-season input hook. The actual-production evaluator is not wired into the preseason scoring path yet; that work must remain explicit so realized player production can be compared with preseason projections without silently replacing one with the other. Final backlog closure requires that hook to be implemented and validated.

## Final-result gates still open

The harness itself is not the final benchmark. Before issue #10 can close:

1. exact FantasyPros ECR must be captured with scoring-format-specific coverage sufficient for the full benchmark pool;
2. the post-2026 actual-production input path must be wired and tested;
3. high-sample runs must satisfy the CI convergence gate across all required league configurations and draft slots;
4. round/position attribution must be summarized from the decision logs;
5. obvious-elite-value passes must be audited from those logs;
6. only then may the report make evidence-backed engine-change recommendations.
