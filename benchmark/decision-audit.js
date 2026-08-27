#!/usr/bin/env node
/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');

const BASELINES = ['ecr', 'adp', 'projected_points', 'vorp'];
const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function parseArgs(argv) {
  const args = { input: null, output: null, eliteEcrGap: 12, eliteAdpGap: 15, eliteProjectedPct: 0.08 };
  for (const arg of argv) {
    if (arg.startsWith('--input=')) args.input = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--output=')) args.output = path.resolve(arg.split('=').slice(1).join('='));
    else if (arg.startsWith('--elite-ecr-gap=')) args.eliteEcrGap = Math.max(1, num(arg.split('=')[1], args.eliteEcrGap));
    else if (arg.startsWith('--elite-adp-gap=')) args.eliteAdpGap = Math.max(1, num(arg.split('=')[1], args.eliteAdpGap));
    else if (arg.startsWith('--elite-projected-pct=')) args.eliteProjectedPct = Math.max(0.01, num(arg.split('=')[1], args.eliteProjectedPct));
  }
  if (!args.input) throw new Error('decision audit requires --input=<decision-log.jsonl.gz>');
  if (!args.output) args.output = path.join(path.dirname(args.input), 'decision-audit.json');
  return args;
}

function playerByName(decision, name) {
  const key = norm(name);
  return (decision.availablePlayers || []).find((player) => norm(player.name) === key) || null;
}

function outcomeStrength(outcome) { return num(outcome?.rosterStrength); }

function recommendationComponents(recommendation) {
  const components = recommendation?.scoreComponents || recommendation?.components || {};
  const strategy = recommendation?.strategy || {};
  return {
    vor: num(recommendation?.vor, num(strategy?.vor)),
    tierDrop: num(recommendation?.tierDrop, num(strategy?.tierDrop)),
    survival: num(recommendation?.nextPickSurvival, num(recommendation?.survivalProbability, num(strategy?.survivalProbability))),
    waitCost: num(recommendation?.waitCost, num(recommendation?.opportunityCost, num(strategy?.opportunityCost))),
    scoring: num(components?.scoring, num(components?.scoringAdjustment)),
    roster: num(components?.roster, num(components?.rosterNeed)),
  };
}

function behaviorBucket(decision) {
  const c = recommendationComponents(decision.recommendation);
  if (c.waitCost != null && c.waitCost >= 12) return 'high-wait-cost';
  if (c.survival != null && c.survival <= 0.25) return 'low-survival-urgency';
  if (c.tierDrop != null && c.tierDrop >= 4) return 'large-tier-drop';
  if (c.vor != null && c.vor >= 60) return 'high-vor';
  if (c.roster != null && Math.abs(c.roster) >= 5) return 'roster-fit-heavy';
  if (c.scoring != null && Math.abs(c.scoring) >= 5) return 'league-scoring-heavy';
  return 'other';
}

function elitePass(decision, baseline, args) {
  const wName = decision.whoToDraftNextChoice;
  const bName = decision.competingChoices?.[baseline];
  if (!wName || !bName || norm(wName) === norm(bName)) return null;
  const w = playerByName(decision, wName);
  const b = playerByName(decision, bName);
  if (!w || !b) return null;

  const ecrGap = num(w.ecr) != null && num(b.ecr) != null ? num(w.ecr) - num(b.ecr) : null;
  const adpGap = num(w.adp) != null && num(b.adp) != null ? num(w.adp) - num(b.adp) : null;
  const projectedGap = num(w.projectedPoints) != null && num(b.projectedPoints) != null ? num(b.projectedPoints) - num(w.projectedPoints) : null;
  const projectedPct = projectedGap != null && num(w.projectedPoints, 0) > 0 ? projectedGap / num(w.projectedPoints) : null;
  const flags = [];
  if (ecrGap != null && ecrGap >= args.eliteEcrGap) flags.push(`ECR gap ${ecrGap.toFixed(1)}`);
  if (adpGap != null && adpGap >= args.eliteAdpGap) flags.push(`ADP gap ${adpGap.toFixed(1)}`);
  if (projectedPct != null && projectedPct >= args.eliteProjectedPct) flags.push(`projected points +${(projectedPct * 100).toFixed(1)}%`);
  if (!flags.length) return null;
  return { baseline, wtdn: wName, alternative: bName, ecrGap, adpGap, projectedGap, projectedPct, flags };
}

function statBucket() {
  return { decisions: 0, disagreements: 0, sumDraftDelta: 0, draftDeltaCount: 0, positiveDraftDelta: 0, negativeDraftDelta: 0, elitePasses: 0 };
}

