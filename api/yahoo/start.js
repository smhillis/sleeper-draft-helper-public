const yahoo = require('../../lib/yahoo');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const { clientId, redirectUri, authUrl } = yahoo.config();
    const state = yahoo.createState();
    yahoo.setState(res, state);

    const url = new URL(authUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('language', 'en-us');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', 'openid fspt-r');

    res.redirect(302, url.toString());
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
