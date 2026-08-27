# Phase 2 benchmark harness

This directory is the controlled post-core benchmark for WhoToDraftNext. It is intentionally separate from the production recommendation engine. The benchmark may observe the production engine, but it may not tune or weaken production logic in-place.

## What is held constant

Each paired trial holds league settings, scoring, the player pool, projections, draft slot, deterministic opponent preferences, seed, round count, and the baseline roster-legality/end-game guardrails constant across WhoToDraftNext, FantasyPros ECR, ADP, projected-points and VORP/value-based selection.

Different strategies can cause later opponent picks to diverge only because the available player pool has changed. Opponent preferences themselves are deterministic from seed, pick number and player identity rather than from a mutable random-number stream.

## Required league matrix

The harness contains 12-team full PPR, 12-team half PPR, 12-team standard, 10-team PPR, 14-team PPR, 4-point passing TD, 6-point passing TD, two FLEX, and superflex scenarios.

## Strategies and ECR gate

`wtdn` calls the production `SleeperDraftEngine.recommendations()` path after the exhaustive-scoring, draft-strategy and normalized-recommendation overlays are loaded.

`adp`, `projected_points`, and `vorp` use their own selection metrics subject only to shared roster-completion guardrails. They do not inherit WTDN VOR, survival, wait-cost, or league-adjustment weights.

`ecr` is deliberately fail-closed in final mode. A final report may not use WhoToDraftNext's blended `consensusRank` and call it FantasyPros ECR. Exact input is split into independent PPR, half-PPR, standard and superflex sets. Each final set must be continuous through at least rank 210 and cover at least 90% of the draft-relevant production pool.

FantasyPros' current API requires an API key, commercial use requires a separate agreement, and its current API guidance says its data may not be used to build a product or service that directly competes with FantasyPros. The site Terms of Use also restrict commercial reuse of site content. Accordingly, this repository does not scrape, redistribute, or silently import FantasyPros rankings. Final ECR input must come from a source the operator is permitted to use. Proxy mode exists only to validate the harness and can never produce a final ECR conclusion. Annoying, but considerably less annoying than pretending a terms-of-use problem is a CSV problem.

## Outputs

A benchmark-v2 run writes:

- `metadata.json` — configuration, ECR scoring-set coverage, seed, sample count, actual-production provenance and final-eligibility flags;
- `summary.json` — aggregate metrics and paired 95% confidence intervals;
- `grouped.json` — paired results by league configuration and draft slot;
- `rosters.jsonl` — every final roster and full outcome object, including positional strength;
- `decision-log.jsonl.gz` — every WTDN user decision, including roster state, full available pool, WTDN choice, ECR/ADP/projected/VORP counterfactual choices, normalized recommendation data and downstream outcomes for every strategy;
- `report.md` — projected and, when supplied, realized-production comparison with explicit preliminary/final status;
- optional `actual-summary.json` and `actual-grouped.json` — post-2026 outcomes from the same drafted rosters rescored from realized stat lines;
- `decision-audit.json` after the audit step — disagreement/outcome association by round, selected position, league config, slot and recommendation-behavior bucket plus elite-value-pass flags.

Decision logs are compressed because a final multi-million-decision run is otherwise a fairly effective way to benchmark disk invoices rather than draft strategy.

## Metrics

Every roster outcome records projected final roster strength, projected season points, optimal starter season and weekly points, bench value, replacement-level advantage, roster balance, risk/downside exposure, positional strength and roster counts. Aggregate output also tracks paired WTDN win/tie rates plus top-10% and bottom-10% roster rates.

`rosterStrength` is a transparent evaluation composite used for paired comparisons. Component metrics remain separately available in each roster record so a strategy cannot win merely by exploiting one arbitrary composite weight.

## Convergence

The backlog target of roughly 12 draft slots × 10,000 drafts × strategy is a scale target, not a ritual number. The harness calculates paired 95% confidence intervals for WTDN minus each baseline. Final output requires at least 200 paired observations and the configured half-width target for every baseline; the final sample count should then be checked for stability by league configuration and draft slot.

## Commands

Full validation and synthetic benchmark smoke:

```bash
npm run validate:draft-engine
```

Benchmark-v2 run with a permitted complete scoring-specific ECR fixture:

```bash
npm run benchmark -- \
  --samples=1000 \
  --ecr=benchmark/data/fantasypros-ecr-2026-08-26.json \
  --convergence-target=0.25 \
  --output=benchmark/out
```

The sample count above is illustrative. Final sample size is justified by convergence evidence, not by admiration for round numbers.

Decision-level round/position/behavior and elite-value-pass audit:

```bash
npm run benchmark:audit -- \
  --input=benchmark/out/decision-log.jsonl.gz \
  --output=benchmark/out/decision-audit.json
```

The audit's `meanAssociatedDraftDelta` is deliberately labeled descriptive. The same final draft delta appears on each decision from that draft, so it is not falsely presented as a causal estimate of one isolated pick.

## Post-2026 rerun

Supply `--actuals=<json>` with scoring-independent realized 2026 stat lines. The harness re-scores those stats under each benchmark league's actual scoring settings and evaluates the already-drafted rosters without changing any preseason draft choice. This keeps projection error separate from recommendation-strategy error. Final post-season input must be complete through Week 18 with sufficient draft-pool coverage.

## Final-result gates still open

The technical harness, scoring-specific fixture contract, post-season evaluator, round/position audit, recommendation-behavior audit and elite-value-pass audit are implemented and validated. Issue #10 still cannot close until:

1. a permitted complete FantasyPros ECR fixture exists for PPR, half-PPR, standard and superflex;
2. high-sample runs satisfy the CI convergence gate across the required matrix and draft slots;
3. the decision audit is run on those converged logs;
4. the final report answers the seven backlog questions from converged evidence rather than smoke/proxy output;
5. any engine change suggested by that evidence is made separately and passes the full production validation suite.
