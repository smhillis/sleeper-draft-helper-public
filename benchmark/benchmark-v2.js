#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Module = require('module');
const {
  validateEcrFixture,
  validateActualsFixture,
  ecrSetKeyForConfig,
  rankingMapForConfig,
} = require('./fixture-contract');

const root = path.resolve(__dirname, '..');
const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function loadV1Api() {
  const filename = path.join(__dirname, 'benchmark.js');
  const source = fs.readFileSync(filename, 'utf8');
  const marker = '\nmain();';
  if (!source.endsWith(marker)) throw new Error('benchmark.js entrypoint shape changed; update benchmark-v2 loader before running');
  const exportSource = `${source.slice(0, -marker.length)}\nmodule.exports = { CONFIGS, loadEngine, loadBoard, scoringSettings, rosterPositions, simulateStrategy, aggregate, groupedAnalysis, writeReport, replacementLevels, evaluateRoster };\n`;
  const loaded = new Module(`${filename}:library`, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(exportSource, filename);
  return loaded.exports;
}

function parseArgs(argv) {
  const args = {
    samples: 12,
    seed: 20260826,
    output: path.join(root, 'benchmark', 'out'),
    smoke: false,
    requireEcr: true,
    convergenceTarget: 0.25,
    ecr: null,
    actuals: null,
    allowPartialActuals: false,
  };
  for (const arg of argv) {
    if (arg === '--smoke') args.smoke = true;
    else if (arg === '--no-require-ecr') args.requireEcr = false;
    else if (arg === '--allow-partial-actuals') args.allowPartialActuals = true;
    else if (arg.startsWith('--samples=')) args.samples = Math.max(1, Number(arg.split('=')[1]) || args.samples);
    else if (arg.startsWith('--seed=')) args.seed = Number(arg.split('=')[1]) || args.seed;
    else if (arg.startsWith('--output=')) args.output = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--ecr=')) args.ecr = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--actuals=')) args.actuals = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--convergence-target=')) args.convergenceTarget = Math.max(0.01, Number(arg.split('=')[1]) || args.convergenceTarget);
  }
  if (args.smoke) {
    args.samples = Math.min(args.samples, 2);
    args.requireEcr = false;
    args.allowPartialActuals = true;
  }
  return args;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function loadEcr(args, board, configs) {
  if (!args.ecr || !fs.existsSync(args.ecr)) {
    if (args.requireEcr) {
      throw new Error('Final benchmark requires --ecr=<scoring-specific FantasyPros ECR fixture>. Production consensusRank is not FantasyPros ECR.');
    }
    const proxy = new Map(board.map((player) => [norm(player.name), num(player.consensusRank, 99999)]));
    return {
      mode: 'proxy',
      complete: false,
      source: 'production-consensusRank-proxy',
      fixture: null,
      maps: Object.fromEntries(['ppr', 'half', 'standard', 'superflex'].map((key) => [key, proxy])),
      coverageBySet: Object.fromEntries(['ppr', 'half', 'standard', 'superflex'].map((key) => [key, 1])),
    };
  }

  const fixture = readJson(args.ecr);
  const validation = validateEcrFixture(fixture, { final: args.requireEcr, requiredRank: 210 });
  if (!validation.valid) throw new Error(`Invalid ECR fixture: ${validation.errors.slice(0, 12).join('; ')}`);

  const maps = {};
  const coverageBySet = {};
  for (const config of configs) {
    const key = ecrSetKeyForConfig(config);
    if (!maps[key]) maps[key] = rankingMapForConfig(fixture, config);
  }
  for (const key of ['ppr', 'half', 'standard', 'superflex']) {
    const map = maps[key] || new Map();
    const draftRelevant = board.filter((player) => !['K', 'DEF'].includes(player.pos) && Math.min(num(player.adp, 9999), num(player.consensusRank, 9999)) <= 210);
    coverageBySet[key] = draftRelevant.filter((player) => Number.isFinite(map.get(norm(player.name)))).length / Math.max(1, draftRelevant.length);
    if (args.requireEcr && coverageBySet[key] < 0.90) {
      throw new Error(`ECR ${key} fixture covers only ${(coverageBySet[key] * 100).toFixed(1)}% of the draft-relevant production pool; final mode requires at least 90%.`);
    }
  }

  return {
    mode: fixture.complete ? 'exact' : 'partial',
    complete: Boolean(fixture.complete),
    source: args.ecr,
    fixture,
    maps,
    coverageBySet,
  };
}

