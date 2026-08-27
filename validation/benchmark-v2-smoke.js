/* eslint-disable no-console */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function read(file) { return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')); }
function mergedBoard() {
  const rows = [
    ...(read('data/rankings.json').players || []),
    ...(read('data/depth-rankings.json').players || []),
    ...(read('data/specialty-rankings.json').players || []),
  ];
  const map = new Map();
  for (const row of rows) {
    const key = norm(row.name);
    if (!key || map.has(key)) continue;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => Number(a.consensusRank || 9999) - Number(b.consensusRank || 9999));
}

function genericStats(pos, rank) {
  const scale = Math.max(0.45, 1.15 - Math.max(0, rank - 1) * 0.003);
  if (pos === 'QB') return { passYds: 3900 * scale, passTd: 25 * scale, passInt: 11, rushYds: 280 * scale, rushTd: 3.2 * scale, fumLost: 2 };
  if (pos === 'RB') return { rushYds: 900 * scale, rushTd: 6.5 * scale, rec: 42 * scale, recYds: 320 * scale, recTd: 2.2 * scale, fumLost: 1 };
  if (pos === 'WR') return { rec: 72 * scale, recYds: 930 * scale, recTd: 5.8 * scale, fumLost: 0.5 };
  if (pos === 'TE') return { rec: 58 * scale, recYds: 650 * scale, recTd: 4.6 * scale, fumLost: 0.3 };
  if (pos === 'K') return { fgm: 29 * scale, xpm: 38 * scale };
  if (pos === 'DEF') return { sacks: 39 * scale, ints: 12 * scale, fumRec: 8 * scale, defTd: 2 * scale, safeties: 0.5, blocks: 1, pa: 380 / scale, ya: 5500 / scale };
  return { solo: 70 * scale, ast: 35 * scale, sacks: 3 * scale, ints: 1 * scale, pd: 5 * scale, ff: 1 * scale, fr: 0.7 * scale, tfl: 7 * scale, qbHit: 5 * scale };
}

const board = mergedBoard();
if (board.length < 200) throw new Error(`synthetic benchmark fixture board unexpectedly small: ${board.length}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wtdn-benchmark-v2-'));
const ecrPath = path.join(temp, 'ecr.json');
const actualsPath = path.join(temp, 'actuals.json');
const out = path.join(temp, 'out');

const ecrPlayers = board.slice(0, 210).map((player, index) => ({ name: player.name, rank: index + 1, position: player.pos || null, team: player.team || null }));
const set = (scoring, suffix) => ({ sourceUrl: `https://example.test/fantasypros-${suffix}`, sourceDate: '2026-08-26', scoring, completeThroughRank: 210, players: ecrPlayers });
fs.writeFileSync(ecrPath, JSON.stringify({
  schemaVersion: 2,
  sourceType: 'fantasypros-ecr',
  season: 2026,
  retrievedAt: '2026-08-26T20:00:00-04:00',
  complete: true,
  researchUseOnly: true,
  notes: 'Synthetic CI fixture. Not benchmark evidence.',
  sets: { ppr: set('PPR', 'ppr'), half: set('HALF', 'half'), standard: set('STD', 'std'), superflex: set('SUPERFLEX', 'superflex') },
}, null, 2));

fs.writeFileSync(actualsPath, JSON.stringify({
  schemaVersion: 1,
  sourceType: 'actual-player-production',
  season: 2026,
  throughWeek: 18,
  complete: true,
  source: 'synthetic-ci-fixture',
  retrievedAt: '2027-01-15T00:00:00Z',
  notes: 'Synthetic CI fixture. Not realized production.',
  players: board.map((player, index) => ({ name: player.name, position: player.pos, team: player.team || null, games: 17, stats: genericStats(player.pos, index + 1) })),
}, null, 2));

const result = spawnSync(process.execPath, [
  path.join(root, 'benchmark', 'run-v2.js'),
  '--smoke',
  '--samples=1',
  `--ecr=${ecrPath}`,
  `--actuals=${actualsPath}`,
  `--output=${out}`,
], { cwd: root, encoding: 'utf8', timeout: 120000 });

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) throw new Error(`benchmark-v2 smoke failed with status ${result.status}`);

const metadata = JSON.parse(fs.readFileSync(path.join(out, 'metadata.json'), 'utf8'));
const actualSummary = JSON.parse(fs.readFileSync(path.join(out, 'actual-summary.json'), 'utf8'));
const report = fs.readFileSync(path.join(out, 'report.md'), 'utf8');
if (metadata.ecrMode !== 'exact') throw new Error(`expected exact ECR mode, got ${metadata.ecrMode}`);
if (!metadata.actualsSupplied || metadata.actualsSource !== 'synthetic-ci-fixture') throw new Error('actual-production fixture did not flow through metadata');
if (!Object.keys(metadata.ecrCoverageBySet || {}).includes('superflex')) throw new Error('superflex ECR coverage missing');
if (!actualSummary?.paired?.adp || !Number.isFinite(actualSummary.paired.adp.mean)) throw new Error('actual-production paired summary missing');
if (!report.includes('Post-2026 realized-production rerun')) throw new Error('report did not render post-season rerun section');
if (!fs.existsSync(path.join(out, 'decision-log.jsonl.gz'))) throw new Error('decision log missing');

fs.rmSync(temp, { recursive: true, force: true });
console.log('benchmark v2 scoring-specific ECR + actual-production rerun smoke passed');
