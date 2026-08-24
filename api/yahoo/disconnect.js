const yahoo = require('../../lib/yahoo');

module.exports = async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'Method not allowed' });
  yahoo.clearTokens(res);
  yahoo.clearState(res);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, connected: false });
};
