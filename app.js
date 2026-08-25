const API = 'https://api.sleeper.app/v1';
const state = {
  username: '', leagueId: '', user: null, league: null, draft: null, rosters: [], picks: [], slot: null, timer: null,
  board: [], players: {}, projections: {}, showMoreRecommendations: false,
};

const $ = (id) => document.getElementById(id);
const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

async function j(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`Sleeper returned ${r.status}`);
  return r.json();
}

function showErr(id, msg) { const el = $(id); el.textContent = msg; el.style.display = 'block'; }
function clearErr(id) { $(id).style.display = 'none'; }

async function loadBoard() {
  const [rankingsResult, projectionsResult] = await Promise.allSettled([
    fetch(`data/rankings.json?v=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
    fetch(`data/projections.json?v=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()),
  ]);
  if (rankingsResult.status !== 'fulfilled') throw new Error('Rankings are temporarily unavailable.');
  state.board = rankingsResult.value.players || [];
  const raw = projectionsResult.status === 'fulfilled' ? projectionsResult.value.players || {} : {};
  state.projections = Object.fromEntries(Object.entries(raw).map(([name, projection]) => [norm(name), projection]));
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
  for (let r = 1; r < 30; r += 1) {
    const overall = r % 2 ? ((r - 1) * n + state.slot) : (r * n - state.slot + 1);
    if (overall > done) out.push({ overall, round: r });
    if (out.length === 2) break;
  }
  return out;
}

function rosterProfile() {
  const slots = state.league?.roster_positions || [];
  const count = (name) => slots.filter((slot) => String(slot).toUpperCase() === name).length;
  return {
    QB: count('QB'), RB: count('RB'), WR: count('WR'), TE: count('TE'),
    FLEX: slots.filter((slot) => ['FLEX', 'REC_FLEX', 'WRRB_FLEX', 'WRRBTE_FLEX'].includes(String(slot).toUpperCase())).length,
    SUPER_FLEX: slots.filter((slot) => ['SUPER_FLEX', 'QB_FLEX'].includes(String(slot).toUpperCase())).length,
  };
}

function projectionFor(player) { return state.projections[norm(player?.name)] || null; }

function baselinePoints(p) {
  if (!p) return 0;
  return num(p.passYds) * 0.04 + num(p.passTd) * 4 + num(p.passInt) * -2
    + num(p.rushYds) * 0.1 + num(p.rushTd) * 6 + num(p.rec)
    + num(p.recYds) * 0.1 + num(p.recTd) * 6 + num(p.fumLost) * -2;
}

function aboveThresholdGames(total, threshold, sd) {
  if (!total) return 0;
  const avg = num(total) / 17;
  const z = (avg - threshold) / Math.max(1, sd);
  return 17 / (1 + Math.exp(-1.7 * z));
}
function rangeThresholdGames(total, low, high, sd) {
  return Math.max(0, aboveThresholdGames(total, low, sd) - aboveThresholdGames(total, high, sd));
}

function canonicalScoringKey(key) {
  const aliases = {
    int_ret_td: 'pass_int_td',
    pass_td_40p: 'bonus_pass_td_40p', pass_td_50p: 'bonus_pass_td_50p', pass_cmp_40p: 'bonus_pass_cmp_40p',
    rush_td_40p: 'bonus_rush_td_40p', rush_td_50p: 'bonus_rush_td_50p', rush_40p: 'bonus_rush_40p',
    rec_td_40p: 'bonus_rec_td_40p', rec_td_50p: 'bonus_rec_td_50p', rec_40p: 'bonus_rec_40p',
  };
  return aliases[key] || key;
}

function receptionTierFraction(pos, key) {
  const profiles = {
    RB: { rec_0_4:.38, rec_5_9:.28, rec_10_19:.22, rec_20_29:.07, rec_30_39:.03, bonus_rec_40p:.02 },
    WR: { rec_0_4:.16, rec_5_9:.22, rec_10_19:.34, rec_20_29:.15, rec_30_39:.07, bonus_rec_40p:.06 },
    TE: { rec_0_4:.25, rec_5_9:.27, rec_10_19:.31, rec_20_29:.10, rec_30_39:.04, bonus_rec_40p:.03 },
  };
  return profiles[pos]?.[key] || 0;
}

function projectedFirstDowns(p) {
  const pass = num(p.passCmp) * .52;
  const rush = num(p.rushAtt) * .24 + num(p.rushTd) * .6;
  const rec = num(p.rec) * .55;
  return { pass, rush, rec, total: pass + rush + rec };
}

