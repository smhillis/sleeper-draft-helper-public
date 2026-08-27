/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wtdn-roster-analysis-'));
const input = path.join(temp, 'rosters.jsonl');
const output = path.join(temp, 'analysis.json');
const outcome = (strength, rb) => ({ rosterStrength: strength, optimalWeeklyStarterPoints: strength / 10, benchValue: 25, replacementLevelAdvantage: 40, rosterBalance: 0.9, riskDownsideExposure: 5, positionalStrength: { RB: rb, WR: 80 } });
const rows = [];
for (let i = 0; i < 220; i += 1) {
  const seed = 1000 + i;
  rows.push({ config: '12-ppr', slot: 6, seed, strategy: 'wtdn', outcome: outcome(110 + (i % 3), 90) });
  rows.push({ config: '12-ppr', slot: 6, seed, strategy: 'ecr', outcome: outcome(108 + (i % 3), 88) });
  rows.push({ config: '12-ppr', slot: 6, seed, strategy: 'adp', outcome: outcome(107 + (i % 3), 87) });
  rows.push({ config: '12-ppr', slot: 6, seed, strategy: 'projected_points', outcome: outcome(106 + (i % 3), 86) });
  rows.push({ config: '12-ppr', slot: 6, seed, strategy: 'vorp', outcome: outcome(109 + (i % 3), 89) });
}
fs.writeFileSync(input, `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);
const result = spawnSync(process.execPath, [path.join(root, 'benchmark', 'roster-analysis.js'), `--input=${input}`, `--output=${output}`, '--target=0.25'], { cwd: root, encoding: 'utf8' });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) throw new Error(`roster analysis validation failed with status ${result.status}`);
const report = JSON.parse(fs.readFileSync(output, 'utf8'));
if (report.pairedTrials !== 220) throw new Error('paired trial count wrong');
if (Math.abs(report.pairedOverall.ecr.mean - 2) > 1e-9) throw new Error('paired ECR delta wrong');
if (!report.pairedOverall.ecr.converged) throw new Error('constant paired delta should converge after 200 trials');
if (report.strategyMetrics.wtdn.positionalStrength.RB !== 90) throw new Error('positional strength average missing');
if (!report.pairedByConfigSlot['12-ppr|6|adp']) throw new Error('config-slot paired analysis missing');
if (report.samplePlanning.worstCellRecommendedPairedN < 200) throw new Error('sample planner violated minimum n');
fs.rmSync(temp, { recursive: true, force: true });
console.log('paired convergence, metric, positional-strength and sample-planning validation passed');
