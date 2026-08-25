/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
function element() { return { textContent: '', value: '', style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, onclick: null, innerHTML: '' }; }
const elements = new Map();
const context = {
  console,
  URLSearchParams,
  setInterval: () => 0,
  clearInterval: () => {},
  fetch: async () => { throw new Error('network disabled in validation'); },
  localStorage: { getItem: () => '', setItem: () => {} },
  history: { replaceState: () => {} },
  location: { pathname: '/', search: '' },
  navigator: {},
  document: { getElementById: (id) => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); } },
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, { filename: 'app.js' });
vm.runInContext(fs.readFileSync(path.join(root, 'draft-strategy.js'), 'utf8'), context, { filename: 'draft-strategy.js' });
const engine = context.SleeperDraftEngine;
if (!engine) throw new Error('Production Sleeper engine did not load');

const finite = (value) => Number.isFinite(Number(value));
const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function projection(pos, positionRank) {
  const scale = Math.max(.46, 1.18 - (positionRank - 1) * .018);
  if (pos === 'QB') return { pos, passAtt: 520 * scale, passCmp: 345 * scale, passYds: 4050 * scale, passTd: 28 * scale, passInt: 11 / Math.max(.72, scale), rushAtt: 62 * scale, rushYds: 315 * scale, rushTd: 3.5 * scale };
  if (pos === 'RB') return { pos, rushAtt: 235 * scale, rushYds: 1010 * scale, rushTd: 7.2 * scale, rec: 46 * scale, recYds: 355 * scale, recTd: 2.2 * scale };
  if (pos === 'WR') return { pos, rec: 78 * scale, recYds: 1030 * scale, recTd: 6.4 * scale };
  if (pos === 'TE') return { pos, rec: 65 * scale, recYds: 735 * scale, recTd: 5.2 * scale };
  if (pos === 'K') return { pos, fgm: 31 * scale, fga: 35, xpm: 39 * scale, xpa: 41 };
  if (pos === 'DEF') return { pos, sacks: 42 * scale, ints: 13 * scale, fumRec: 9 * scale, ff: 12 * scale, defTd: 2.4 * scale, stTd: .4 * scale, safeties: .6 * scale, blocks: 1.1 * scale, pa: 365 / Math.max(.72, scale), ya: 5400 / Math.max(.72, scale) };
  return { pos };
}
function buildBoard() {
  const counts = { QB: 28, RB: 68, WR: 72, TE: 32, K: 16, DEF: 16 };
  const raw = [];
  Object.entries(counts).forEach(([pos, count]) => {
    for (let i = 1; i <= count; i += 1) {
      const positionalBias = { RB: 0, WR: 2, QB: 7, TE: 11, K: 155, DEF: 150 }[pos] || 0;
      const market = positionalBias + i * ({ QB: 4.0, RB: 2.15, WR: 2.05, TE: 4.2, K: 2.8, DEF: 2.9 }[pos] || 3);
      raw.push({ pos, positionRank: i, market });
    }
  });
  raw.sort((a, b) => a.market - b.market);
  return raw.map((row, index) => {
    const rank = index + 1;
    const wobble = ((row.positionRank * 7 + rank * 3) % 19) - 9;
    return {
      name: `${row.pos} Mock ${row.positionRank}`,
      pos: row.pos,
      team: 'TST',
      positionRank: row.positionRank,
      consensusRank: rank,
      adp: Math.max(1, rank + wobble),
      confidence: .82,
      projection: projection(row.pos, row.positionRank),
    };
  });
}
function draftSlotForOverall(overall, teams) {
  const round = Math.floor((overall - 1) / teams) + 1;
  const inRound = ((overall - 1) % teams) + 1;
  return round % 2 === 1 ? inRound : teams - inRound + 1;
}
function chooseOpponent(available, overall, rng) {
  let best = null;
  let bestDistance = Infinity;
  for (const row of available) {
    const jitter = (rng() + rng() + rng() - 1.5) * 14;
    const distance = Math.abs((Number(row.adp) || Number(row.consensusRank) || 999) + jitter - overall);
    if (distance < bestDistance) { best = row; bestDistance = distance; }
  }
  return best;
}
function reset(board, teams, slot) {
  Object.assign(engine.state, {
    board,
    projections: Object.fromEntries(board.map((p) => [norm(p.name), { pos: p.pos, ...p.projection }])),
    picks: [],
    slot,
    user: { user_id: 'u1', username: 'mock-user' },
    league: {
      name: 'Mock Draft League',
      total_rosters: teams,
      roster_positions: ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN','BN','BN','BN','BN','BN'],
      scoring_settings: { rec: 1, pass_yd: .04, pass_td: 4, pass_int: -2, rush_yd: .1, rush_td: 6, rec_yd: .1, rec_td: 6, fgm: 3, xpm: 1, sack: 1, int: 2, fum_rec: 2, def_td: 6 },
    },
    draft: { status: 'drafting' },
    rosters: [{ roster_id: 1, owner_id: 'u1' }],
    showMoreRecommendations: false,
  });
}
function simulate(seed, { teams = 12, slot = 8, rounds = 15 } = {}) {
  const rng = mulberry32(seed);
  const board = buildBoard();
  reset(board, teams, slot);
  const maxOverall = teams * rounds;
  let strategySignals = 0;
  let lowSurvivalSelections = 0;
  let earlySpecialty = 0;
  for (let overall = 1; overall <= maxOverall; overall += 1) {
    const gone = new Set(engine.state.picks.map((p) => norm(`${p.metadata?.first_name || ''} ${p.metadata?.last_name || ''}`)));
    const available = board.filter((row) => !gone.has(norm(row.name)));
    if (!available.length) break;
    const draftSlot = draftSlotForOverall(overall, teams);
    let chosen;
    if (draftSlot === slot) {
      const recs = engine.recommendations();
      if (!recs.length) throw new Error(`No recommendation at seed ${seed}, pick ${overall}`);
      if (!recs.every((row) => finite(row.score) && finite(row.vor) && finite(row.opportunityCost))) throw new Error(`Non-finite strategy output at seed ${seed}, pick ${overall}`);
      chosen = recs[0];
      if (chosen.decisionNote) strategySignals += 1;
      if (chosen.survivalProbability != null && chosen.survivalProbability <= .35) lowSurvivalSelections += 1;
      const round = Math.floor((overall - 1) / teams) + 1;
      if ((chosen.pos === 'K' || chosen.pos === 'DEF') && round <= 7) earlySpecialty += 1;
    } else {
      chosen = chooseOpponent(available, overall, rng);
    }
    engine.state.picks.push({
      draft_slot: draftSlot,
      pick_no: overall,
      metadata: { first_name: chosen.name, last_name: '', position: chosen.pos, team: chosen.team },
    });
  }
  const names = engine.state.picks.map((p) => norm(`${p.metadata?.first_name || ''} ${p.metadata?.last_name || ''}`));
  const mine = engine.state.picks.filter((p) => p.draft_slot === slot);
  const counts = mine.reduce((acc, p) => { const pos = p.metadata?.position; acc[pos] = (acc[pos] || 0) + 1; return acc; }, {});
  const skill = (counts.RB || 0) + (counts.WR || 0) + (counts.TE || 0);
  return {
    unique: new Set(names).size === names.length,
    mineCount: mine.length,
    requiredFilled: (counts.QB || 0) >= 1 && (counts.RB || 0) >= 2 && (counts.WR || 0) >= 2 && (counts.TE || 0) >= 1 && (counts.K || 0) >= 1 && (counts.DEF || 0) >= 1 && skill >= 6,
    strategySignals,
    lowSurvivalSelections,
    earlySpecialty,
    fingerprint: mine.map((p) => p.metadata.first_name).join('|'),
  };
}

