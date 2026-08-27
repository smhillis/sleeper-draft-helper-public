#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const BASELINES = ['ecr', 'adp', 'projected_points', 'vorp'];
const METRICS = ['rosterStrength', 'optimalWeeklyStarterPoints', 'benchValue', 'replacementLevelAdvantage', 'rosterBalance', 'riskDownsideExposure'];
const num = (v) => Number.isFinite(Number(v)) ? Number(v) : null;
const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
function ci95(xs) {
  if (!xs.length) return { n: 0, mean: null, stdev: null, halfWidth: null };
  const m = mean(xs);
  if (xs.length < 2) return { n: xs.length, mean: m, stdev: null, halfWidth: Infinity };
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
  return { n: xs.length, mean: m, stdev: sd, halfWidth: 1.96 * sd / Math.sqrt(xs.length) };
}
function neededN(sd, target, minN = 200) {
  if (!Number.isFinite(sd) || sd <= 0) return minN;
  return Math.max(minN, Math.ceil((1.96 * sd / target) ** 2));
}
function parseArgs(argv) {
  const args = { input: null, output: null, target: 0.25 };
  for (const arg of argv) {
    if (arg.startsWith('--input=')) args.input = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--output=')) args.output = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--target=')) args.target = Math.max(0.01, Number(arg.split('=')[1]) || args.target);
  }
  if (!args.input) throw new Error('roster analysis requires --input=<rosters.jsonl>');
  if (!args.output) args.output = path.join(path.dirname(args.input), 'roster-analysis.json');
  return args;
}
function push(map, key, value) { if (Number.isFinite(value)) (map[key] ||= []).push(value); }
async function analyze(args) {
  const rows = [];
  const rl = readline.createInterface({ input: fs.createReadStream(args.input), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) rows.push(JSON.parse(line));
  const byTrial = new Map();
  for (const row of rows) {
    const key = `${row.config}|${row.seed}|${row.slot}`;
    if (!byTrial.has(key)) byTrial.set(key, {});
    byTrial.get(key)[row.strategy] = row;
  }
  const paired = { overall: {}, config: {}, slot: {}, configSlot: {} };
  for (const baseline of BASELINES) {
    const overall = [];
    for (const trial of byTrial.values()) {
      const w = trial.wtdn, b = trial[baseline];
      const delta = num(w?.outcome?.rosterStrength) - num(b?.outcome?.rosterStrength);
      if (!Number.isFinite(delta)) continue;
      overall.push(delta);
      push(paired.config, `${w.config}|${baseline}`, delta);
      push(paired.slot, `${w.slot}|${baseline}`, delta);
      push(paired.configSlot, `${w.config}|${w.slot}|${baseline}`, delta);
    }
    paired.overall[baseline] = overall;
  }
  function summarizeMap(map) {
    return Object.fromEntries(Object.entries(map).map(([key, values]) => {
      const ci = ci95(values);
      return [key, { ...ci, target: args.target, converged: ci.n >= 200 && ci.halfWidth <= args.target, recommendedN: neededN(ci.stdev, args.target) }];
    }));
  }
  const strategyMetrics = {};
  for (const strategy of ['wtdn', ...BASELINES]) {
    const sr = rows.filter((r) => r.strategy === strategy);
    const metrics = {};
    for (const metric of METRICS) metrics[metric] = mean(sr.map((r) => num(r.outcome?.[metric])).filter(Number.isFinite));
    const positions = {};
    for (const row of sr) for (const [pos, value] of Object.entries(row.outcome?.positionalStrength || {})) push(positions, pos, num(value));
    metrics.positionalStrength = Object.fromEntries(Object.entries(positions).map(([pos, values]) => [pos, mean(values)]));
    strategyMetrics[strategy] = metrics;
  }
  const overall = Object.fromEntries(Object.entries(paired.overall).map(([key, values]) => {
    const ci = ci95(values); return [key, { ...ci, target: args.target, converged: ci.n >= 200 && ci.halfWidth <= args.target, recommendedN: neededN(ci.stdev, args.target) }];
  }));
  const configSlot = summarizeMap(paired.configSlot);
  const worstRecommendedN = Math.max(200, ...Object.values(configSlot).map((x) => x.recommendedN || 0));
  const report = {
    schemaVersion: 1, generatedAt: new Date().toISOString(), rows: rows.length, pairedTrials: byTrial.size,
    targetHalfWidth: args.target, strategyMetrics, pairedOverall: overall,
    pairedByConfig: summarizeMap(paired.config), pairedBySlot: summarizeMap(paired.slot), pairedByConfigSlot: configSlot,
    samplePlanning: {
      minimumPairedN: 200,
      worstCellRecommendedPairedN: worstRecommendedN,
      note: 'recommendedN uses the observed paired standard deviation and normal 95% CI approximation. Re-run in batches and confirm intervals stabilize; do not treat this estimate as a guarantee.'
    }
  };
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`roster analysis: ${rows.length} records, ${byTrial.size} paired trials; worst config/slot recommended n=${worstRecommendedN}`);
  return report;
}
if (require.main === module) analyze(parseArgs(process.argv.slice(2))).catch((e) => { console.error(e.stack || e.message); process.exitCode = 1; });
module.exports = { analyze, ci95, neededN };
