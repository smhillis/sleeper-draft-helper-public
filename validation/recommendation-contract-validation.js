const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const state = {
  slot: 3,
  league: {
    league_id: 'league-a',
    total_rosters: 12,
    scoring_settings: { rec: 1, pass_td: 6, pass_int: -2 },
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN'],
  },
  picks: [{ draft_slot: 3, metadata: { position: 'RB' } }],
};

const row = {
  name: 'Test Player', pos: 'WR', team: 'NYJ', adp: 18.4, consensusRank: 20,
  baseScore: 250, score: 270, strategyScore: 270, scoringAdjustment: 8,
  rosterAdjustment: 3, vor: 30, tierDrop: 4, opportunityCost: 5,
  survivalProbability: 0.25, nextPickOverall: 31, completionPriority: 1,
  mustFillNow: false, specialtyHold: false, decisionNote: 'Risky to wait · 25% chance back',
};

const engine = {
  state,
  rosterProfile: () => ({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1 }),
  recommendations: () => [row],
};
const window = { SleeperDraftEngine: engine };
vm.runInNewContext(fs.readFileSync('recommendation-contract.js', 'utf8'), { window, console });
const [out] = engine.recommendations();
const rec = out.recommendation;

assert.equal(rec.schemaVersion, 1);
assert.equal(rec.platform, 'sleeper');
assert.equal(rec.player.name, 'Test Player');
assert.equal(rec.league.id, 'league-a');
assert.deepEqual(JSON.parse(JSON.stringify(rec.league.scoringInputs)), { rec: 1, pass_td: 6, pass_int: -2 });
assert.equal(rec.recommendation.totalScore, 270);
assert.equal(rec.recommendation.components.leagueAdjustedBaseScore, 250);
assert.equal(rec.recommendation.vor, 30);
assert.equal(rec.recommendation.tierDrop, 4);
assert.equal(rec.recommendation.nextPick.overall, 31);
assert.equal(rec.recommendation.nextPick.survivalProbability, 0.25);
assert.equal(rec.recommendation.waitOpportunityCost, 5);
assert.equal(rec.recommendation.rosterContext.draftedCounts.RB, 1);
assert.match(rec.recommendation.explanation, /Risky to wait/);
console.log('normalized recommendation contract validation passed');
