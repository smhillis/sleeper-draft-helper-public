#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

function parseArgs(argv) {
  const args = { samples: 12, seed: 20260826, output: path.join(root, 'benchmark', 'out'), smoke: false, requireEcr: true, convergenceTarget: 0.25, ecr: null, actuals: null };
  for (const arg of argv) {
    if (arg === '--smoke') args.smoke = true;
    else if (arg === '--no-require-ecr') args.requireEcr = false;
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
  }
  return args;
}

function element() {
  return { textContent: '', value: '', style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, onclick: null, innerHTML: '' };
}

function loadEngine() {
  const elements = new Map();
  const context = {
    console,
    URLSearchParams,
    setInterval: () => 0,
    clearInterval: () => {},
    fetch: async () => { throw new Error('network disabled in benchmark'); },
    localStorage: { getItem: () => '', setItem: () => {} },
    history: { replaceState: () => {} },
    location: { pathname: '/', search: '' },
    navigator: {},
    document: { getElementById: (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } },
  };
  context.window = context;
  vm.createContext(context);
  for (const file of ['app.js', 'sleeper-scoring-exhaustive.js', 'draft-strategy.js', 'recommendation-contract.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  if (!context.SleeperDraftEngine || !context.SleeperExhaustiveScoring) throw new Error('Production engine/scoring overlay did not load');
  return { context, engine: context.SleeperDraftEngine, exhaustive: context.SleeperExhaustiveScoring };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function loadBoard(engine) {
  const primary = readJson(path.join(root, 'data', 'rankings.json')).players || [];
  const depth = readJson(path.join(root, 'data', 'depth-rankings.json')).players || [];
  const specialty = readJson(path.join(root, 'data', 'specialty-rankings.json')).players || [];
  const projections = readJson(path.join(root, 'data', 'projections.json')).players || {};
  const board = engine.mergeBoards(primary, depth, specialty);
  return { board, projections: Object.fromEntries(Object.entries(projections).map(([name, p]) => [norm(name), p])) };
}

function loadEcr(args, board) {
  if (!args.ecr || !fs.existsSync(args.ecr)) {
    if (args.requireEcr) throw new Error('Final benchmark requires --ecr=<complete FantasyPros ECR JSON>. Refusing to label the blended production board as ECR.');
    return {
      mode: 'proxy',
      source: 'production-consensusRank-proxy',
      complete: false,
      rankings: Object.fromEntries(board.map((p) => [norm(p.name), num(p.consensusRank, 9999)])),
    };
  }
  const fixture = readJson(args.ecr);
  const rankings = {};
  for (const row of fixture.players || []) rankings[norm(row.name)] = num(row.rank, 9999);
  const coverage = board.filter((p) => Number.isFinite(rankings[norm(p.name)]) && rankings[norm(p.name)] < 9999).length / Math.max(1, board.length);
  if (args.requireEcr && (!fixture.complete || fixture.sourceType !== 'fantasypros-ecr' || coverage < 0.9)) {
    throw new Error(`ECR fixture is not complete enough for final mode (complete=${Boolean(fixture.complete)}, sourceType=${fixture.sourceType || 'missing'}, poolCoverage=${(coverage * 100).toFixed(1)}%).`);
  }
  return { mode: fixture.complete ? 'exact' : 'partial', source: fixture.sourceUrl || args.ecr, complete: Boolean(fixture.complete), rankings, coverage };
}

const CONFIGS = [
  { id: '12-ppr', teams: 12, scoring: 'ppr', passTd: 4, flex: 1, superflex: 0 },
  { id: '12-half-ppr', teams: 12, scoring: 'half', passTd: 4, flex: 1, superflex: 0 },
  { id: '12-standard', teams: 12, scoring: 'standard', passTd: 4, flex: 1, superflex: 0 },
  { id: '10-ppr', teams: 10, scoring: 'ppr', passTd: 4, flex: 1, superflex: 0 },
  { id: '14-ppr', teams: 14, scoring: 'ppr', passTd: 4, flex: 1, superflex: 0 },
  { id: '12-ppr-4pt-pass-td', teams: 12, scoring: 'ppr', passTd: 4, flex: 1, superflex: 0 },
  { id: '12-ppr-6pt-pass-td', teams: 12, scoring: 'ppr', passTd: 6, flex: 1, superflex: 0 },
  { id: '12-ppr-2flex', teams: 12, scoring: 'ppr', passTd: 4, flex: 2, superflex: 0 },
  { id: '12-ppr-superflex', teams: 12, scoring: 'ppr', passTd: 4, flex: 1, superflex: 1 },
];

function scoringSettings(config) {
  const reception = config.scoring === 'ppr' ? 1 : config.scoring === 'half' ? 0.5 : 0;
  return {
    rec: reception,
    pass_yd: 0.04, pass_td: config.passTd, pass_int: -2,
    rush_yd: 0.1, rush_td: 6, rec_yd: 0.1, rec_td: 6, fum_lost: -2,
    fgm: 3, xpm: 1, sack: 1, int: 2, fum_rec: 2, def_td: 6,
  };
}

function rosterPositions(config) {
  const out = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE'];
  for (let i = 0; i < config.flex; i += 1) out.push('FLEX');
  for (let i = 0; i < config.superflex; i += 1) out.push('SUPER_FLEX');
  out.push('K', 'DEF');
  while (out.length < (config.flex + config.superflex > 1 ? 16 : 15)) out.push('BN');
  return out;
}

function draftSlotForOverall(overall, teams) {
  const round = Math.floor((overall - 1) / teams) + 1;
  const inRound = ((overall - 1) % teams) + 1;
  return round % 2 === 1 ? inRound : teams - inRound + 1;
}

function hashUnit(...parts) {
  const digest = crypto.createHash('sha256').update(parts.join('|')).digest();
  return digest.readUInt32BE(0) / 0xffffffff;
}

function opponentChoice(available, overall, seed) {
  let best = null;
  let bestScore = Infinity;
  for (const p of available) {
    const market = num(p.adp, num(p.consensusRank, 999));
    const noise = (hashUnit(seed, overall, p.name) - 0.5) * 22;
    const score = Math.abs((market + noise) - overall);
    if (score < bestScore || (score === bestScore && String(p.name) < String(best?.name || ''))) {
      best = p; bestScore = score;
    }
  }
  return best;
}

function resetEngine(engine, board, projections, config, slot) {
  Object.assign(engine.state, {
    board,
    projections,
    picks: [], slot,
    user: { user_id: 'benchmark-user', username: 'benchmark' },
    league: {
      league_id: `benchmark-${config.id}`,
      name: config.id,
      total_rosters: config.teams,
      roster_positions: rosterPositions(config),
      scoring_settings: scoringSettings(config),
    },
    draft: { status: 'drafting' },
    rosters: [{ roster_id: 1, owner_id: 'benchmark-user' }],
    showMoreRecommendations: false,
  });
}

function pickName(pick) { return String(pick?.metadata?.first_name || ''); }
function ownPicks(engine, slot) { return engine.state.picks.filter((p) => Number(p.draft_slot) === Number(slot)); }
function countByPos(rows) { return rows.reduce((acc, p) => { const pos = p.pos || p.metadata?.position; acc[pos] = (acc[pos] || 0) + 1; return acc; }, {}); }

function baselineGuardCandidates(available, own, config) {
  if (!available.length) return available;
  const rounds = rosterPositions(config).length;
  const remaining = rounds - own.length;
  const counts = countByPos(own.map((p) => ({ pos: p.metadata?.position })));
  const missingK = Math.max(0, 1 - num(counts.K));
  const missingDef = Math.max(0, 1 - num(counts.DEF));
  if (remaining <= missingK + missingDef && (missingK + missingDef) > 0) {
    const need = new Set([missingK ? 'K' : null, missingDef ? 'DEF' : null].filter(Boolean));
    const forced = available.filter((p) => need.has(p.pos));
    if (forced.length) return forced;
  }
  if (remaining > 2) {
    const nonSpecialty = available.filter((p) => !['K', 'DEF'].includes(p.pos));
    if (nonSpecialty.length) available = nonSpecialty;
  }
  const direct = { QB: 1, RB: 2, WR: 2, TE: 1 };
  const missingDirect = Object.entries(direct).filter(([pos, need]) => num(counts[pos]) < need).map(([pos]) => pos);
  const skillCount = num(counts.RB) + num(counts.WR) + num(counts.TE);
  const skillNeed = 5 + config.flex;
  const sfPool = num(counts.QB) + skillCount;
  const sfNeed = 1 + skillNeed + config.superflex;
  const critical = missingDirect.length + Math.max(0, skillNeed - skillCount - missingDirect.filter((p) => ['RB', 'WR', 'TE'].includes(p)).length) + Math.max(0, sfNeed - sfPool);
  if (remaining <= critical + 2 && critical > 0) {
    const allowed = new Set(missingDirect);
    if (skillCount < skillNeed) ['RB', 'WR', 'TE'].forEach((p) => allowed.add(p));
    if (config.superflex && sfPool < sfNeed) ['QB', 'RB', 'WR', 'TE'].forEach((p) => allowed.add(p));
    const forced = available.filter((p) => allowed.has(p.pos));
    if (forced.length) return forced;
  }
  return available;
}

function replacementLevels(board, pointsMap, config) {
  const profile = { QB: 1 + config.superflex * 0.85, RB: 2 + config.flex * 0.4 + config.superflex * 0.04, WR: 2 + config.flex * 0.45 + config.superflex * 0.06, TE: 1 + config.flex * 0.15 + config.superflex * 0.05, K: 1, DEF: 1 };
  const byPos = {};
  for (const p of board) (byPos[p.pos] ||= []).push(pointsMap.get(norm(p.name)) || 0);
  const levels = {};
  for (const [pos, values] of Object.entries(byPos)) {
    values.sort((a, b) => b - a);
    const index = clamp(Math.round(config.teams * num(profile[pos], 1)) - 1, 0, Math.max(0, values.length - 1));
    levels[pos] = values[index] || values[values.length - 1] || 0;
  }
  return levels;
}

function chooseBaseline(strategy, available, own, config, ecr, pointsMap, replacements) {
  const candidates = baselineGuardCandidates([...available], own, config);
  const ranked = candidates.map((p) => {
    const points = pointsMap.get(norm(p.name)) || 0;
    let metric;
    if (strategy === 'ecr') metric = -num(ecr.rankings[norm(p.name)], 99999);
    else if (strategy === 'adp') metric = -num(p.adp, 99999);
    else if (strategy === 'projected_points') metric = points;
    else if (strategy === 'vorp') metric = points - num(replacements[p.pos], 0);
    else throw new Error(`Unknown baseline ${strategy}`);
    return { p, metric };
  }).sort((a, b) => b.metric - a.metric || num(a.p.adp, 9999) - num(b.p.adp, 9999) || String(a.p.name).localeCompare(String(b.p.name)));
  return ranked[0]?.p || null;
}

function makePointsMap(engine, exhaustive, board, config) {
  const scoring = scoringSettings(config);
  const map = new Map();
  for (const p of board) {
    const projection = engine.projectionFor(p);
    map.set(norm(p.name), exhaustive.projectedPoints(projection, scoring));
  }
  return map;
}

function eligibleSlots(pos, slots) {
  const result = [];
  slots.forEach((slot, index) => {
    if (slot === pos) result.push(index);
    else if (slot === 'FLEX' && ['RB', 'WR', 'TE'].includes(pos)) result.push(index);
    else if (slot === 'SUPER_FLEX' && ['QB', 'RB', 'WR', 'TE'].includes(pos)) result.push(index);
  });
  return result;
}

function optimalStarterPoints(roster, pointsMap, config) {
  const slots = rosterPositions(config).filter((s) => s !== 'BN');
  let states = new Map([[0, 0]]);
  for (const p of roster) {
    const points = pointsMap.get(norm(p.name)) || 0;
    const choices = eligibleSlots(p.pos, slots);
    const next = new Map(states);
    for (const [mask, value] of states.entries()) {
      for (const slotIndex of choices) {
        const bit = 1 << slotIndex;
        if (mask & bit) continue;
        const newMask = mask | bit;
        const newValue = value + points;
        if (newValue > (next.get(newMask) ?? -Infinity)) next.set(newMask, newValue);
      }
    }
    states = next;
  }
  let best = 0;
  for (const value of states.values()) best = Math.max(best, value);
  return best;
}

function evaluateRoster(roster, pointsMap, replacements, config) {
  const total = roster.reduce((sum, p) => sum + (pointsMap.get(norm(p.name)) || 0), 0);
  const starterSeason = optimalStarterPoints(roster, pointsMap, config);
  const benchSeason = Math.max(0, total - starterSeason);
  const counts = countByPos(roster);
  const riskSeason = roster.reduce((sum, p) => {
    const confidence = clamp(num(p.confidence, 0.65), 0.35, 1);
    const range = Math.max(0, num(p.expertLow, num(p.consensusRank, 0)) - num(p.expertHigh, num(p.consensusRank, 0)));
    const points = pointsMap.get(norm(p.name)) || 0;
    return sum + points * (1 - confidence) * 0.35 + range * 0.08;
  }, 0);
  const replacementAdvSeason = roster.reduce((sum, p) => sum + Math.max(0, (pointsMap.get(norm(p.name)) || 0) - num(replacements[p.pos], 0)), 0);
  const missing = [['QB', 1], ['RB', 2], ['WR', 2], ['TE', 1], ['K', 1], ['DEF', 1]].reduce((sum, [pos, needed]) => sum + Math.max(0, needed - num(counts[pos])), 0);
  const concentration = Math.max(0, ...Object.values(counts)) / Math.max(1, roster.length);
  const balance = clamp(1 - missing * 0.15 - Math.max(0, concentration - 0.4), 0, 1);
  const weeklyStarter = starterSeason / 17;
  const weeklyBench = benchSeason / 17;
  const weeklyReplacementAdv = replacementAdvSeason / 17;
  const weeklyRisk = riskSeason / 17;
  const rosterStrength = weeklyStarter + weeklyBench * 0.12 + weeklyReplacementAdv * 0.08 + balance * 2 - weeklyRisk * 0.10;
  const positionalStrength = Object.fromEntries(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((pos) => {
    const values = roster.filter((p) => p.pos === pos).map((p) => pointsMap.get(norm(p.name)) || 0).sort((a, b) => b - a);
    return [pos, values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0];
  }));
  return { rosterStrength, projectedSeasonPoints: total, optimalStarterSeasonPoints: starterSeason, optimalWeeklyStarterPoints: weeklyStarter, benchValue: benchSeason, replacementLevelAdvantage: replacementAdvSeason, rosterBalance: balance, riskDownsideExposure: riskSeason, positionalStrength, counts };
}

function appendPick(engine, chosen, overall, draftSlot) {
  engine.state.picks.push({
    draft_slot: draftSlot,
    pick_no: overall,
    round: Math.floor((overall - 1) / num(engine.state.league.total_rosters, 12)) + 1,
    metadata: { first_name: chosen.name, last_name: '', position: chosen.pos, team: chosen.team },
  });
}

function simulateStrategy({ strategy, engine, exhaustive, board, projections, config, slot, seed, ecr }) {
  resetEngine(engine, board, projections, config, slot);
  const pointsMap = makePointsMap(engine, exhaustive, board, config);
  const replacements = replacementLevels(board, pointsMap, config);
  const rounds = rosterPositions(config).length;
  const maxOverall = config.teams * rounds;
  const decisionSnapshots = [];
  for (let overall = 1; overall <= maxOverall; overall += 1) {
    const gone = new Set(engine.state.picks.map((p) => norm(pickName(p))));
    const available = board.filter((p) => !gone.has(norm(p.name)));
    if (!available.length) break;
    const draftSlot = draftSlotForOverall(overall, config.teams);
    let chosen;
    if (draftSlot === slot) {
      const own = ownPicks(engine, slot);
      if (strategy === 'wtdn') chosen = engine.recommendations()[0];
      else chosen = chooseBaseline(strategy, available, own, config, ecr, pointsMap, replacements);
      if (!chosen) throw new Error(`No ${strategy} choice for ${config.id} slot ${slot} pick ${overall}`);
      if (strategy === 'wtdn') {
        const counterfactualChoices = {};
        for (const baseline of ['ecr', 'adp', 'projected_points', 'vorp']) {
          counterfactualChoices[baseline] = chooseBaseline(baseline, available, own, config, ecr, pointsMap, replacements)?.name || null;
        }
        decisionSnapshots.push({
          config: config.id, seed, slot, overall, round: Math.floor((overall - 1) / config.teams) + 1,
          rosterBefore: own.map((p) => ({ name: pickName(p), position: p.metadata?.position })),
          availablePlayers: available.map((p) => ({ name: p.name, position: p.pos, adp: num(p.adp, null), ecr: num(ecr.rankings[norm(p.name)], null), projectedPoints: pointsMap.get(norm(p.name)) || 0, vorp: (pointsMap.get(norm(p.name)) || 0) - num(replacements[p.pos], 0) })),
          whoToDraftNextChoice: chosen.name,
          competingChoices: counterfactualChoices,
          recommendation: chosen.recommendation || null,
        });
      }
    } else chosen = opponentChoice(available, overall, seed);
    appendPick(engine, chosen, overall, draftSlot);
  }
  const roster = ownPicks(engine, slot).map((p) => board.find((row) => norm(row.name) === norm(pickName(p)))).filter(Boolean);
  return { strategy, roster, outcome: evaluateRoster(roster, pointsMap, replacements, config), decisions: decisionSnapshots };
}

function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function stdev(values) { if (values.length < 2) return 0; const m = mean(values); return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)); }
function ci95(values) { const m = mean(values); const halfWidth = values.length > 1 ? 1.96 * stdev(values) / Math.sqrt(values.length) : Infinity; return { mean: m, halfWidth, low: m - halfWidth, high: m + halfWidth, n: values.length }; }

function aggregate(records, convergenceTarget) {
  const strategies = ['wtdn', 'ecr', 'adp', 'projected_points', 'vorp'];
  const byStrategy = {};
  for (const strategy of strategies) {
    const rows = records.filter((r) => r.strategy === strategy);
    const strengths = rows.map((r) => r.outcome.rosterStrength);
    const starters = rows.map((r) => r.outcome.optimalWeeklyStarterPoints);
    byStrategy[strategy] = {
      drafts: rows.length,
      rosterStrength: ci95(strengths),
      optimalWeeklyStarterPoints: ci95(starters),
      averageProjectedFinalRosterStrength: mean(strengths),
      averageProjectedSeasonPoints: mean(rows.map((r) => r.outcome.projectedSeasonPoints)),
      averageBenchValue: mean(rows.map((r) => r.outcome.benchValue)),
      averageReplacementLevelAdvantage: mean(rows.map((r) => r.outcome.replacementLevelAdvantage)),
      averageRosterBalance: mean(rows.map((r) => r.outcome.rosterBalance)),
      averageRiskDownsideExposure: mean(rows.map((r) => r.outcome.riskDownsideExposure)),
    };
  }
  const paired = {};
  for (const baseline of strategies.slice(1)) {
    const index = new Map(records.filter((r) => r.strategy === baseline).map((r) => [`${r.config}|${r.seed}|${r.slot}`, r]));
    const diffs = records.filter((r) => r.strategy === 'wtdn').map((r) => r.outcome.rosterStrength - index.get(`${r.config}|${r.seed}|${r.slot}`)?.outcome.rosterStrength).filter(Number.isFinite);
    const interval = ci95(diffs);
    paired[baseline] = { ...interval, converged: interval.n >= 200 && interval.halfWidth <= convergenceTarget, winRate: diffs.length ? diffs.filter((d) => d > 0).length / diffs.length : 0, tieRate: diffs.length ? diffs.filter((d) => Math.abs(d) < 1e-9).length / diffs.length : 0 };
  }
  const allStrengths = records.map((r) => r.outcome.rosterStrength).sort((a, b) => a - b);
  const lowCut = allStrengths[Math.floor(allStrengths.length * 0.10)] ?? -Infinity;
  const highCut = allStrengths[Math.floor(allStrengths.length * 0.90)] ?? Infinity;
  for (const strategy of strategies) {
    const rows = records.filter((r) => r.strategy === strategy);
    byStrategy[strategy].top10Rate = rows.length ? rows.filter((r) => r.outcome.rosterStrength >= highCut).length / rows.length : 0;
    byStrategy[strategy].bottom10Rate = rows.length ? rows.filter((r) => r.outcome.rosterStrength <= lowCut).length / rows.length : 0;
  }
  return { byStrategy, paired, convergenceTarget, allPairedConverged: Object.values(paired).every((p) => p.converged) };
}

function groupedAnalysis(records) {
  const result = {};
  for (const field of ['config', 'slot']) {
    const keys = [...new Set(records.map((r) => String(r[field])))];
    result[field] = Object.fromEntries(keys.map((key) => {
      const rows = records.filter((r) => String(r[field]) === key);
      const w = rows.filter((r) => r.strategy === 'wtdn');
      const b = rows.filter((r) => r.strategy === 'adp');
      const bMap = new Map(b.map((r) => [`${r.config}|${r.seed}|${r.slot}`, r]));
      const diffs = w.map((r) => r.outcome.rosterStrength - bMap.get(`${r.config}|${r.seed}|${r.slot}`)?.outcome.rosterStrength).filter(Number.isFinite);
      return [key, ci95(diffs)];
    }));
  }
  return result;
}

function writeReport(file, metadata, summary, grouped) {
  const status = metadata.finalEligible && summary.allPairedConverged ? 'FINAL-ELIGIBLE' : 'PRELIMINARY / NOT FINAL';
  const lines = [
    '# WhoToDraftNext Phase 2 Benchmark', '',
    `**Status:** ${status}`, '',
    `Generated: ${metadata.generatedAt}`, `ECR mode: ${metadata.ecrMode} (${metadata.ecrSource})`, `Draft scenarios: ${metadata.records}`, `Samples per slot/config: ${metadata.samples}`, `95% CI convergence target: ±${metadata.convergenceTarget.toFixed(2)} roster-strength points`, '',
    '## Headline comparison', '',
    '| Strategy | Avg roster strength | Weekly starter pts | Win rate vs WTDN | Top 10% | Bottom 10% |',
    '|---|---:|---:|---:|---:|---:|',
  ];
  for (const [strategy, row] of Object.entries(summary.byStrategy)) {
    const pair = strategy === 'wtdn' ? null : summary.paired[strategy];
    lines.push(`| ${strategy} | ${row.averageProjectedFinalRosterStrength.toFixed(2)} | ${row.optimalWeeklyStarterPoints.mean.toFixed(2)} | ${pair ? ((1 - pair.winRate - pair.tieRate) * 100).toFixed(1) + '%' : '—'} | ${(row.top10Rate * 100).toFixed(1)}% | ${(row.bottom10Rate * 100).toFixed(1)}% |`);
  }
  lines.push('', '## Paired WhoToDraftNext advantage', '');
  for (const [baseline, row] of Object.entries(summary.paired)) lines.push(`- vs ${baseline}: ${row.mean.toFixed(3)} ± ${Number.isFinite(row.halfWidth) ? row.halfWidth.toFixed(3) : '∞'} (95% CI, n=${row.n}); WTDN win rate ${(row.winRate * 100).toFixed(1)}%; converged=${row.converged}.`);
  lines.push('', '## Required questions', '',
    '1. **Does WhoToDraftNext consistently outperform ECR, ADP, and projected-points drafting?** Not considered final until exact ECR coverage is complete and every paired CI meets the convergence target.',
    '2. **By how much?** See paired differences above. These are projected/preseason model outcomes, not realized-season wins.',
    '3. **Which rounds gain or lose the most value?** Decision-level logs preserve every WTDN state and counterfactual choice; round-level attribution is intentionally deferred until the final sample is converged.',
    '4. **Which league settings increase or reduce its advantage?** See `grouped.json`; final narrative waits for convergence.',
    '5. **Which recommendation behaviors hurt results?** Flag only after converged decision-level attribution. No engine change is authorized from smoke/preliminary output.',
    '6. **Does the engine get too clever and pass obvious elite value?** The decision log retains available pools, WTDN choice, ECR/ADP/projected/VORP counterfactuals, and normalized recommendation components for this audit.',
    '7. **What changes should be made?** None from preliminary runs. Evidence-backed changes require a separately validated branch after final benchmark completion.', '',
    '## Reproducibility and post-2026 rerun', '',
    'The harness accepts `--actuals=<json>` as a preserved input hook for post-season realized production. Preseason projection results and post-season actual results must be kept separate so projection error is not confused with recommendation-strategy error.', '',
    '## Guardrails', '',
    '- All strategies use the same league configuration, player pool, projections, draft slot, and deterministic opponent preference function.',
    '- Competitor strategies share only basic roster-legality/end-game completion guardrails. They do not inherit WTDN VOR/survival/wait-cost scoring.',
    '- Final mode refuses to call the production blended consensus board FantasyPros ECR. A complete ECR fixture is mandatory.',
    '- No recommendation-engine tuning is performed inside the benchmark harness.', '',
    '## ADP comparison by league/slot', '',
    'See `grouped.json` for paired estimates by league configuration and draft slot.', ''
  );
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { engine, exhaustive } = loadEngine();
  const { board, projections } = loadBoard(engine);
  if (board.length < 120) throw new Error(`Benchmark player pool too small: ${board.length}`);
  const ecr = loadEcr(args, board);
  const configs = args.smoke ? [CONFIGS[0], CONFIGS[8]] : CONFIGS;
  const strategies = ['wtdn', 'ecr', 'adp', 'projected_points', 'vorp'];
  const records = [];
  ensureDir(args.output);
  const decisionFile = path.join(args.output, 'decision-log.jsonl.gz');
  const gzip = zlib.createGzip({ level: 6 });
  const stream = fs.createWriteStream(decisionFile);
  gzip.pipe(stream);

  for (const config of configs) {
    for (let slot = 1; slot <= config.teams; slot += 1) {
      for (let sample = 0; sample < args.samples; sample += 1) {
        const seed = args.seed + sample * 1009 + slot * 101 + config.id.length * 7919;
        const outcomes = {};
        let wtdnDecisions = [];
        for (const strategy of strategies) {
          const result = simulateStrategy({ strategy, engine, exhaustive, board, projections, config, slot, seed, ecr });
          const record = { config: config.id, teams: config.teams, slot, seed, strategy, outcome: result.outcome, roster: result.roster.map((p) => ({ name: p.name, position: p.pos, adp: p.adp, consensusRank: p.consensusRank })) };
          records.push(record);
          outcomes[strategy] = result.outcome;
          if (strategy === 'wtdn') wtdnDecisions = result.decisions;
        }
        for (const decision of wtdnDecisions) gzip.write(`${JSON.stringify({ ...decision, downstreamOutcomeByStrategy: outcomes })}\n`);
      }
    }
  }
  gzip.end();

  const summary = aggregate(records, args.convergenceTarget);
  const grouped = groupedAnalysis(records);
  const metadata = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    seed: args.seed,
    samples: args.samples,
    configs: configs.map((c) => c.id),
    strategies,
    records: records.length,
    playerPool: board.length,
    ecrMode: ecr.mode,
    ecrSource: ecr.source,
    ecrCoverage: ecr.coverage ?? null,
    convergenceTarget: args.convergenceTarget,
    allPairedConverged: summary.allPairedConverged,
    finalEligible: ecr.mode === 'exact' && Boolean(ecr.complete),
    actualsHook: args.actuals || null,
  };
  fs.writeFileSync(path.join(args.output, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  fs.writeFileSync(path.join(args.output, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.writeFileSync(path.join(args.output, 'grouped.json'), `${JSON.stringify(grouped, null, 2)}\n`);
  fs.writeFileSync(path.join(args.output, 'rosters.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  writeReport(path.join(args.output, 'report.md'), metadata, summary, grouped);

  console.log('WHO TO DRAFT NEXT — PHASE 2 BENCHMARK');
  console.log(`Mode: ${args.smoke ? 'smoke' : 'benchmark'}`);
  console.log(`Player pool: ${board.length}`);
  console.log(`ECR: ${ecr.mode}`);
  console.log(`Records: ${records.length}`);
  for (const [baseline, row] of Object.entries(summary.paired)) console.log(`WTDN vs ${baseline}: ${row.mean.toFixed(3)} ± ${Number.isFinite(row.halfWidth) ? row.halfWidth.toFixed(3) : '∞'}; n=${row.n}; converged=${row.converged}`);
  if (!args.smoke && args.requireEcr && !summary.allPairedConverged) process.exitCode = 2;
}

main();
