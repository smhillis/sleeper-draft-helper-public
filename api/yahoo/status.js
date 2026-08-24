const yahoo = require('../../lib/yahoo');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const tokens = yahoo.getStoredTokens(req);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      connected: Boolean(tokens?.accessToken),
      scope: tokens?.scope || '',
      expiresAt: tokens?.expiresAt || null,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, connected: false, error: error instanceof Error ? error.message : String(error) });
  }
};