function ecrForConfig(ecr, config) {
  const key = ecrSetKeyForConfig(config);
  const map = ecr.maps[key] || new Map();
  return {
    mode: ecr.mode,
    complete: ecr.complete,
    scoringSet: key,
    rankings: Object.fromEntries(map.entries()),
  };
}

function loadActuals(args, board) {
  if (!args.actuals) return null;
  if (!fs.existsSync(args.actuals)) throw new Error(`Actual-production fixture does not exist: ${args.actuals}`);
  const fixture = readJson(args.actuals);
  const validation = validateActualsFixture(fixture, { final: !args.allowPartialActuals });
  if (!validation.valid) throw new Error(`Invalid actual-production fixture: ${validation.errors.slice(0, 12).join('; ')}`);
  const byName = new Map((fixture.players || []).map((player) => [norm(player.name), player]));
  const draftRelevant = board.filter((player) => !['K', 'DEF'].includes(player.pos) && Math.min(num(player.adp, 9999), num(player.consensusRank, 9999)) <= 210);
  const coverage = draftRelevant.filter((player) => byName.has(norm(player.name))).length / Math.max(1, draftRelevant.length);
  if (!args.allowPartialActuals && coverage < 0.90) throw new Error(`Actual-production fixture covers only ${(coverage * 100).toFixed(1)}% of the draft-relevant production pool; final post-season rerun requires at least 90%.`);
  return { fixture, byName, coverage, source: fixture.source };
}

function actualPointsMap(actuals, exhaustive, board, config) {
  if (!actuals) return null;
  const scoring = loadV1Api().scoringSettings(config);
  const map = new Map();
  for (const player of board) {
    const actual = actuals.byName.get(norm(player.name));
    if (!actual) continue;
    const stats = { pos: actual.position || player.pos, ...(actual.stats || {}) };
    map.set(norm(player.name), exhaustive.projectedPoints(stats, scoring));
  }
  return map;
}

function evaluateActualRoster(api, roster, actualPoints, board, config) {
  if (!actualPoints) return null;
  const replacements = api.replacementLevels(board, actualPoints, config);
  return api.evaluateRoster(roster, actualPoints, replacements, config);
}

function outcomeFor(record, field) { return record?.[field] || null; }

function aggregateField(api, records, convergenceTarget, field) {
  const usable = records.filter((record) => outcomeFor(record, field));
  if (!usable.length) return null;
  const projectedShape = usable.map((record) => ({ ...record, outcome: record[field] }));
  return api.aggregate(projectedShape, convergenceTarget);
}

function groupedField(api, records, field) {
  const usable = records.filter((record) => outcomeFor(record, field));
  if (!usable.length) return null;
  return api.groupedAnalysis(usable.map((record) => ({ ...record, outcome: record[field] })));
}

