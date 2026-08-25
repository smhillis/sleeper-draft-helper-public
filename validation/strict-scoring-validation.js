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
const engine = context.SleeperDraftEngine;
if (!engine) throw new Error('Production Sleeper engine was not exported');

const player = {
  name: 'STRICT_WR', pos: 'WR', team: 'TST', consensusRank: 1, adp: 1, confidence: .9,
};
const projection = { pos: 'WR', rec: 100, recYds: 1250, recTd: 8 };
function reset(scoring) {
  Object.assign(engine.state, {
    board: [player],
    projections: { strictwr: projection },
    picks: [],
    slot: 1,
    user: { user_id: 'u1' },
    league: { total_rosters: 12, roster_positions: ['WR', 'BN'], scoring_settings: scoring },
    draft: {},
  });
}
function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

reset({});
requireCondition(engine.recommendations().length === 0, 'Recommendations must be withheld when league scoring is absent');

reset({ rec: 1, rec_yd: .1, rec_td: 6, mystery_stat: 3 });
requireCondition(engine.scoringCoverage().unmodeled.includes('mystery_stat'), 'Unknown active scoring must be reported');
requireCondition(engine.recommendations().length === 0, 'Recommendations must be withheld when an active scoring rule is unmodeled');

reset({ rec: 1, rec_yd: .1, rec_td: 6 });
requireCondition(engine.leagueScoringReady(), 'Valid league scoring should be recognized');
requireCondition(engine.recommendations().length === 1, 'Valid league scoring should produce a league-scored recommendation');
requireCondition(Number.isFinite(Number(engine.recommendations()[0].score)), 'League-scored recommendation must have a finite score');

console.log('STRICT SLEEPER LEAGUE SCORING: PASS');
console.log('No scoring => no recommendations');
console.log('Unsupported active scoring => no recommendations');
console.log('Verified modeled league scoring => recommendations enabled');
