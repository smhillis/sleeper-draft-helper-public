/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
function element() {
  return { textContent: '', value: '', style: {}, classList: { add() {}, remove() {} }, addEventListener() {}, onclick: null, innerHTML: '' };
}
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
const strategy = context.SleeperDraftStrategy;
if (!engine || !strategy) throw new Error('Sleeper strategy did not install');

const results = [];
function check(name, condition, details = {}) {
  results.push({ name, passed: Boolean(condition), details });
  if (!condition) console.error(`FAIL: ${name}`, details);
}
const finite = (value) => Number.isFinite(Number(value));
const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const player = (name, pos, rank, adp, projection = {}) => ({ name, pos, team: 'TST', consensusRank: rank, adp, confidence: 0.8, projection });

function reset(board, { slots = ['QB','RB','RB','WR','WR','TE','FLEX','BN','BN','BN','BN','BN','BN'], picks = [], slot = 8, teams = 12 } = {}) {
  Object.assign(engine.state, {
    board,
    projections: Object.fromEntries(board.map((row) => [norm(row.name), { pos: row.pos, ...row.projection }])),
    picks,
    slot,
    user: { user_id: 'u1', username: 'tester' },
    league: {
      name: 'Strategy Test',
      total_rosters: teams,
      roster_positions: slots,
      scoring_settings: { rec: 1, pass_yd: .04, pass_td: 4, pass_int: -2, rush_yd: .1, rush_td: 6, rec_yd: .1, rec_td: 6 },
    },
    draft: { status: 'drafting' },
    rosters: [{ roster_id: 1, owner_id: 'u1' }],
    showMoreRecommendations: false,
  });
}

const patient = player('Patient WR', 'WR', 15, 40, { rec: 90, recYds: 1200, recTd: 8 });
const urgent = player('Urgent WR', 'WR', 20, 18, { rec: 90, recYds: 1200, recTd: 8 });
const filler = Array.from({ length: 28 }, (_, index) => player(`Depth WR ${index + 1}`, 'WR', 30 + index, 30 + index, { rec: 60 - index * .5, recYds: 800 - index * 4, recTd: 5 }));
const board = [patient, urgent, ...filler];
const priorPicks = Array.from({ length: 16 }, (_, index) => ({
  draft_slot: (index % 12) + 1,
  metadata: { first_name: `Taken${index + 1}`, last_name: '', position: index % 2 ? 'RB' : 'WR' },
}));
reset(board, { picks: priorPicks, slot: 8 });

const contextTurn = strategy.nextTurnContext(engine.state);
check('uses exact Sleeper snake return pick', contextTurn.upcoming === 17 && contextTurn.following === 32 && contextTurn.picksBetween === 14, contextTurn);

const urgentSurvival = strategy.survivalProbabilityAtNextTurn(urgent, engine.state);
const patientSurvival = strategy.survivalProbabilityAtNextTurn(patient, engine.state);
check('low-ADP player is less likely to survive', urgentSurvival < patientSurvival, { urgentSurvival, patientSurvival });

const recommendations = engine.recommendations();
const urgentRow = recommendations.find((row) => row.name === urgent.name);
const patientRow = recommendations.find((row) => row.name === patient.name);
check('strategy overrides the production recommendation binding', context.recommendations === engine.recommendations);
check('strategy exposes finite VOR', finite(urgentRow?.vor) && finite(patientRow?.vor), { urgent: urgentRow?.vor, patient: patientRow?.vor });
check('strategy exposes finite opportunity cost', finite(urgentRow?.opportunityCost) && finite(patientRow?.opportunityCost), { urgent: urgentRow?.opportunityCost, patient: patientRow?.opportunityCost });
check('scarce player receives greater wait penalty', urgentRow.opportunityCost > patientRow.opportunityCost, { urgent: urgentRow.opportunityCost, patient: patientRow.opportunityCost });
check('take-now logic can outrank a slightly better patient option', recommendations.findIndex((row) => row.name === urgent.name) < recommendations.findIndex((row) => row.name === patient.name), { top: recommendations.slice(0, 5).map((row) => row.name) });

const elite = player('Elite RB', 'RB', 5, 5, { rushAtt: 285, rushYds: 1450, rushTd: 13, rec: 70, recYds: 600, recTd: 4 });
const rbPool = Array.from({ length: 34 }, (_, index) => player(`RB ${index + 1}`, 'RB', 20 + index, 20 + index, { rushAtt: 210 - index, rushYds: 950 - index * 8, rushTd: 7, rec: 35, recYds: 250, recTd: 2 }));
reset([elite, ...rbPool], { picks: [], slot: 8 });
const rbRows = engine.recommendations();
const eliteRow = rbRows.find((row) => row.name === elite.name);
const lateRow = rbRows.find((row) => row.name === 'RB 30');
check('elite RB has greater value above replacement', eliteRow.vor > lateRow.vor, { elite: eliteRow.vor, late: lateRow.vor });
check('replacement level reflects league starter demand', eliteRow.replacementIndex >= 20, { replacementIndex: eliteRow.replacementIndex });

const tierBoard = [
  player('Tier A', 'WR', 20, 20, { rec: 90, recYds: 1200, recTd: 8 }),
  player('Tier B', 'WR', 21, 21, { rec: 88, recYds: 1180, recTd: 8 }),
  player('Tier C', 'WR', 45, 45, { rec: 65, recYds: 850, recTd: 5 }),
  ...filler.slice(10),
];
reset(tierBoard, { picks: priorPicks, slot: 8 });
const tierRows = engine.recommendations();
const tierB = tierRows.find((row) => row.name === 'Tier B');
check('tier cliff is measured from next same-position option', tierB.tierDrop > 5, { tierDrop: tierB.tierDrop });

reset(board, { picks: priorPicks, slot: 12 });
const shortTurn = strategy.nextTurnContext({ ...engine.state, picks: Array.from({ length: 11 }, () => ({})), slot: 12 });
const longTurn = strategy.nextTurnContext({ ...engine.state, picks: [], slot: 1 });
check('snake turn recognizes back-to-back endpoint', shortTurn.upcoming === 12 && shortTurn.following === 13 && shortTurn.picksBetween === 0, shortTurn);
check('snake turn recognizes long endpoint wait', longTurn.upcoming === 1 && longTurn.following === 24 && longTurn.picksBetween === 22, longTurn);

reset(board, { picks: priorPicks, slot: 8 });
context.render();
check('rendered recommendation card exposes why-now signal', /chance|Risky|Tier|VOR/.test(elements.get('pickCards').innerHTML), { html: elements.get('pickCards').innerHTML.slice(0, 500) });

const sameA = engine.recommendations();
const sameB = engine.recommendations();
check('identical Sleeper inputs are deterministic', JSON.stringify(sameA) === JSON.stringify(sameB));
check('all strategic scores are finite', sameA.every((row) => finite(row.score) && finite(row.vor) && finite(row.opportunityCost)));

const passed = results.filter((result) => result.passed).length;
const failed = results.length - passed;
console.log('WHO TO DRAFT NEXT — SLEEPER OPPORTUNITY STRATEGY');
console.log(`Assertions: ${results.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed) process.exitCode = 1;
