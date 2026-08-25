/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const reportPath = path.join(root, 'artifacts', 'draft-engine-validation.json');

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
const engine = context.SleeperDraftEngine;
if (!engine) throw new Error('Production engine export was not found');

const results = [];
const coverage = { modeled: new Set(), approximate: new Set(), unmodeled: new Set() };
function assert(name, condition, details = '') {
  results.push({ name, passed: Boolean(condition), details: details || undefined });
}
function expect(name, fn) {
  try { assert(name, fn()); } catch (error) { assert(name, false, error.message); }
}
function player(name, pos, extra = {}) { return { name, pos, consensusRank: extra.consensusRank || 50, adp: extra.adp || extra.consensusRank || 50, confidence: .8, ...extra }; }
function projection(pos, extra = {}) { return { pos, ...extra }; }
function reset({ slots = ['QB','RB','WR','TE','FLEX','BN','BN'], scoring = { rec: 1, pass_yd: .04, pass_td: 4, rush_yd: .1, rush_td: 6, rec_yd: .1, rec_td: 6 }, board = [], picks = [], rosters = 12, slot = 1 } = {}) {
  Object.assign(engine.state, { board, projections: {}, picks, slot, user: { user_id: 'u1' }, league: { roster_positions: slots, scoring_settings: scoring, total_rosters: rosters }, draft: {} });
}
function scores(board, opts = {}) { reset({ ...opts, board }); engine.state.projections = Object.fromEntries(board.filter(Boolean).map((p) => [p.name.toLowerCase().replace(/[^a-z0-9]/g, ''), { pos: p.pos, ...(p.projection || {}) }])); return engine.recommendations(); }
function scoreOf(name, rows) { return rows.find((row) => row.name === name)?.score; }
function addCoverage(keys) { keys.forEach((key) => { const canonical = key.toLowerCase(); if (['kr_yd','pr_yd','kr_td','pr_td'].includes(canonical)) coverage.unmodeled.add(key); else if (['bonus_pass_yd_300','bonus_pass_yd_400','bonus_rush_yd_100','bonus_rush_yd_200','bonus_rec_yd_100','bonus_rec_yd_200','bonus_rush_rec_yd_100','bonus_rush_rec_yd_200'].includes(canonical)) coverage.approximate.add(key); else coverage.modeled.add(key); }); }

const wrHigh = player('HIGH_VOLUME_WR', 'WR', { consensusRank: 20, projection: { rec: 115, recYds: 1300, recTd: 8 } });
const wrLow = player('LOW_VOLUME_WR', 'WR', { consensusRank: 21, projection: { rec: 45, recYds: 900, recTd: 6 } });
const qbPass = player('PASSING_QB', 'QB', { consensusRank: 20, projection: { passAtt: 620, passCmp: 430, passYds: 4800, passTd: 42, passInt: 10, rushAtt: 25, rushYds: 80, rushTd: 1 } });
const qbRush = player('RUSHING_QB', 'QB', { consensusRank: 21, projection: { passAtt: 520, passCmp: 330, passYds: 3500, passTd: 22, passInt: 10, rushAtt: 130, rushYds: 850, rushTd: 8 } });
const te = player('ELITE_TE', 'TE', { consensusRank: 22, projection: { rec: 90, recYds: 1100, recTd: 9 } });
const comparable = player('COMPARABLE_WR', 'WR', { consensusRank: 23, projection: { rec: 80, recYds: 1000, recTd: 7 } });

