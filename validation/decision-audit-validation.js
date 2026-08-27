/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wtdn-decision-audit-'));
const input = path.join(temp, 'decision-log.jsonl.gz');
const output = path.join(temp, 'audit.json');

const outcome = (strength) => ({ rosterStrength: strength, optimalWeeklyStarterPoints: strength / 20 });
const availablePlayers = [
  { name: 'Elite Alpha', position: 'WR', ecr: 4, adp: 5, projectedPoints: 310, vorp: 100 },
  { name: 'Chosen Beta', position: 'RB', ecr: 28, adp: 31, projectedPoints: 270, vorp: 92 },
  { name: 'Other Gamma', position: 'TE', ecr: 40, adp: 42, projectedPoints: 220, vorp: 88 },
];
const decisions = [
  {
    config: '12-ppr', slot: 6, overall: 18, round: 2,
    availablePlayers,
    whoToDraftNextChoice: 'Chosen Beta',
    competingChoices: { ecr: 'Elite Alpha', adp: 'Elite Alpha', projected_points: 'Elite Alpha', vorp: 'Chosen Beta' },
    recommendation: { vor: 78, tierDrop: 5, opportunityCost: 14, survivalProbability: 0.18 },
    downstreamOutcomeByStrategy: { wtdn: outcome(100), ecr: outcome(108), adp: outcome(106), projected_points: outcome(109), vorp: outcome(100) },
  },
  {
    config: '12-ppr-superflex', slot: 6, overall: 42, round: 4,
    availablePlayers,
    whoToDraftNextChoice: 'Elite Alpha',
    competingChoices: { ecr: 'Elite Alpha', adp: 'Elite Alpha', projected_points: 'Elite Alpha', vorp: 'Other Gamma' },
    recommendation: { vor: 90, tierDrop: 2, opportunityCost: 3, survivalProbability: 0.62 },
    downstreamOutcomeByStrategy: { wtdn: outcome(115), ecr: outcome(115), adp: outcome(115), projected_points: outcome(115), vorp: outcome(111) },
  },
];
fs.writeFileSync(input, zlib.gzipSync(`${decisions.map((row) => JSON.stringify(row)).join('\n')}\n`));
const result = spawnSync(process.execPath, [path.join(root, 'benchmark', 'decision-audit.js'), `--input=${input}`, `--output=${output}`], { cwd: root, encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) throw new Error(`decision audit validation failed with status ${result.status}`);

const audit = JSON.parse(fs.readFileSync(output, 'utf8'));
if (audit.decisions !== 2) throw new Error(`expected 2 decisions, got ${audit.decisions}`);
if (!audit.byRound['2|ecr'] || audit.byRound['2|ecr'].disagreements !== 1) throw new Error('round attribution missing ECR disagreement');
if (!audit.bySelectedPosition['RB|ecr']) throw new Error('position attribution missing');
if (!audit.byLeagueConfig['12-ppr|adp']) throw new Error('league config attribution missing');
if (!audit.byDraftSlot['6|projected_points']) throw new Error('draft slot attribution missing');
if (!audit.byRecommendationBehavior['high-wait-cost|ecr']) throw new Error('recommendation behavior attribution missing');
if (!audit.eliteValuePasses.some((row) => row.alternative === 'Elite Alpha' && row.wtdn === 'Chosen Beta')) throw new Error('elite-value pass audit failed to flag obvious pass');
if (!audit.attributionCaveat.includes('not a causal estimate')) throw new Error('causal attribution caveat missing');

fs.rmSync(temp, { recursive: true, force: true });
console.log('decision-level round/position/config/slot/behavior audit validation passed');
