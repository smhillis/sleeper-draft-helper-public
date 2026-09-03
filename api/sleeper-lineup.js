let playerCache = null;
let playerCacheAt = 0;

const API = 'https://api.sleeper.app/v1';
const CACHE_MS = 6 * 60 * 60 * 1000;

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'WhoToDraftNext-Lineup/1.0' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Sleeper returned HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Sleeper took too long to respond');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function getPlayerPool() {
  if (playerCache && Date.now() - playerCacheAt < CACHE_MS) return playerCache;
  playerCache = await fetchJson(`${API}/players/nfl`, 20000);
  playerCacheAt = Date.now();
  return playerCache;
}

export default async function handler(req, res) {
  try {
    const username = String(req.query.username || '').trim();
    const leagueId = String(req.query.leagueId || '').trim();
    if (!username) return res.status(400).json({ ok: false, error: 'Sleeper username is required.' });

    const user = await fetchJson(`${API}/user/${encodeURIComponent(username)}`);
    if (!user?.user_id) return res.status(404).json({ ok: false, error: 'Sleeper user not found.' });

    if (!leagueId) {
      const leagues = (await fetchJson(`${API}/user/${user.user_id}/leagues/nfl/2026`)) || [];
      return res.status(200).json({
        ok: true,
        userId: String(user.user_id),
        leagues: leagues.filter((l) => l?.league_id).map((l) => ({ leagueId: String(l.league_id), name: l.name || String(l.league_id) })),
      });
    }

    const [league, rosters, pool] = await Promise.all([
      fetchJson(`${API}/league/${encodeURIComponent(leagueId)}`),
      fetchJson(`${API}/league/${encodeURIComponent(leagueId)}/rosters`),
      getPlayerPool(),
    ]);

    const mine = (rosters || []).find((r) =>
      String(r.owner_id) === String(user.user_id) ||
      (r.co_owners || []).map(String).includes(String(user.user_id))
    );
    if (!mine) return res.status(404).json({ ok: false, error: 'Could not identify your roster in this league.' });

    const ids = Array.from(new Set([...(mine.players || []), ...(mine.starters || [])].map(String).filter(Boolean)));
    const players = ids.map((id) => {
      const p = pool?.[id] || {};
      return {
        id,
        name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id,
        position: p.position || '',
        team: p.team || 'FA',
        injuryStatus: p.injury_status || p.status || '',
      };
    }).filter((p) => p.position);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      league: {
        leagueId: String(league?.league_id || leagueId),
        name: league?.name || 'Sleeper league',
        rosterPositions: league?.roster_positions || [],
        scoringSettings: league?.scoring_settings || {},
      },
      roster: {
        players,
        starters: (mine.starters || []).map(String).filter((id) => id && id !== '0'),
      },
    });
  } catch (error) {
    return res.status(502).json({ ok: false, error: error?.message || 'Sleeper lineup data could not be loaded.' });
  }
}