function statValue(p, rawKey) {
  if (!p) return 0;
  const key = canonicalScoringKey(rawKey);
  const direct = {
    pass_att:'passAtt', pass_cmp:'passCmp', pass_yd:'passYds', pass_td:'passTd', pass_int:'passInt',
    rush_att:'rushAtt', rush_yd:'rushYds', rush_td:'rushTd', rec:'rec', rec_yd:'recYds', rec_td:'recTd', fum_lost:'fumLost',
  };
  if (direct[key]) return num(p[direct[key]]);
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

  if (key === 'bonus_pass_yd_300') return rangeThresholdGames(p.passYds, 300, 400, 70);
  if (key === 'bonus_pass_yd_400') return aboveThresholdGames(p.passYds, 400, 70);
  if (key === 'bonus_rush_yd_100') return rangeThresholdGames(p.rushYds, 100, 200, 38);
  if (key === 'bonus_rush_yd_200') return aboveThresholdGames(p.rushYds, 200, 38);
  if (key === 'bonus_rec_yd_100') return rangeThresholdGames(p.recYds, 100, 200, 42);
  if (key === 'bonus_rec_yd_200') return aboveThresholdGames(p.recYds, 200, 42);
  const combined = num(p.rushYds) + num(p.recYds);
  if (key === 'bonus_rush_rec_yd_100') return rangeThresholdGames(combined, 100, 200, 45);
  if (key === 'bonus_rush_rec_yd_200') return aboveThresholdGames(combined, 200, 45);
  if (key === 'bonus_pass_cmp_25') return aboveThresholdGames(p.passCmp, 25, 7);
  if (key === 'bonus_rush_att_20') return aboveThresholdGames(p.rushAtt, 20, 6);

  if (key === 'bonus_fd_qb') return p.pos === 'QB' ? projectedFirstDowns(p).total : 0;
  if (key === 'bonus_fd_rb') return p.pos === 'RB' ? projectedFirstDowns(p).total : 0;
  if (key === 'bonus_fd_wr') return p.pos === 'WR' ? projectedFirstDowns(p).total : 0;
  if (key === 'bonus_fd_te') return p.pos === 'TE' ? projectedFirstDowns(p).total : 0;
  return 0;
}

const MODELED_KEYS = new Set([
  'pass_att','pass_cmp','pass_yd','pass_td','pass_int','pass_int_td','pass_inc','pass_sack','pass_fd','pass_2pt',
  'rush_att','rush_yd','rush_td','rush_fd','rush_2pt','rec','rec_yd','rec_td','rec_fd','rec_2pt','fum','fum_lost',
  'rec_0_4','rec_5_9','rec_10_19','rec_20_29','rec_30_39',
  'bonus_pass_cmp_40p','bonus_pass_td_40p','bonus_pass_td_50p','bonus_rush_40p','bonus_rush_td_40p','bonus_rush_td_50p','bonus_rec_40p','bonus_rec_td_40p','bonus_rec_td_50p',
  'bonus_pass_yd_300','bonus_pass_yd_400','bonus_rush_yd_100','bonus_rush_yd_200','bonus_rec_yd_100','bonus_rec_yd_200',
  'bonus_rush_rec_yd_100','bonus_rush_rec_yd_200','bonus_pass_cmp_25','bonus_rush_att_20',
  'bonus_fd_qb','bonus_fd_rb','bonus_fd_wr','bonus_fd_te',
]);

function isOffensiveScoringKey(key) {
  const canonical = canonicalScoringKey(key);
  return /^(pass|rush|rec|fum|bonus_pass|bonus_rush|bonus_rec|bonus_fd)/.test(canonical);
}

function leaguePoints(p) {
  if (!p) return 0;
  const s = state.league?.scoring_settings || {};
  let points = 0;
  let matched = 0;
  Object.entries(s).forEach(([rawKey, raw]) => {
    const value = num(raw, NaN);
    if (!Number.isFinite(value) || value === 0) return;
    const key = canonicalScoringKey(rawKey);
    if (MODELED_KEYS.has(key)) { points += statValue(p, key) * value; matched += 1; }
  });
  if (p.pos === 'TE' && num(s.bonus_rec_te)) { points += num(p.rec) * num(s.bonus_rec_te); matched += 1; }
  if (p.pos === 'WR' && num(s.bonus_rec_wr)) { points += num(p.rec) * num(s.bonus_rec_wr); matched += 1; }
  if (p.pos === 'RB' && num(s.bonus_rec_rb)) { points += num(p.rec) * num(s.bonus_rec_rb); matched += 1; }
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
    return base > 0 ? { name: player.name, pos: player.pos, ratio: league / base } : null;
  }).filter(Boolean);
  if (!rows.length) return new Map();
  const overall = median(rows.map((r) => r.ratio));
  const grouped = {};
  rows.forEach((r) => { (grouped[r.pos] ||= []).push(r.ratio); });
  const positionMedian = Object.fromEntries(Object.entries(grouped).map(([pos, values]) => [pos, median(values)]));
  return new Map(rows.map((r) => {
    const posMedian = positionMedian[r.pos] || overall;
    const archetype = (r.ratio - posMedian) * 42;
    const format = (posMedian - overall) * 22;
    return [norm(r.name), clamp(archetype + format, -14, 24)];
  }));
}