function buildReport(metadata, summary, grouped, actualSummary) {
  const finalProjected = metadata.finalEligible && summary.allPairedConverged;
  const lines = [
    '# WhoToDraftNext Phase 2 Benchmark', '',
    `**Projected benchmark status:** ${finalProjected ? 'FINAL-ELIGIBLE' : 'PRELIMINARY / NOT FINAL'}`, '',
    `Generated: ${metadata.generatedAt}`,
    `ECR mode: ${metadata.ecrMode}`,
    `ECR scoring sets: ${Object.keys(metadata.ecrCoverageBySet || {}).join(', ')}`,
    `Draft records: ${metadata.records}`,
    `Samples per slot/config: ${metadata.samples}`,
    `95% CI target: ±${metadata.convergenceTarget.toFixed(2)} roster-strength points`, '',
    '## Projected/preseason comparison', '',
  ];
  for (const [baseline, row] of Object.entries(summary.paired)) {
    lines.push(`- WTDN vs ${baseline}: ${row.mean.toFixed(3)} ± ${Number.isFinite(row.halfWidth) ? row.halfWidth.toFixed(3) : '∞'} (95% CI, n=${row.n}); WTDN win rate ${(row.winRate * 100).toFixed(1)}%; converged=${row.converged}.`);
  }
  lines.push('', 'The projected result uses the same production projection/scoring inputs for every strategy. It is not a claim about realized 2026 player production.', '');

  if (actualSummary) {
    lines.push('## Post-2026 realized-production rerun', '', `Actual-production source: ${metadata.actualsSource}`, `Actual-production pool coverage: ${(metadata.actualsCoverage * 100).toFixed(1)}%`, '');
    for (const [baseline, row] of Object.entries(actualSummary.paired)) {
      lines.push(`- WTDN vs ${baseline}: ${row.mean.toFixed(3)} ± ${Number.isFinite(row.halfWidth) ? row.halfWidth.toFixed(3) : '∞'} actual-production roster-strength points (n=${row.n}); win rate ${(row.winRate * 100).toFixed(1)}%.`);
    }
    lines.push('', 'Draft choices are unchanged from the preseason simulation. Only roster evaluation is replaced with realized stat lines re-scored under each league configuration. That separation is the point: recommendation-strategy error and projection error are not allowed to blur into one convenient soup.', '');
  } else {
    lines.push('## Post-2026 realized-production rerun', '', 'Capability is wired and validated, but no 2026 realized-production fixture was supplied for this run.', '');
  }

  lines.push('## Required questions', '',
    '1. **Does WhoToDraftNext consistently outperform ECR, ADP, and projected-points drafting?** Answer only after every required scoring-specific ECR set is exact and paired intervals converge.',
    '2. **By how much?** Use the paired estimates above, not unpaired averages.',
    '3. **Which rounds gain or lose the most value?** Decision logs retain round, state and all counterfactual choices for attribution.',
    '4. **Which league settings increase or reduce its advantage?** `grouped.json` contains projected paired estimates by config and slot; `actual-grouped.json` does the same after the season when actuals are supplied.',
    '5. **Which recommendation behaviors hurt results?** Must be tied to converged decision-level losses, not a single dramatic draft.',
    '6. **Does the engine get too clever and pass obvious elite value?** Audit WTDN choices against ECR/ADP/projected/VORP alternatives in the decision log.',
    '7. **What should change?** Nothing based solely on smoke/preliminary output. Any engine change gets its own validation branch and must improve broad fixtures rather than one benchmark cell.', '',
    '## Guardrails', '',
    '- Exact ECR is selected by league scoring format: PPR, half-PPR, standard, or superflex.',
    '- Baseline strategies do not inherit WTDN VOR, survival, wait-cost, or roster-scoring weights.',
    '- Actual production never influences draft selections. It only evaluates the already-drafted rosters after the season.',
    '- The benchmark fails closed on incomplete final fixtures rather than inventing generic rankings or scoring.',
    '- Production recommendation logic is not tuned inside this harness.', '',
    '## Reproducibility', '',
    `Seed: ${metadata.seed}`,
    `Configs: ${metadata.configs.join(', ')}`,
    `Player pool: ${metadata.playerPool}`,
    'Outputs include metadata, projected and actual summaries, grouped results, roster JSONL, and a gzip JSONL decision log.', ''
  );
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const api = loadV1Api();
  const { engine, exhaustive } = api.loadEngine();
  const { board, projections } = api.loadBoard(engine);
  if (board.length < 120) throw new Error(`Benchmark player pool too small: ${board.length}`);
  const configs = args.smoke ? [api.CONFIGS[0], api.CONFIGS[8]] : api.CONFIGS;
  const ecr = loadEcr(args, board, configs);
  const actuals = loadActuals(args, board);
  const strategies = ['wtdn', 'ecr', 'adp', 'projected_points', 'vorp'];
  const records = [];

  ensureDir(args.output);
  const gzip = zlib.createGzip({ level: 6 });
  const decisionStream = fs.createWriteStream(path.join(args.output, 'decision-log.jsonl.gz'));
  gzip.pipe(decisionStream);

  for (const config of configs) {
    const configEcr = ecrForConfig(ecr, config);
    let configActualPoints = null;
    if (actuals) {
      const scoring = api.scoringSettings(config);
      configActualPoints = new Map();
      for (const player of board) {
        const actual = actuals.byName.get(norm(player.name));
        if (!actual) continue;
        configActualPoints.set(norm(player.name), exhaustive.projectedPoints({ pos: actual.position || player.pos, ...(actual.stats || {}) }, scoring));
      }
    }

    for (let slot = 1; slot <= config.teams; slot += 1) {
      for (let sample = 0; sample < args.samples; sample += 1) {
        const seed = args.seed + sample * 1009 + slot * 101 + config.id.length * 7919;
        const projectedDownstream = {};
        const actualDownstream = {};
        let wtdnDecisions = [];

        for (const strategy of strategies) {
          const result = api.simulateStrategy({ strategy, engine, exhaustive, board, projections, config, slot, seed, ecr: configEcr });
          const actualOutcome = configActualPoints ? evaluateActualRoster(api, result.roster, configActualPoints, board, config) : null;
          const record = {
            config: config.id,
            ecrScoringSet: configEcr.scoringSet,
            teams: config.teams,
            slot,
            seed,
            strategy,
            outcome: result.outcome,
            actualOutcome,
            roster: result.roster.map((player) => ({ name: player.name, position: player.pos, adp: player.adp, consensusRank: player.consensusRank })),
          };
          records.push(record);
          projectedDownstream[strategy] = result.outcome;
          if (actualOutcome) actualDownstream[strategy] = actualOutcome;
          if (strategy === 'wtdn') wtdnDecisions = result.decisions;
        }

        for (const decision of wtdnDecisions) {
          gzip.write(`${JSON.stringify({ ...decision, ecrScoringSet: configEcr.scoringSet, downstreamOutcomeByStrategy: projectedDownstream, actualDownstreamOutcomeByStrategy: actuals ? actualDownstream : null })}\n`);
        }
      }
    }
  }
  gzip.end();

  const summary = api.aggregate(records, args.convergenceTarget);
  const grouped = api.groupedAnalysis(records);
  const actualSummary = aggregateField(api, records, args.convergenceTarget, 'actualOutcome');
  const actualGrouped = groupedField(api, records, 'actualOutcome');
  const metadata = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    seed: args.seed,
    samples: args.samples,
    configs: configs.map((config) => config.id),
    strategies,
    records: records.length,
    playerPool: board.length,
    ecrMode: ecr.mode,
    ecrSource: ecr.source,
    ecrCoverageBySet: ecr.coverageBySet,
    convergenceTarget: args.convergenceTarget,
    allPairedConverged: summary.allPairedConverged,
    finalEligible: ecr.mode === 'exact' && Boolean(ecr.complete),
    actualsSupplied: Boolean(actuals),
    actualsSource: actuals?.source || null,
    actualsCoverage: actuals?.coverage ?? null,
    actualsComplete: Boolean(actuals?.fixture?.complete),
  };

  fs.writeFileSync(path.join(args.output, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  fs.writeFileSync(path.join(args.output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(args.output, 'grouped.json'), `${JSON.stringify(grouped, null, 2)}\n`);
  if (actualSummary) fs.writeFileSync(path.join(args.output, 'actual-summary.json'), `${JSON.stringify(actualSummary, null, 2)}\n`);
  if (actualGrouped) fs.writeFileSync(path.join(args.output, 'actual-grouped.json'), `${JSON.stringify(actualGrouped, null, 2)}\n`);
  fs.writeFileSync(path.join(args.output, 'rosters.jsonl'), `${records.map((record) => JSON.stringify(record)).join('\n')}\n`);
  fs.writeFileSync(path.join(args.output, 'report.md'), buildReport(metadata, summary, grouped, actualSummary));

  console.log('WHO TO DRAFT NEXT — PHASE 2 BENCHMARK V2');
  console.log(`Mode: ${args.smoke ? 'smoke' : 'benchmark'}`);
  console.log(`Player pool: ${board.length}`);
  console.log(`ECR: ${ecr.mode}; sets=${Object.keys(ecr.coverageBySet).join(',')}`);
  console.log(`Actuals: ${actuals ? `${actuals.source}; coverage=${(actuals.coverage * 100).toFixed(1)}%` : 'not supplied'}`);
  console.log(`Records: ${records.length}`);
  for (const [baseline, row] of Object.entries(summary.paired)) {
    console.log(`Projected WTDN vs ${baseline}: ${row.mean.toFixed(3)} ± ${Number.isFinite(row.halfWidth) ? row.halfWidth.toFixed(3) : '∞'}; n=${row.n}; converged=${row.converged}`);
  }
  if (actualSummary) for (const [baseline, row] of Object.entries(actualSummary.paired)) {
    console.log(`Actual WTDN vs ${baseline}: ${row.mean.toFixed(3)} ± ${Number.isFinite(row.halfWidth) ? row.halfWidth.toFixed(3) : '∞'}; n=${row.n}`);
  }
  if (!args.smoke && args.requireEcr && !summary.allPairedConverged) process.exitCode = 2;
}

main();
