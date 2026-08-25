const API = 'https://api.sleeper.app/v1';
const state = {
  username: '', leagueId: '', user: null, league: null, draft: null, rosters: [], picks: [], slot: null, timer: null,
  board: [], players: {}, projections: {}, showMoreRecommendations: false,
};

const $ = (id) => document.getElementById(id);
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function normalizePos(pos) {
  const value = String(pos || '').toUpperCase().replace(/[^A-Z/]/g, '');
  if (['DST', 'D/ST', 'DEF'].includes(value)) return 'DEF';
  if (['DE', 'DT', 'DL'].includes(value)) return 'DL';
  if (['CB', 'S', 'DB'].includes(value)) return 'DB';
  return value;
}

async function j(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Sleeper returned ${r.status}`);
  return r.json();
}

function showErr(id, msg) { const el = $(id); el.textContent = msg; el.style.display = 'block'; }
function clearErr(id) { $(id).style.display = 'none'; }

async function loadBoard() {
  const urls = ['data/rankings.json', 'data/depth-rankings.json', 'data/specialty-rankings.json', 'data/projections.json'];
  const [rankingsResult, depthResult, specialtyResult, projectionsResult] = await Promise.allSettled(
    urls.map((url) => fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' }).then((r) => {
      if (!r.ok) throw new Error(`${url} returned ${r.status}`);
      return r.json();
    })),
  );
  if (rankingsResult.status !== 'fulfilled') throw new Error('Rankings are temporarily unavailable.');

  const primary = rankingsResult.value.players || [];
  const depth = depthResult.status === 'fulfilled' ? depthResult.value.players || [] : [];
  const specialty = specialtyResult.status === 'fulfilled' ? specialtyResult.value.players || [] : [];
  state.board = mergeBoards(primary, depth, specialty);
  const raw = projectionsResult.status === 'fulfilled' ? projectionsResult.value.players || {} : {};
  state.projections = Object.fromEntries(Object.entries(raw).map(([name, projection]) => [norm(name), { ...projection, pos: normalizePos(projection.pos) }]));
}

function mergeBoards(primary, depth, specialty) {
  const merged = new Map();
  [...primary, ...depth, ...specialty].forEach((player) => {
    const key = norm(player.name);
    if (!key || merged.has(key)) return;
    merged.set(key, { ...player, pos: normalizePos(player.pos) });
  });
  return [...merged.values()].sort((a, b) => num(a.consensusRank, 999) - num(b.consensusRank, 999));
}

async function loadPlayers() {
  try {
    const d = await j(`${API}/players/nfl`);
    const map = {};
    Object.values(d || {}).forEach((p) => {
      const full = p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim();
      if (full) map[norm(full)] = { id: p.player_id, name: full };
    });
    state.players = map;
  } catch { state.players = {}; }
}

function photoUrl(name) { const p = state.players[norm(name)]; return p ? `https://sleepercdn.com/content/nfl/players/${p.id}.jpg` : ''; }
function rosterForUser() { const id = state.user?.user_id; return state.rosters.find((r) => r.owner_id === id || (r.co_owners || []).includes(id)) || null; }

function resolveSlot() {
  const uid = state.user?.user_id;
  const d = state.draft || {};
  const direct = Number(d.draft_order?.[uid]);
  if (direct) return direct;
  const roster = rosterForUser();
  if (roster && d.slot_to_roster_id) {
    for (const [s, rid] of Object.entries(d.slot_to_roster_id)) if (Number(rid) === Number(roster.roster_id)) return Number(s);
  }
  return null;
}

function mine() { return state.picks.filter((p) => Number(p.draft_slot) === Number(state.slot)); }
function nextMine() {
  const n = Number(state.league?.total_rosters || 12);
  const done = state.picks.length;
  const out = [];
  if (!state.slot) return out;
  for (let r = 1; r < 40; r += 1) {
    const overall = r % 2 ? ((r - 1) * n + state.slot) : (r * n - state.slot + 1);
    if (overall > done) out.push({ overall, round: r });
    if (out.length === 2) break;
  }
  return out;
}

function rosterProfile() {
  const slots = state.league?.roster_positions || [];
  const normalized = slots.map((slot) => String(slot).toUpperCase());
  const count = (...names) => normalized.filter((slot) => names.includes(slot)).length;
  return {
    QB: count('QB'), RB: count('RB'), WR: count('WR'), TE: count('TE'), K: count('K'),
    DEF: count('DEF', 'DST', 'D/ST'), DL: count('DL', 'DE', 'DT'), LB: count('LB'), DB: count('DB', 'CB', 'S'),
    FLEX: normalized.filter((slot) => ['FLEX', 'REC_FLEX', 'WRRB_FLEX', 'WRRBTE_FLEX'].includes(slot)).length,
    SUPER_FLEX: normalized.filter((slot) => ['SUPER_FLEX', 'QB_FLEX'].includes(slot)).length,
    IDP_FLEX: normalized.filter((slot) => ['IDP_FLEX', 'IDP', 'DP', 'D_FLEX'].includes(slot)).length,
    BENCH: count('BN', 'BENCH'),
  };
}

function positionRank(player) {
  if (Number.isFinite(Number(player?.positionRank))) return Number(player.positionRank);
  const pos = normalizePos(player?.pos);
  const same = state.board.filter((row) => normalizePos(row.pos) === pos).sort((a, b) => num(a.consensusRank, 999) - num(b.consensusRank, 999));
  const index = same.findIndex((row) => norm(row.name) === norm(player?.name));
  return index >= 0 ? index + 1 : Math.max(1, Math.ceil(num(player?.consensusRank, 100) / 12));
}

function scaledProjection(base, scale, invert = []) {
  const out = { ...base };
  Object.keys(out).forEach((key) => {
    if (key === 'pos') return;
    const v = num(out[key]);
    out[key] = invert.includes(key) ? v / Math.max(.6, scale) : v * scale;
  });
  return out;
}

function estimatedProjection(player) {
  const pos = normalizePos(player?.pos);
  const rank = positionRank(player);
  if (pos === 'QB') return scaledProjection({ pos, passAtt:510, passCmp:335, passYds:3900, passTd:25, passInt:11, rushAtt:65, rushYds:310, rushTd:3.5, fumLost:3 }, clamp(1.13 - (rank - 1) * .012, .67, 1.13), ['passInt', 'fumLost']);
  if (pos === 'RB') return scaledProjection({ pos, rushAtt:205, rushYds:895, rushTd:6.3, rec:41, recYds:320, recTd:2.1, fumLost:1.2 }, clamp(1.22 - (rank - 1) * .014, .50, 1.22));
  if (pos === 'WR') return scaledProjection({ pos, rec:70, recYds:900, recTd:5.6, rushAtt:4, rushYds:25, rushTd:.2, fumLost:.6 }, clamp(1.22 - (rank - 1) * .012, .52, 1.22));
  if (pos === 'TE') return scaledProjection({ pos, rec:59, recYds:655, recTd:4.8, fumLost:.4 }, clamp(1.20 - (rank - 1) * .022, .50, 1.20));
  if (pos === 'K') return scaledProjection({ pos, fgm:31, fga:35, xpm:40, xpa:42 }, clamp(1.12 - (rank - 1) * .025, .72, 1.12));
  if (pos === 'DEF') {
    const scale = clamp(1.18 - (rank - 1) * .025, .72, 1.18);
    return { pos, sacks:42*scale, ints:13*scale, fumRec:9*scale, ff:13*scale, defTd:2.5*scale, stTd:.45*scale, safeties:.65*scale, blocks:1.25*scale, pa:360/scale, ya:5400/scale, krYds:760*scale, prYds:420*scale };
  }
  if (pos === 'LB') return scaledProjection({ pos, solo:92, ast:55, sacks:2.5, ints:.5, pd:4, ff:1.3, fr:1, tfl:8, qbHit:5, safeties:.05, defTd:.15 }, clamp(1.16 - (rank - 1) * .018, .65, 1.16));
  if (pos === 'DL') return scaledProjection({ pos, solo:47, ast:28, sacks:9, ints:.2, pd:3, ff:1.5, fr:.8, tfl:13, qbHit:18, safeties:.08, defTd:.12 }, clamp(1.18 - (rank - 1) * .022, .62, 1.18));
  if (pos === 'DB') return scaledProjection({ pos, solo:78, ast:34, sacks:1.4, ints:2.2, pd:8, ff:1.1, fr:.7, tfl:5, qbHit:2.5, safeties:.05, defTd:.2 }, clamp(1.16 - (rank - 1) * .018, .65, 1.16));
  return null;
}

function projectionFor(player) { return state.projections[norm(player?.name)] || estimatedProjection(player); }

function standardDstPaPoints(p) {
  return gamesInRange(p.pa, -1, .5, 10) * 10
    + gamesInRange(p.pa, .5, 6.5, 10) * 7
    + gamesInRange(p.pa, 6.5, 13.5, 10) * 4
    + gamesInRange(p.pa, 13.5, 20.5, 10) * 1
    + gamesInRange(p.pa, 27.5, 34.5, 10) * -1
    + gamesInRange(p.pa, 34.5, 100, 10) * -4;
}

function baselinePoints(p) {
  if (!p) return 0;
  if (p.pos === 'K') return num(p.fgm) * 3 + num(p.xpm);
  if (p.pos === 'DEF') return num(p.sacks) + num(p.ints) * 2 + num(p.fumRec) * 2 + num(p.defTd) * 6 + num(p.stTd) * 6 + num(p.safeties) * 2 + num(p.blocks) * 2 + standardDstPaPoints(p);
  if (['LB','DL','DB'].includes(p.pos)) return num(p.solo) * 1.5 + num(p.ast) * .75 + num(p.sacks) * 4 + num(p.ints) * 5 + num(p.pd) * 1.5 + num(p.ff) * 3 + num(p.fr) * 3 + num(p.tfl) * 2 + num(p.qbHit) + num(p.defTd) * 6 + num(p.safeties) * 2;
  return num(p.passYds) * .04 + num(p.passTd) * 4 + num(p.passInt) * -2
    + num(p.rushYds) * .1 + num(p.rushTd) * 6 + num(p.rec)
    + num(p.recYds) * .1 + num(p.recTd) * 6 + num(p.fumLost) * -2;
}

function logisticAbove(avg, threshold, spread) {
  const z = (avg - threshold) / Math.max(1, spread);
  return 1 / (1 + Math.exp(-1.7 * z));
}
function aboveThresholdGames(total, threshold, sd) {
  if (!total) return 0;
  return 17 * logisticAbove(num(total) / 17, threshold, sd);
}
function rangeThresholdGames(total, low, high, sd) {
  return Math.max(0, aboveThresholdGames(total, low, sd) - aboveThresholdGames(total, high, sd));
}
function gamesInRange(total, low, high, sd) {
  if (!Number.isFinite(Number(total))) return 0;
  const avg = num(total) / 17;
  const aboveLow = low < 0 ? 1 : logisticAbove(avg, low, sd);
  const aboveHigh = high >= 99_999 ? 0 : logisticAbove(avg, high, sd);
  return 17 * Math.max(0, aboveLow - aboveHigh);
}

function canonicalScoringKey(rawKey) {
  const key = String(rawKey || '').toLowerCase();
  const aliases = {
    int_ret_td:'pass_int_td', pass_td_40p:'bonus_pass_td_40p', pass_td_50p:'bonus_pass_td_50p', pass_cmp_40p:'bonus_pass_cmp_40p',
    rush_td_40p:'bonus_rush_td_40p', rush_td_50p:'bonus_rush_td_50p', rush_40p:'bonus_rush_40p',
    rec_td_40p:'bonus_rec_td_40p', rec_td_50p:'bonus_rec_td_50p', rec_40p:'bonus_rec_40p',
    st_td:'def_st_td', dst_td:'def_td', fumble_rec:'fum_rec', idp_pass_def:'idp_pd', idp_pass_defended:'idp_pd',
    tkl_solo:'idp_tkl_solo', tkl_ast:'idp_tkl_ast', tkl:'idp_tkl', sack:'def_sack', int:'def_int', fum_rec:'def_fum_rec', ff:'def_ff', safe:'def_safe', blk_kick:'def_blk_kick',
  };
  if (aliases[key]) return aliases[key];
  if (/^pts_allow_/.test(key) || /^yds_allow_/.test(key)) return key;
  if (/^fgm_/.test(key) || /^fgmiss/.test(key) || /^xpm/.test(key) || /^xpmiss/.test(key)) return key;
  if (/^(idp_|st_|kr_|pr_)/.test(key)) return key;
  return key;
}

function receptionTierFraction(pos, key) {
  const profiles = {
    RB:{rec_0_4:.38,rec_5_9:.28,rec_10_19:.22,rec_20_29:.07,rec_30_39:.03,bonus_rec_40p:.02},
    WR:{rec_0_4:.16,rec_5_9:.22,rec_10_19:.34,rec_20_29:.15,rec_30_39:.07,bonus_rec_40p:.06},
    TE:{rec_0_4:.25,rec_5_9:.27,rec_10_19:.31,rec_20_29:.10,rec_30_39:.04,bonus_rec_40p:.03},
  };
  return profiles[pos]?.[key] || 0;
}

function projectedFirstDowns(p) {
  const pass = num(p.passCmp) * .52;
  const rush = num(p.rushAtt) * .24 + num(p.rushTd) * .6;
  const rec = num(p.rec) * .55;
  return { pass, rush, rec, total: pass + rush + rec };
}

function parseRangeKey(key, prefix) {
  if (!key.startsWith(prefix)) return null;
  const tail = key.slice(prefix.length);
  const nums = tail.match(/\d+/g)?.map(Number) || [];
  if (!nums.length) return null;
  if (nums.length === 1) return { low: nums[0], high: nums[0] };
  return { low: Math.min(...nums), high: Math.max(...nums) };
}

function statValue(p, rawKey) {
  if (!p) return 0;
  const key = canonicalScoringKey(rawKey);
  const direct = {
    pass_att:'passAtt',pass_cmp:'passCmp',pass_yd:'passYds',pass_td:'passTd',pass_int:'passInt',rush_att:'rushAtt',rush_yd:'rushYds',rush_td:'rushTd',
    rec:'rec',rec_yd:'recYds',rec_td:'recTd',fum_lost:'fumLost',fgm:'fgm',fga:'fga',xpm:'xpm',xpa:'xpa',
    def_sack:'sacks',def_int:'ints',def_fum_rec:'fumRec',def_ff:'ff',def_safe:'safeties',def_blk_kick:'blocks',def_td:'defTd',def_st_td:'stTd',
    idp_tkl_solo:'solo',idp_tkl_ast:'ast',idp_sack:'sacks',idp_int:'ints',idp_pd:'pd',idp_ff:'ff',idp_fum_rec:'fr',idp_tkl_loss:'tfl',idp_qb_hit:'qbHit',idp_safe:'safeties',idp_def_td:'defTd',
    kr_yd:'krYds',pr_yd:'prYds',kr_td:'krTd',pr_td:'prTd',st_tkl_solo:'stSolo',st_tkl_ast:'stAst',
  };
  if (direct[key]) return num(p[direct[key]]);
  if (key === 'idp_tkl') return num(p.solo) + num(p.ast);
  if (key === 'pass_inc') return Math.max(0, num(p.passAtt) - num(p.passCmp));
  if (key === 'pass_int_td') return num(p.passInt) * .11;
  if (key === 'fum') return num(p.fumLost) * 1.8;
  if (key === 'pass_fd') return projectedFirstDowns(p).pass;
  if (key === 'rush_fd') return projectedFirstDowns(p).rush;
  if (key === 'rec_fd') return projectedFirstDowns(p).rec;
  if (key === 'pass_2pt') return num(p.passTd) * .025;
  if (key === 'rush_2pt') return num(p.rushTd) * .025;
  if (key === 'rec_2pt') return num(p.recTd) * .025;
  if (key === 'pass_sack') return p.pos === 'QB' ? num(p.passAtt) * .06 : 0;

  if (['rec_0_4','rec_5_9','rec_10_19','rec_20_29','rec_30_39','bonus_rec_40p'].includes(key)) return num(p.rec) * receptionTierFraction(p.pos, key);
  if (key === 'bonus_pass_cmp_40p') return num(p.passYds) / 400;
  if (key === 'bonus_pass_td_40p') return num(p.passTd) * .22;
  if (key === 'bonus_pass_td_50p') return num(p.passTd) * .12;
  if (key === 'bonus_rush_40p') return num(p.rushYds) / 300;
  if (key === 'bonus_rush_td_40p') return num(p.rushTd) * .18;
  if (key === 'bonus_rush_td_50p') return num(p.rushTd) * .10;
  if (key === 'bonus_rec_td_40p') return num(p.recTd) * .20;
  if (key === 'bonus_rec_td_50p') return num(p.recTd) * .11;
  if (key === 'bonus_pass_yd_300') return rangeThresholdGames(p.passYds,300,400,70);
  if (key === 'bonus_pass_yd_400') return aboveThresholdGames(p.passYds,400,70);
  if (key === 'bonus_rush_yd_100') return rangeThresholdGames(p.rushYds,100,200,38);
  if (key === 'bonus_rush_yd_200') return aboveThresholdGames(p.rushYds,200,38);
  if (key === 'bonus_rec_yd_100') return rangeThresholdGames(p.recYds,100,200,42);
  if (key === 'bonus_rec_yd_200') return aboveThresholdGames(p.recYds,200,42);
  const combined = num(p.rushYds) + num(p.recYds);
  if (key === 'bonus_rush_rec_yd_100') return rangeThresholdGames(combined,100,200,45);
  if (key === 'bonus_rush_rec_yd_200') return aboveThresholdGames(combined,200,45);
  if (key === 'bonus_pass_cmp_25') return aboveThresholdGames(p.passCmp,25,7);
  if (key === 'bonus_rush_att_20') return aboveThresholdGames(p.rushAtt,20,6);
  if (key === 'bonus_fd_qb') return p.pos === 'QB' ? projectedFirstDowns(p).total : 0;
  if (key === 'bonus_fd_rb') return p.pos === 'RB' ? projectedFirstDowns(p).total : 0;
  if (key === 'bonus_fd_wr') return p.pos === 'WR' ? projectedFirstDowns(p).total : 0;
  if (key === 'bonus_fd_te') return p.pos === 'TE' ? projectedFirstDowns(p).total : 0;

  if (key === 'fgmiss') return Math.max(0, num(p.fga) - num(p.fgm));
  if (key === 'xpmiss') return Math.max(0, num(p.xpa) - num(p.xpm));
  if (key === 'fgm_yds') return num(p.fgm) * 41.5;
  if (key === 'fgm_yds_over_30') return num(p.fgm) * 11.5;
  const fgShares = { fgm_0_19:.04,fgm_20_29:.13,fgm_30_39:.25,fgm_40_49:.32,fgm_50_59:.21,fgm_60p:.05,fgm_50p:.26 };
  if (fgShares[key] != null) return num(p.fgm) * fgShares[key];

  const paRange = parseRangeKey(key, 'pts_allow_');
  if (paRange && p.pos === 'DEF') {
    const high = /p$/.test(key) ? 100 : paRange.high + .5;
    return gamesInRange(p.pa, paRange.low - .5, high, 10);
  }
  const yaRange = parseRangeKey(key, 'yds_allow_');
  if (yaRange && p.pos === 'DEF') {
    const high = /p$/.test(key) ? 1000 : yaRange.high + .5;
    return gamesInRange(p.ya, yaRange.low - .5, high, 80);
  }
  return 0;
}

const MODELED_KEYS = new Set([
  'pass_att','pass_cmp','pass_yd','pass_td','pass_int','pass_int_td','pass_inc','pass_sack','pass_fd','pass_2pt',
  'rush_att','rush_yd','rush_td','rush_fd','rush_2pt','rec','rec_yd','rec_td','rec_fd','rec_2pt','fum','fum_lost',
  'rec_0_4','rec_5_9','rec_10_19','rec_20_29','rec_30_39','bonus_rec_te','bonus_rec_wr','bonus_rec_rb',
  'bonus_pass_cmp_40p','bonus_pass_td_40p','bonus_pass_td_50p','bonus_rush_40p','bonus_rush_td_40p','bonus_rush_td_50p','bonus_rec_40p','bonus_rec_td_40p','bonus_rec_td_50p',
  'bonus_pass_yd_300','bonus_pass_yd_400','bonus_rush_yd_100','bonus_rush_yd_200','bonus_rec_yd_100','bonus_rec_yd_200','bonus_rush_rec_yd_100','bonus_rush_rec_yd_200','bonus_pass_cmp_25','bonus_rush_att_20','bonus_fd_qb','bonus_fd_rb','bonus_fd_wr','bonus_fd_te',
  'fgm','fga','fgmiss','xpm','xpa','xpmiss','fgm_0_19','fgm_20_29','fgm_30_39','fgm_40_49','fgm_50_59','fgm_60p','fgm_50p','fgm_yds','fgm_yds_over_30',
  'def_sack','def_int','def_fum_rec','def_ff','def_safe','def_blk_kick','def_td','def_st_td',
  'idp_tkl_solo','idp_tkl_ast','idp_tkl','idp_sack','idp_int','idp_pd','idp_ff','idp_fum_rec','idp_tkl_loss','idp_qb_hit','idp_safe','idp_def_td',
]);

function keyIsModeled(rawKey) {
  const key = canonicalScoringKey(rawKey);
  return MODELED_KEYS.has(key) || /^pts_allow_/.test(key) || /^yds_allow_/.test(key);
}

function keyFamily(key) {
  const k = canonicalScoringKey(key);
  if (/^(fg|xp)/.test(k)) return 'K';
  if (/^(def_|pts_allow_|yds_allow_)/.test(k)) return 'DEF';
  if (/^idp_/.test(k)) return 'IDP';
  if (/^(kr_|pr_|st_)/.test(k)) return 'ST';
  return 'OFF';
}

function keyAppliesToPosition(key, pos) {
  const family = keyFamily(key);
  if (family === 'K') return pos === 'K';
  if (family === 'DEF') return pos === 'DEF';
  if (family === 'IDP') return ['LB','DL','DB'].includes(pos);
  if (family === 'ST') return pos === 'DEF' || ['RB','WR','DB'].includes(pos);
  return ['QB','RB','WR','TE'].includes(pos);
}

function leaguePoints(p) {
  if (!p) return 0;
  const s = state.league?.scoring_settings || {};
  let points = 0;
  let matched = 0;
  Object.entries(s).forEach(([rawKey, raw]) => {
    const value = num(raw, NaN);
    if (!Number.isFinite(value) || value === 0 || !keyIsModeled(rawKey) || !keyAppliesToPosition(rawKey, p.pos)) return;
    const key = canonicalScoringKey(rawKey);
    if (key === 'bonus_rec_te' && p.pos !== 'TE') return;
    if (key === 'bonus_rec_wr' && p.pos !== 'WR') return;
    if (key === 'bonus_rec_rb' && p.pos !== 'RB') return;
    const stat = ['bonus_rec_te','bonus_rec_wr','bonus_rec_rb'].includes(key) ? num(p.rec) : statValue(p, key);
    points += stat * value;
    matched += 1;
  });
  return matched ? points : baselinePoints(p);
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 1;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function scoringAdjustments() {
  const rows = state.board.map((player) => {
    const p = projectionFor(player);
    if (!p) return null;
    const base = baselinePoints(p);
    const league = leaguePoints(p);
    return base > 0 ? { name: player.name, pos: normalizePos(player.pos), ratio: league / base } : null;
  }).filter(Boolean);
  if (!rows.length) return new Map();
  const overall = median(rows.map((r) => r.ratio));
  const grouped = {};
  rows.forEach((r) => { (grouped[r.pos] ||= []).push(r.ratio); });
  const positionMedian = Object.fromEntries(Object.entries(grouped).map(([pos, values]) => [pos, median(values)]));
  return new Map(rows.map((r) => {
    const posMedian = positionMedian[r.pos] || overall;
    const archetype = (r.ratio - posMedian) * 46;
    const format = (posMedian - overall) * 24;
    return [norm(r.name), clamp(archetype + format, -18, 30)];
  }));
}

function scoringCoverage() {
  const active = Object.entries(state.league?.scoring_settings || {}).filter(([, value]) => num(value) !== 0);
  const modeled = active.filter(([key]) => keyIsModeled(key));
  return { modeled: modeled.length, active: active.length, unmodeled: active.filter(([key]) => !keyIsModeled(key)).map(([key]) => key) };
}

function scoringSummary() {
  const s = state.league?.scoring_settings || {};
  const profile = rosterProfile();
  const parts = [`${num(s.rec, 0)} PPR`];
  if (s.pass_td != null) parts.push(`${s.pass_td}-pt pass TD`);
  if (profile.QB >= 2) parts.push(`${profile.QB}QB`); else if (profile.SUPER_FLEX) parts.push('Superflex');
  if (num(s.bonus_rec_te)) parts.push(`TE +${s.bonus_rec_te} PPR`);
  if (profile.DL + profile.LB + profile.DB + profile.IDP_FLEX > 0) parts.push('IDP');
  const coverage = scoringCoverage();
  if (coverage.active) parts.push(`${coverage.modeled}/${coverage.active} scoring settings modeled`);
  if (coverage.unmodeled.length) parts.push(`${coverage.unmodeled.length} flagged`);
  return parts.join(' · ');
}

function candidateAllowed(player, targets) {
  const pos = normalizePos(player.pos);
  if (['QB','RB','WR','TE'].includes(pos)) return true;
  if (pos === 'K') return targets.K > 0;
  if (pos === 'DEF') return targets.DEF > 0;
  if (['LB','DL','DB'].includes(pos)) return targets[pos] > 0 || targets.IDP_FLEX > 0;
  return false;
}

function recommendations() {
  const gone = new Set(state.picks.map((p) => norm(`${p.metadata?.first_name || ''} ${p.metadata?.last_name || ''}`)));
  const roster = mine().map((p) => normalizePos(p.metadata?.position)).filter(Boolean);
  const counts = {};
  roster.forEach((pos) => { counts[pos] = (counts[pos] || 0) + 1; });
  const targets = rosterProfile();
  const next = nextMine()[0]?.overall || state.picks.length + 1;
  const scoring = scoringAdjustments();
  const skillStarters = targets.RB + targets.WR + targets.TE + targets.FLEX;
  const skillDrafted = (counts.RB || 0) + (counts.WR || 0) + (counts.TE || 0);
  const qbPremium = targets.QB >= 2 || targets.SUPER_FLEX > 0;
  const idpStarters = targets.DL + targets.LB + targets.DB + targets.IDP_FLEX;
  const starterNeeds = ['QB','RB','WR','TE','K','DEF','DL','LB','DB'].filter((pos) => (counts[pos] || 0) < (targets[pos] || 0));
  const rosterSize = (state.league?.roster_positions || []).length || 16;
  const remainingPicks = Math.max(0, rosterSize - roster.length);

  return state.board
    .filter((p) => !gone.has(norm(p.name)) && candidateAllowed(p, targets))
    .map((p) => {
      const pos = normalizePos(p.pos);
      const base = 220 - num(p.consensusRank, 199);
      const needed = (counts[pos] || 0) < (targets[pos] || 0);
      const need = needed ? 4 : 0;
      const flexNeed = ['RB','WR','TE'].includes(pos) && skillDrafted < skillStarters ? Math.min(3, targets.FLEX * 1.35) : 0;
      const qbScarcity = pos === 'QB' ? (targets.QB >= 2 ? 34 : targets.SUPER_FLEX > 0 ? 29 : 0) : 0;
      const qbEarly = pos === 'QB' && roster.length < 3 && !qbPremium ? -6 : 0;
      const idpFormat = ['LB','DL','DB'].includes(pos) ? Math.min(38, idpStarters * 4 + (needed ? 7 : 0)) : 0;
      const specialtyEarly = ['K','DEF'].includes(pos) ? (next < 100 ? -24 : next < 125 ? -12 : -2) : (['LB','DL','DB'].includes(pos) && idpStarters <= 2 && next < 95 ? -12 : 0);
      const fillPressure = needed && remainingPicks <= starterNeeds.length + 2 ? 34 : needed && next >= 115 ? Math.min(24, (next - 105) / 2.5) : 0;
      const overfill = starterNeeds.length && !starterNeeds.includes(pos) && (counts[pos] || 0) >= (targets[pos] || 0) && !['RB','WR','TE'].includes(pos) ? -8 : 0;
      const market = num(p.adp, p.consensusRank || 199);
      const urgency = clamp((next - market) / 5, -5, 10);
      const confidence = (num(p.confidence, .65) - .65) * 10;
      const scoringAdjustment = scoring.get(norm(p.name)) || 0;
      return { ...p, pos, score: base + need + flexNeed + qbScarcity + qbEarly + idpFormat + specialtyEarly + fillPressure + overfill + urgency + confidence + scoringAdjustment, scoringAdjustment };
    })
    .sort((a, b) => b.score - a.score);
}

// The validation harness uses this same production engine surface. Keeping the
// UI/network lifecycle below separate means validation never needs Sleeper
// credentials, a live league, or a browser session.
if (typeof window !== 'undefined') {
  window.SleeperDraftEngine = {
    state,
    normalizePos,
    rosterProfile,
    projectionFor,
    leaguePoints,
    scoringCoverage,
    recommendations,
    mergeBoards,
    loadBoard,
  };
}

function card(p, i) {
  const photo = photoUrl(p.name);
  const classes = ['pick'];
  if (i === 0) classes.push('best');
  if (i >= 3) classes.push('secondary-pick');
  return `<article class="${classes.join(' ')}"><span class="rank">${i + 1}</span>${photo ? `<img class="photo" src="${photo}" alt="${p.name}" onerror="this.style.display='none'">` : ''}<div class="copy"><h2>${p.name}</h2><p>${p.pos} · ${p.team || 'FA'}${p.adp ? ` · ADP ${Number(p.adp).toFixed(1)}` : ''}</p></div>${i === 0 ? '<span class="badge">BEST PICK</span>' : ''}</article>`;
}

function render() {
  if (!state.league) return;
  $('leagueMeta').textContent = `${state.league.name || 'Sleeper league'} · ${state.league.total_rosters || '?'} teams · ${state.username} · ${scoringSummary()}`;
  $('slotValue').textContent = state.slot ? `1.${String(state.slot).padStart(2, '0')}` : '?';
  $('draftStatus').textContent = (state.draft?.status || 'PRE-DRAFT').replaceAll('_', ' ').toUpperCase();
  $('pickStatus').textContent = state.draft?.status === 'drafting' ? `Pick ${state.picks.length + 1} is on the clock` : state.draft?.status === 'complete' ? 'Draft complete' : 'Draft not started';
  const rs = recommendations();
  const visibleLimit = state.showMoreRecommendations ? 10 : 5;
  const visible = rs.slice(0, visibleLimit);
  const cards = visible.map(card).join('');
  const showMore = rs.length > 5 ? `<button id="showMoreRecs" class="show-more-recs" type="button">${state.showMoreRecommendations ? 'Show less' : 'Show more'}</button>` : '';
  $('pickCards').innerHTML = cards ? `${cards}${showMore}` : '<p>No recommendation available.</p>';
  const toggle = $('showMoreRecs'); if (toggle) toggle.onclick = () => { state.showMoreRecommendations = !state.showMoreRecommendations; render(); };
  const np = nextMine();
  $('turnCombo').innerHTML = np.length === 2 && np[1].overall === np[0].overall + 1 && rs[1] ? `<b>BACK-TO-BACK PICKS</b><br><strong>Take ${rs[0].name} + ${rs[1].name}</strong>` : '';
}

async function connect(username, leagueId) {
  clearErr('setupError'); $('connectBtn').textContent = 'Connecting…'; $('setupForm').classList.add('loading'); state.showMoreRecommendations = false;
  try {
    await Promise.all([loadBoard(), loadPlayers()]);
    if (!state.board.length) throw new Error('Rankings are temporarily unavailable.');
    const [user, league, drafts, rosters] = await Promise.all([j(`${API}/user/${encodeURIComponent(username)}`), j(`${API}/league/${leagueId}`), j(`${API}/league/${leagueId}/drafts`), j(`${API}/league/${leagueId}/rosters`)]);
    if (!user?.user_id) throw new Error('Sleeper username not found.');
    state.username = user.username || username; state.leagueId = leagueId; state.user = user; state.league = league; state.rosters = rosters || [];
    if (!rosterForUser()) throw new Error('That Sleeper user is not on this league roster.');
    state.draft = (drafts || []).find((d) => String(d.season) === '2026') || (drafts || [])[0] || null;
    if (!state.draft) throw new Error('No Sleeper draft was found for this league.');
    state.slot = resolveSlot(); if (!state.slot) throw new Error('Sleeper has not assigned a draft slot to this roster yet.');
    state.picks = await j(`${API}/draft/${state.draft.draft_id}/picks`) || [];
    const q = new URLSearchParams({ user: state.username, league: state.leagueId }); history.replaceState(null, '', `${location.pathname}?${q}`);
    localStorage.setItem('wtdn-user', state.username); localStorage.setItem('wtdn-league', state.leagueId);
    $('setup').classList.add('hidden'); $('assistant').classList.remove('hidden'); $('shareBtn').classList.remove('hidden'); render(); await sync();
    if (state.timer) clearInterval(state.timer); state.timer = setInterval(sync, 5000);
  } catch (e) { showErr('setupError', e.message || 'Could not connect to Sleeper.'); }
  finally { $('connectBtn').textContent = 'Show Me Who to Draft Next'; $('setupForm').classList.remove('loading'); }
}

async function sync() {
  try {
    clearErr('syncError');
    const [league, drafts, rosters] = await Promise.all([j(`${API}/league/${state.leagueId}`), j(`${API}/league/${state.leagueId}/drafts`), j(`${API}/league/${state.leagueId}/rosters`)]);
    state.league = league; state.rosters = rosters || []; state.draft = (drafts || []).find((d) => String(d.season) === '2026') || (drafts || [])[0] || state.draft; state.slot = resolveSlot() || state.slot;
    if (state.draft) state.picks = await j(`${API}/draft/${state.draft.draft_id}/picks`) || [];
    $('lastSync').textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`; render();
  } catch { showErr('syncError', 'Sleeper data is temporarily unavailable. Retrying automatically.'); $('lastSync').textContent = 'Retrying…'; }
}

$('setupForm').addEventListener('submit', (e) => { e.preventDefault(); connect($('username').value.trim(), $('leagueId').value.trim()); });
$('changeLeague').onclick = () => { if (state.timer) clearInterval(state.timer); state.timer = null; state.showMoreRecommendations = false; $('assistant').classList.add('hidden'); $('setup').classList.remove('hidden'); $('shareBtn').classList.add('hidden'); history.replaceState(null, '', location.pathname); };
$('shareBtn').onclick = async () => { const url = location.href; try { if (navigator.share) await navigator.share({ title: 'Who To Draft Next', url }); else await navigator.clipboard.writeText(url); } catch {} };
const params = new URLSearchParams(location.search); const u = params.get('user') || localStorage.getItem('wtdn-user') || ''; const l = params.get('league') || localStorage.getItem('wtdn-league') || '';
$('username').value = u; $('leagueId').value = l; if (params.get('user') && params.get('league')) connect(params.get('user'), params.get('league'));