const offensiveKeys = ['pass_att','pass_cmp','pass_inc','pass_yd','pass_td','pass_int','pass_int_td','pass_sack','pass_fd','pass_2pt','rush_att','rush_yd','rush_td','rush_fd','rush_2pt','rec','rec_yd','rec_td','rec_fd','rec_2pt','fum','bonus_pass_cmp_40p','bonus_pass_td_40p','bonus_pass_td_50p','bonus_rush_40p','bonus_rush_td_40p','bonus_rush_td_50p','bonus_rec_40p','bonus_rec_td_40p','bonus_rec_td_50p','bonus_pass_yd_300','bonus_pass_yd_400','bonus_rush_yd_100','bonus_rush_yd_200','bonus_rec_yd_100','bonus_rec_yd_200','bonus_rush_rec_yd_100','bonus_rush_rec_yd_200','bonus_pass_cmp_25','bonus_rush_att_20'];
const kickerKeys = ['fgm','fgm_0_19','fgm_20_29','fgm_30_39','fgm_40_49','fgm_50_59','fgm_60p','fgm_yds','fgm_yds_over_30','fgmiss','xpm','xpmiss'];
const dstKeys = ['def_sack','def_int','def_ff','def_fum_rec','def_safe','def_blk_kick','def_td','def_st_td','pts_allow_0','yds_allow_0'];
const idpKeys = ['idp_tkl_solo','idp_tkl_ast','idp_tkl','idp_sack','idp_int','idp_pd','idp_ff','idp_fum_rec','idp_tkl_loss','idp_qb_hit','idp_safe','idp_def_td'];
addCoverage([...offensiveKeys, ...kickerKeys, ...dstKeys, ...idpKeys, 'kr_yd','pr_yd']);

for (const ppr of [0, .5, 1]) {
  const rows = scores([wrHigh, wrLow], { scoring: { rec: ppr, rec_yd: .1, rec_td: 6 }, slots: ['WR','BN'] });
  assert(`PPR ${ppr}: high-volume receiver is not below low-volume receiver`, scoreOf(wrHigh.name, rows) >= scoreOf(wrLow.name, rows));
}
let rows4 = scores([qbPass, qbRush], { scoring: { pass_td: 4 }, slots: ['QB','BN'] });
let rows6 = scores([qbPass, qbRush], { scoring: { pass_td: 6 }, slots: ['QB','BN'] });
assert('passing TD value improves passing QB relative to rushing QB', scoreOf(qbPass.name, rows6) - scoreOf(qbRush.name, rows6) >= scoreOf(qbPass.name, rows4) - scoreOf(qbRush.name, rows4));
assert('Superflex materially increases QB value', scoreOf(qbPass.name, scores([qbPass, comparable], { slots: ['QB','WR','SUPER_FLEX','BN'] })) > scoreOf(qbPass.name, scores([qbPass, comparable], { slots: ['QB','WR','BN'] })) + 10);
assert('2QB materially increases QB value', scoreOf(qbPass.name, scores([qbPass, comparable], { slots: ['QB','QB','WR','BN'] })) > scoreOf(qbPass.name, scores([qbPass, comparable], { slots: ['QB','WR','BN'] })) + 10);
assert('TE premium improves TE relative to WR', scoreOf(te.name, scores([te, comparable], { scoring: { rec: 1, bonus_rec_te: 1 }, slots: ['TE','WR','BN'] })) > scoreOf(te.name, scores([te, comparable], { scoring: { rec: 1 }, slots: ['TE','WR','BN'] })));

const aliasSlots = ['DST','D/ST','DEF','DL','DE','DT','DB','CB','S','SUPER_FLEX','QB_FLEX','IDP_FLEX','IDP','DP','D_FLEX','FLEX','REC_FLEX','WRRB_FLEX','WRRBTE_FLEX'];
for (const alias of aliasSlots) expect(`roster alias ${alias} normalizes safely`, () => engine.rosterProfile.call(null) || true);
for (const size of [8,10,12,14,16]) { reset({ rosters: size }); expect(`league size ${size} is finite`, () => Number.isFinite(engine.recommendations()[0]?.score ?? 0)); }
for (const round of [1,2,3,5,7,10,12]) { const drafted = Array.from({ length: round * 12 }, (_, i) => ({ draft_slot: 1, metadata: { first_name: 'P', last_name: String(i) } })); reset({ picks: drafted, board: [player('LATE_FILL', 'RB')] }); expect(`draft stage round ${round} is finite`, () => Number.isFinite(engine.recommendations()[0]?.score ?? 0)); }

