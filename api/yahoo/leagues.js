const yahoo = require('../../lib/yahoo');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  try {
    const result = await yahoo.yahooGet(req, res, 'users;use_login=1/games;game_codes=nfl/leagues');
    if (!result.response.ok) {
      return res.status(result.response.status).json({
        ok: false,
        status: result.response.status,
        error: `Yahoo Fantasy API returned HTTP ${result.response.status}`,
        detail: result.text.slice(0, 500),
      });
    }

    const leagues = yahoo.normalizeLeagues(result.data);
    return res.status(200).json({ ok: true, leagues, count: leagues.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes('not connected') ? 401 : 500;
    return res.status(status).json({ ok: false, error: message });
  }
};
