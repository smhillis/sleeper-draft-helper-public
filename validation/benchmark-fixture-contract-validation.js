/* eslint-disable no-console */
'use strict';

const assert = require('assert');
const {
  validateEcrFixture,
  validateActualsFixture,
  ecrSetKeyForConfig,
  rankingMapForConfig,
} = require('../benchmark/fixture-contract');

function players(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({ name: `${prefix} Player ${index + 1}`, rank: index + 1, position: index % 5 === 0 ? 'QB' : index % 2 ? 'WR' : 'RB', team: 'TST' }));
}

function set(scoring, prefix, count = 210) {
  return { sourceUrl: `https://example.test/${prefix}`, sourceDate: '2026-08-26', scoring, completeThroughRank: count, players: players(count, prefix) };
}

const completeEcr = {
  schemaVersion: 2,
  sourceType: 'fantasypros-ecr',
  season: 2026,
  retrievedAt: '2026-08-26T20:00:00-04:00',
  complete: true,
  researchUseOnly: true,
  sets: {
    ppr: set('PPR', 'ppr'),
    half: set('HALF', 'half'),
    standard: set('STD', 'std'),
    superflex: set('SUPERFLEX', 'sf'),
  },
};

let result = validateEcrFixture(completeEcr, { final: true, requiredRank: 210 });
assert.equal(result.valid, true, result.errors.join('; '));
assert.equal(ecrSetKeyForConfig({ scoring: 'ppr', superflex: 0 }), 'ppr');
assert.equal(ecrSetKeyForConfig({ scoring: 'half', superflex: 0 }), 'half');
assert.equal(ecrSetKeyForConfig({ scoring: 'standard', superflex: 0 }), 'standard');
assert.equal(ecrSetKeyForConfig({ scoring: 'ppr', superflex: 1 }), 'superflex');
assert.equal(rankingMapForConfig(completeEcr, { scoring: 'half' }).get('halfplayer1'), 1);

const missingRank = JSON.parse(JSON.stringify(completeEcr));
missingRank.sets.ppr.players.splice(99, 1);
result = validateEcrFixture(missingRank, { final: true, requiredRank: 210 });
assert.equal(result.valid, false);
assert(result.errors.some((error) => error.includes('missing rank 100')));

const wrongSource = JSON.parse(JSON.stringify(completeEcr));
wrongSource.sourceType = 'production-consensus';
result = validateEcrFixture(wrongSource, { final: true });
assert.equal(result.valid, false);
assert(result.errors.some((error) => error.includes('sourceType')));

const partialEcr = JSON.parse(JSON.stringify(completeEcr));
partialEcr.complete = false;
for (const rankingSet of Object.values(partialEcr.sets)) {
  rankingSet.completeThroughRank = 25;
  rankingSet.players = rankingSet.players.slice(0, 25);
}
assert.equal(validateEcrFixture(partialEcr, { final: false }).valid, true);
assert.equal(validateEcrFixture(partialEcr, { final: true }).valid, false);

const actuals = {
  schemaVersion: 1,
  sourceType: 'actual-player-production',
  season: 2026,
  throughWeek: 18,
  complete: true,
  source: 'synthetic-contract-test',
  retrievedAt: '2027-01-15T00:00:00Z',
  players: [
    { name: 'Actual QB', position: 'QB', team: 'TST', games: 17, stats: { passYds: 4300, passTd: 31, passInt: 11, rushYds: 280, rushTd: 3 } },
    { name: 'Actual WR', position: 'WR', team: 'TST', games: 17, stats: { rec: 101, recYds: 1380, recTd: 9 } },
  ],
};
assert.equal(validateActualsFixture(actuals, { final: true }).valid, true);

const duplicateActuals = JSON.parse(JSON.stringify(actuals));
duplicateActuals.players.push({ ...duplicateActuals.players[1] });
result = validateActualsFixture(duplicateActuals, { final: true });
assert.equal(result.valid, false);
assert(result.errors.some((error) => error.includes('duplicate actual-production player')));

const incompleteActuals = JSON.parse(JSON.stringify(actuals));
incompleteActuals.throughWeek = 12;
incompleteActuals.complete = false;
assert.equal(validateActualsFixture(incompleteActuals, { final: false }).valid, true);
assert.equal(validateActualsFixture(incompleteActuals, { final: true }).valid, false);

console.log('benchmark fixture contract validation passed');