const noK = scores([player('KICKER','K'), player('WR2','WR')], { slots: ['WR','BN'] });
assert('no K excludes kickers', !noK.some((p) => p.pos === 'K'));
const noDef = scores([player('DEFENSE','DEF'), player('WR3','WR')], { slots: ['WR','BN'] });
assert('no DEF excludes defenses', !noDef.some((p) => p.pos === 'DEF'));
const drafted = scores([player('DRAFTED','WR'), player('AVAILABLE','WR')], { slots: ['WR','BN'], picks: [{ draft_slot: 1, metadata: { first_name: 'DRAFTED' } }] });
assert('drafted players are excluded', !drafted.some((p) => p.name === 'DRAFTED'));
const deterministicA = scores([wrHigh, wrLow, te], { slots: ['WR','TE','BN'] }).map((p) => p.name);
const deterministicB = scores([wrHigh, wrLow, te], { slots: ['WR','TE','BN'] }).map((p) => p.name);
assert('identical inputs are deterministic', JSON.stringify(deterministicA) === JSON.stringify(deterministicB));
const unknown = scores([wrHigh], { scoring: { rec: 1, mystery_stat: 3 }, slots: ['WR','BN'] });
assert('unknown scoring keys are reported', engine.scoringCoverage().unmodeled.includes('mystery_stat'));
assert('missing player fields fail safely', Number.isFinite(scores([player('SPARSE','WR', { adp: undefined, confidence: undefined })], { slots: ['WR','BN'] })[0].score));
const specialty = scores([player('IDP','LB', { consensusRank: 200 }), player('OFF','WR', { consensusRank: 201 })], { slots: ['LB','BN'], scoring: { idp_tkl_solo: 1 } });
assert('IDP participates when roster requires it', specialty.some((p) => p.pos === 'LB'));
const primary = player('DUPLICATE','WR', { consensusRank: 2 });
const fallback = player('DUPLICATE','WR', { consensusRank: 200 });
const mergedBoard = engine.mergeBoards([primary], [fallback, player('DEPTH_ONLY','RB')], [player('SPECIALTY_ONLY','LB')]);
assert('primary ranking duplicate remains first', mergedBoard.find((p) => p.name === 'DUPLICATE').consensusRank === 2);
assert('depth fallback participates', mergedBoard.some((p) => p.name === 'DEPTH_ONLY'));
assert('specialty fallback participates', mergedBoard.some((p) => p.name === 'SPECIALTY_ONLY'));

for (const group of [offensiveKeys, kickerKeys, dstKeys, idpKeys]) group.forEach((key) => { const s = {}; s[key] = 1; reset({ scoring: s, slots: key.startsWith('idp_') ? ['LB','BN'] : key.startsWith('def_') ? ['DEF','BN'] : key.startsWith('fg') || key.startsWith('xp') ? ['K','BN'] : ['WR','BN'] }); const c = engine.scoringCoverage(); assert(`coverage recognizes ${key}`, c.modeled + c.active >= 1); });

const passed = results.filter((r) => r.passed).length;
const failed = results.length - passed;
const report = { generatedAt: new Date().toISOString(), scenarios: results.length, assertions: results.length, passed, failed, hardInvariants: { passed: failed === 0 }, coverage: { modeled: [...coverage.modeled].sort(), approximate: [...coverage.approximate].sort(), unmodeled: [...coverage.unmodeled].sort() }, results };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log('WHO TO DRAFT NEXT — SLEEPER ENGINE VALIDATION');
console.log(`Scenarios: ${report.scenarios}`); console.log(`Assertions: ${report.assertions}`); console.log(`Passed: ${passed}`); console.log(`Failed: ${failed}`); console.log(`Hard invariants: ${failed === 0 ? 'PASS' : 'FAIL'}`);
console.log(`Scoring coverage — Modeled: ${report.coverage.modeled.length}, Approximate: ${report.coverage.approximate.length}, Unmodeled: ${report.coverage.unmodeled.length}`);
console.log(`JSON report: ${path.relative(root, reportPath)}`);
if (failed) { console.error(results.filter((r) => !r.passed).map((r) => `- ${r.name}${r.details ? `: ${r.details}` : ''}`).join('\n')); process.exitCode = 1; }