function addBucket(map, key, disagreement, delta, elite) {
  const bucket = map[key] ||= statBucket();
  bucket.decisions += 1;
  if (disagreement) bucket.disagreements += 1;
  if (Number.isFinite(delta)) {
    bucket.sumDraftDelta += delta;
    bucket.draftDeltaCount += 1;
    if (delta > 0) bucket.positiveDraftDelta += 1;
    if (delta < 0) bucket.negativeDraftDelta += 1;
  }
  if (elite) bucket.elitePasses += 1;
}

function finalizeBuckets(map) {
  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => String(a).localeCompare(String(b), undefined, { numeric: true })).map(([key, value]) => [key, {
    ...value,
    disagreementRate: value.decisions ? value.disagreements / value.decisions : 0,
    meanAssociatedDraftDelta: value.draftDeltaCount ? value.sumDraftDelta / value.draftDeltaCount : null,
    positiveDraftDeltaRate: value.draftDeltaCount ? value.positiveDraftDelta / value.draftDeltaCount : null,
    negativeDraftDeltaRate: value.draftDeltaCount ? value.negativeDraftDelta / value.draftDeltaCount : null,
  }]));
}

async function audit(args) {
  if (!fs.existsSync(args.input)) throw new Error(`decision log not found: ${args.input}`);
  const input = fs.createReadStream(args.input).pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  const dimensions = { round: {}, position: {}, config: {}, slot: {}, behavior: {} };
  const baselineSummary = Object.fromEntries(BASELINES.map((baseline) => [baseline, statBucket()]));
  const elitePasses = [];
  let decisions = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const decision = JSON.parse(line);
    decisions += 1;
    const wName = decision.whoToDraftNextChoice;
    const w = playerByName(decision, wName);
    const position = w?.position || decision.recommendation?.player?.position || 'UNKNOWN';
    const behavior = behaviorBucket(decision);
    for (const baseline of BASELINES) {
      const bName = decision.competingChoices?.[baseline];
      if (!bName) continue;
      const disagreement = norm(wName) !== norm(bName);
      const wStrength = outcomeStrength(decision.downstreamOutcomeByStrategy?.wtdn);
      const bStrength = outcomeStrength(decision.downstreamOutcomeByStrategy?.[baseline]);
      const delta = Number.isFinite(wStrength) && Number.isFinite(bStrength) ? wStrength - bStrength : null;
      const elite = elitePass(decision, baseline, args);
      addBucket(baselineSummary, baseline, disagreement, delta, elite);
      addBucket(dimensions.round, `${decision.round || 'unknown'}|${baseline}`, disagreement, delta, elite);
      addBucket(dimensions.position, `${position}|${baseline}`, disagreement, delta, elite);
      addBucket(dimensions.config, `${decision.config || 'unknown'}|${baseline}`, disagreement, delta, elite);
      addBucket(dimensions.slot, `${decision.slot || 'unknown'}|${baseline}`, disagreement, delta, elite);
      addBucket(dimensions.behavior, `${behavior}|${baseline}`, disagreement, delta, elite);
      if (elite && elitePasses.length < 500) elitePasses.push({
        config: decision.config, slot: decision.slot, round: decision.round, overall: decision.overall,
        behavior, associatedDraftDelta: delta, ...elite,
      });
    }
  }

  elitePasses.sort((a, b) => (num(b.ecrGap, -Infinity) - num(a.ecrGap, -Infinity)) || (num(b.adpGap, -Infinity) - num(a.adpGap, -Infinity)));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    input: path.basename(args.input),
    decisions,
    attributionCaveat: 'Associated draft delta is the final paired roster-strength difference for the draft containing the decision. It is descriptive attribution, not a causal estimate of one pick in isolation.',
    elitePassThresholds: { ecrRankGap: args.eliteEcrGap, adpGap: args.eliteAdpGap, projectedPointsPct: args.eliteProjectedPct },
    byBaseline: finalizeBuckets(baselineSummary),
    byRound: finalizeBuckets(dimensions.round),
    bySelectedPosition: finalizeBuckets(dimensions.position),
    byLeagueConfig: finalizeBuckets(dimensions.config),
    byDraftSlot: finalizeBuckets(dimensions.slot),
    byRecommendationBehavior: finalizeBuckets(dimensions.behavior),
    eliteValuePasses: elitePasses,
  };
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`decision audit: ${decisions} WTDN decisions; ${elitePasses.length} retained elite-value-pass flags -> ${args.output}`);
  return report;
}

if (require.main === module) {
  audit(parseArgs(process.argv.slice(2))).catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}

module.exports = { audit, elitePass, behaviorBucket };