const results = [];
function check(name, condition, details = {}) {
  results.push({ name, passed: Boolean(condition), details });
  if (!condition) console.error(`FAIL: ${name}`, details);
}
const simulations = 160;
let duplicateFailures = 0;
let rosterFailures = 0;
let shortDrafts = 0;
let totalSignals = 0;
let totalLowSurvival = 0;
let earlySpecialty = 0;
for (let seed = 1; seed <= simulations; seed += 1) {
  const result = simulate(seed);
  if (!result.unique) duplicateFailures += 1;
  if (!result.requiredFilled) rosterFailures += 1;
  if (result.mineCount !== 15) shortDrafts += 1;
  totalSignals += result.strategySignals;
  totalLowSurvival += result.lowSurvivalSelections;
  earlySpecialty += result.earlySpecialty;
}
const repeatA = simulate(8675309);
const repeatB = simulate(8675309);
check('160 complete snake drafts finish without duplicate players', duplicateFailures === 0, { duplicateFailures });
check('every simulated user receives all 15 selections', shortDrafts === 0, { shortDrafts });
check('standard-league required starters are filled by draft end', rosterFailures === 0, { rosterFailures });
check('why-now strategy signals appear throughout full drafts', totalSignals >= simulations * 10, { totalSignals });
check('simulation exercises low-survival take-now decisions', totalLowSurvival > simulations, { totalLowSurvival });
check('K/DEF remain suppressed through round 7', earlySpecialty === 0, { earlySpecialty });
check('same seed produces identical full user draft', repeatA.fingerprint === repeatB.fingerprint, { fingerprint: repeatA.fingerprint });

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
console.log('WHO TO DRAFT NEXT — SLEEPER FULL MOCK-DRAFT SIMULATION');
console.log(`Drafts: ${simulations}`);
console.log(`Assertions: ${results.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Strategy signals observed: ${totalSignals}`);
console.log(`Low-survival selections observed: ${totalLowSurvival}`);
if (failed) process.exitCode = 1;
