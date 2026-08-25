const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('sleeper-scoring-exhaustive.js', 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(code, sandbox, { filename: 'sleeper-scoring-exhaustive.js' });
const scoring = sandbox.window.SleeperExhaustiveScoring;
assert(scoring, 'exhaustive scoring API should load');

const samples = [
  {pos:'QB',passAtt:560,passCmp:370,passYds:4400,passTd:34,passInt:10,rushAtt:90,rushYds:480,rushTd:6,fumLost:3},
  {pos:'RB',rushAtt:260,rushYds:1250,rushTd:10,rec:65,recYds:520,recTd:4,fumLost:1},
  {pos:'WR',rec:105,recYds:1450,recTd:10,rushAtt:8,rushYds:55,rushTd:1,fumLost:1},
  {pos:'TE',rec:85,recYds:950,recTd:8,fumLost:.5},
  {pos:'K',fgm:32,fga:37,xpm:42,xpa:44},
  {pos:'DEF',sacks:46,ints:15,fumRec:10,ff:14,defTd:3,stTd:.6,safeties:.7,blocks:1.5,pa:350,ya:5350,solo:780,ast:300,tfl:80,qbHit:95,pd:70},
  {pos:'LB',solo:100,ast:58,sacks:3,ints:1,pd:6,ff:2,fr:1,tfl:9,qbHit:6,safeties:.05,blocks:.05,defTd:.2},
  {pos:'DL',solo:52,ast:30,sacks:11,ints:.2,pd:4,ff:2,fr:1,tfl:15,qbHit:21,safeties:.08,blocks:.1,defTd:.15},
  {pos:'DB',solo:82,ast:36,sacks:1.5,ints:3,pd:10,ff:1.2,fr:.8,tfl:5,qbHit:3,safeties:.05,blocks:.03,defTd:.25},
];

for (const key of scoring.knownKeys) {
  assert(scoring.isKnown(key), `catalog should recognize ${key}`);
  const applicable = samples.filter((p) => scoring.applies(key, p.pos));
  assert(applicable.length > 0, `${key} should apply to at least one draftable position`);
  for (const projection of applicable) {
    const value = scoring.value(projection, key);
    assert(Number.isFinite(value), `${key} should produce a finite projection for ${projection.pos}`);
  }
}

const maximal = Object.fromEntries(scoring.knownKeys.map((key) => [key, key.includes('int') || key.includes('fum_lost') || key.includes('miss') ? -1 : 1]));
const coverage = scoring.coverage(maximal);
assert.equal(coverage.active, scoring.knownKeys.length, 'all catalog keys should be active in maximal fixture');
assert.equal(coverage.modeled, coverage.active, 'all active Sleeper keys must be modeled');
assert.deepEqual(coverage.unmodeled, [], 'no current Sleeper scoring key may be unmodeled');
for (const projection of samples) {
  assert(Number.isFinite(scoring.projectedPoints(projection, maximal)), `maximal scoring should produce points for ${projection.pos}`);
}

// Aliases observed in Sleeper payloads / weekly stats must map too.
for (const alias of ['int_ret_td','fum_rec_td','pass_td_40p','pass_td_50p','pass_cmp_40p','rush_td_40p','rush_td_50p','rush_40p','rec_td_40p','rec_td_50p','rec_40p','idp_pass_def','idp_qb_hit','idp_safe','idp_fum_rec','idp_fum_ret_yd']) {
  assert(scoring.isKnown(alias), `Sleeper alias should be modeled: ${alias}`);
}

console.log(`Exhaustive Sleeper scoring: ${scoring.knownKeys.length} canonical keys + aliases modeled; maximal fixture finite across ${samples.length} position archetypes.`);