export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const username = String(req.query?.username || '').trim();
  if (!username) {
    res.status(400).json({ error: 'Sleeper username is required.' });
    return;
  }

  const API = 'https://api.sleeper.app/v1';
  try {
    const userResponse = await fetch(`${API}/user/${encodeURIComponent(username)}`, {
      headers: { 'User-Agent': 'WhoToDraftNext/1.0' },
      cache: 'no-store'
    });
    if (!userResponse.ok) {
      res.status(userResponse.status === 404 ? 404 : 502).json({ error: 'Sleeper username not found.' });
      return;
    }

    const user = await userResponse.json();
    if (!user?.user_id) {
      res.status(404).json({ error: 'Sleeper username not found.' });
      return;
    }

    const leaguesResponse = await fetch(`${API}/user/${encodeURIComponent(user.user_id)}/leagues/nfl/2026`, {
      headers: { 'User-Agent': 'WhoToDraftNext/1.0' },
      cache: 'no-store'
    });
    if (!leaguesResponse.ok) {
      res.status(502).json({ error: `Sleeper league lookup failed (${leaguesResponse.status}).` });
      return;
    }

    const leagues = await leaguesResponse.json();
    const current = (Array.isArray(leagues) ? leagues : [])
      .filter(item => item?.league_id)
      .map(item => ({ league_id: String(item.league_id), name: item.name || String(item.league_id) }));

    res.status(200).json({
      user: { user_id: String(user.user_id), username: user.username || username },
      leagues: current
    });
  } catch (error) {
    res.status(502).json({ error: 'Sleeper is temporarily unavailable. Please try again.' });
  }
}