function fallbackScoringAdjust(player) {
  const s = state.league?.scoring_settings || {};
  if (player.pos === 'QB') return clamp((num(s.pass_td, 4) - 4) * 1.2 + (num(s.pass_yd, 0.04) - 0.04) * 120, -8, 10);
  const ppr = num(s.rec, 1);
  const positionalPremium = player.pos === 'TE' ? num(s.bonus_rec_te) : player.pos === 'WR' ? num(s.bonus_rec_wr) : player.pos === 'RB' ? num(s.bonus_rec_rb) : 0;
  const weight = player.pos === 'TE' ? 2.5 : player.pos === 'WR' ? 2 : 1.4;
  return clamp((ppr - 1) * weight + positionalPremium * 3, -6, 8);
}

function scoringCoverage() {
  const s = state.league?.scoring_settings || {};
  const active = Object.entries(s).filter(([key, value]) => isOffensiveScoringKey(key) && num(value) !== 0);
  const modeled = active.filter(([rawKey]) => MODELED_KEYS.has(canonicalScoringKey(rawKey)) || ['bonus_rec_te','bonus_rec_wr','bonus_rec_rb'].includes(rawKey));
  return { modeled: modeled.length, active: active.length };
}

function scoringSummary() {
  const s = state.league?.scoring_settings || {};
  const profile = rosterProfile();
  const parts = [`${num(s.rec, 0)} PPR`];
  if (s.pass_td != null) parts.push(`${s.pass_td}-pt pass TD`);
  if (profile.QB >= 2) parts.push(`${profile.QB}QB`); else if (profile.SUPER_FLEX) parts.push('Superflex');
  if (num(s.bonus_rec_te)) parts.push(`TE +${s.bonus_rec_te} PPR`);
  const coverage = scoringCoverage();
  if (coverage.active) parts.push(`${coverage.modeled}/${coverage.active} offensive settings modeled`);
  return parts.join(' · ');
}

function recommendations() {
  const gone = new Set(state.picks.map((p) => norm(`${p.metadata?.first_name || ''} ${p.metadata?.last_name || ''}`)));
  const roster = mine().map((p) => p.metadata?.position).filter(Boolean).map((p) => p === 'DST' ? 'DEF' : p);
  const counts = {};
  roster.forEach((pos) => { counts[pos] = (counts[pos] || 0) + 1; });
  const targets = rosterProfile();
  const next = nextMine()[0]?.overall || state.picks.length + 1;
  const scoring = scoringAdjustments();
  const skillStarters = targets.RB + targets.WR + targets.TE + targets.FLEX;
  const skillDrafted = (counts.RB || 0) + (counts.WR || 0) + (counts.TE || 0);
  const qbPremium = targets.QB >= 2 || targets.SUPER_FLEX > 0;
  const starterNeeds = ['QB','RB','WR','TE'].filter((pos) => (counts[pos] || 0) < (targets[pos] || 0));

  return state.board.filter((p) => !gone.has(norm(p.name))).map((p) => {
    const base = 110 - Number(p.consensusRank || 99);
    const need = (counts[p.pos] || 0) < (targets[p.pos] || 0) ? 3.5 : 0;
    const flexNeed = ['RB','WR','TE'].includes(p.pos) && skillDrafted < skillStarters ? Math.min(2.5, targets.FLEX * 1.25) : 0;
    const qbScarcity = p.pos === 'QB' ? (targets.QB >= 2 ? 30 : targets.SUPER_FLEX > 0 ? 25 : 0) : 0;
    const qbEarly = p.pos === 'QB' && roster.length < 3 && !qbPremium ? -5 : 0;
    const overfill = starterNeeds.length && !starterNeeds.includes(p.pos) && (counts[p.pos] || 0) >= (targets[p.pos] || 0) ? -2 : 0;
    const market = Number(p.adp || p.consensusRank || 99);
    const urgency = clamp((next - market) / 5, -4, 8);
    const confidence = (Number(p.confidence || 0.75) - 0.75) * 8;
    const scoringAdjustment = scoring.has(norm(p.name)) ? scoring.get(norm(p.name)) : fallbackScoringAdjust(p);
    return { ...p, score: base + need + flexNeed + qbScarcity + qbEarly + overfill + urgency + confidence + scoringAdjustment, scoringAdjustment };
  }).sort((a, b) => b.score - a.score);
}

function card(p, i) {
  const photo = photoUrl(p.name);
  const classes = ['pick'];
  if (i === 0) classes.push('best');
  if (i >= 3) classes.push('secondary-pick');
  return `<article class="${classes.join(' ')}"><span class="rank">${i + 1}</span>${photo ? `<img class="photo" src="${photo}" alt="${p.name}" onerror="this.style.display='none'">` : ''}<div class="copy"><h2>${p.name}</h2><p>${p.pos} · ${p.team}${p.adp ? ` · ADP ${Number(p.adp).toFixed(1)}` : ''}</p></div>${i === 0 ? '<span class="badge">BEST PICK</span>' : ''}</article>`;
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
