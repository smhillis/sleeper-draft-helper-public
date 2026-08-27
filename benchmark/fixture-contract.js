'use strict';

const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const REQUIRED_ECR_SETS = ['ppr', 'half', 'standard', 'superflex'];

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function validateRankingSet(key, set, { final = false, requiredRank = 210 } = {}) {
  const errors = [];
  if (!set || typeof set !== 'object') return [`sets.${key} is missing`];
  if (!set.sourceUrl || typeof set.sourceUrl !== 'string') errors.push(`sets.${key}.sourceUrl is required`);
  if (!['PPR', 'HALF', 'STD', 'SUPERFLEX'].includes(set.scoring)) errors.push(`sets.${key}.scoring is invalid`);
  if (!Number.isInteger(set.completeThroughRank) || set.completeThroughRank < 1) errors.push(`sets.${key}.completeThroughRank must be a positive integer`);
  if (!Array.isArray(set.players) || !set.players.length) return [...errors, `sets.${key}.players must be a non-empty array`];

  const names = [];
  const ranks = [];
  for (const [index, player] of set.players.entries()) {
    if (!player || typeof player !== 'object') { errors.push(`sets.${key}.players[${index}] is invalid`); continue; }
    const name = norm(player.name);
    if (!name) errors.push(`sets.${key}.players[${index}].name is required`);
    if (!Number.isInteger(player.rank) || player.rank < 1) errors.push(`sets.${key}.players[${index}].rank must be a positive integer`);
    names.push(name);
    ranks.push(player.rank);
  }
  for (const name of duplicateValues(names.filter(Boolean))) errors.push(`sets.${key} has duplicate player ${name}`);
  for (const rank of duplicateValues(ranks.filter(Number.isInteger))) errors.push(`sets.${key} has duplicate rank ${rank}`);

  if (final) {
    if (set.completeThroughRank < requiredRank) errors.push(`sets.${key} must be complete through at least rank ${requiredRank}`);
    const present = new Set(ranks);
    for (let rank = 1; rank <= Math.min(set.completeThroughRank, requiredRank); rank += 1) {
      if (!present.has(rank)) errors.push(`sets.${key} is missing rank ${rank}`);
    }
  }
  return errors;
}

function validateEcrFixture(fixture, options = {}) {
  const final = Boolean(options.final);
  const requiredRank = Number.isInteger(options.requiredRank) ? options.requiredRank : 210;
  const errors = [];
  if (!fixture || typeof fixture !== 'object') return { valid: false, errors: ['fixture must be an object'] };
  if (fixture.schemaVersion !== 2) errors.push('schemaVersion must be 2');
  if (fixture.sourceType !== 'fantasypros-ecr') errors.push('sourceType must be fantasypros-ecr');
  if (fixture.season !== 2026) errors.push('season must be 2026');
  if (!fixture.retrievedAt || typeof fixture.retrievedAt !== 'string') errors.push('retrievedAt is required');
  if (!fixture.sets || typeof fixture.sets !== 'object') errors.push('sets is required');
  if (final && fixture.complete !== true) errors.push('complete must be true in final mode');
  for (const key of REQUIRED_ECR_SETS) errors.push(...validateRankingSet(key, fixture.sets?.[key], { final, requiredRank }));
  return { valid: errors.length === 0, errors };
}

function validateActualsFixture(fixture, { final = false } = {}) {
  const errors = [];
  if (!fixture || typeof fixture !== 'object') return { valid: false, errors: ['fixture must be an object'] };
  if (fixture.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (fixture.sourceType !== 'actual-player-production') errors.push('sourceType must be actual-player-production');
  if (fixture.season !== 2026) errors.push('season must be 2026');
  if (!Number.isInteger(fixture.throughWeek) || fixture.throughWeek < 1 || fixture.throughWeek > 18) errors.push('throughWeek must be 1..18');
  if (!fixture.source || typeof fixture.source !== 'string') errors.push('source is required');
  if (final && (fixture.complete !== true || fixture.throughWeek < 18)) errors.push('final actuals require complete=true through Week 18');
  if (!Array.isArray(fixture.players) || !fixture.players.length) errors.push('players must be a non-empty array');
  const names = [];
  for (const [index, player] of (fixture.players || []).entries()) {
    const name = norm(player?.name);
    if (!name) errors.push(`players[${index}].name is required`);
    if (!player?.position || typeof player.position !== 'string') errors.push(`players[${index}].position is required`);
    if (!player?.stats || typeof player.stats !== 'object' || Array.isArray(player.stats)) errors.push(`players[${index}].stats must be an object`);
    else for (const [stat, value] of Object.entries(player.stats)) if (!Number.isFinite(Number(value))) errors.push(`players[${index}].stats.${stat} must be numeric`);
    names.push(name);
  }
  for (const name of duplicateValues(names.filter(Boolean))) errors.push(`duplicate actual-production player ${name}`);
  return { valid: errors.length === 0, errors };
}

function ecrSetKeyForConfig(config) {
  if (Number(config?.superflex) > 0) return 'superflex';
  if (config?.scoring === 'half') return 'half';
  if (config?.scoring === 'standard') return 'standard';
  return 'ppr';
}

function rankingMapForConfig(fixture, config) {
  const key = ecrSetKeyForConfig(config);
  const set = fixture?.sets?.[key];
  if (!set) return new Map();
  return new Map((set.players || []).map((player) => [norm(player.name), Number(player.rank)]));
}

module.exports = {
  REQUIRED_ECR_SETS,
  validateEcrFixture,
  validateActualsFixture,
  ecrSetKeyForConfig,
  rankingMapForConfig,
};
