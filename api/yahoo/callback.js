const yahoo = require('../../lib/yahoo');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  try {
    const requestUrl = new URL(req.url, 'https://whotodraftnext.com');
    const oauthError = requestUrl.searchParams.get('error');
    const oauthErrorDescription = requestUrl.searchParams.get('error_description');
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const expectedState = yahoo.getState(req);

    if (oauthError) {
      const message = oauthErrorDescription || oauthError;
      return res.redirect(302, `/?provider=yahoo&yahooError=${encodeURIComponent(message)}`);
    }
    if (!code) return res.redirect(302, '/?provider=yahoo&yahooError=Missing%20authorization%20code');
    if (!state || !expectedState || state !== expectedState) {
      return res.redirect(302, '/?provider=yahoo&yahooError=Invalid%20OAuth%20state');
    }

    yahoo.clearState(res);
    const { clientId, clientSecret, redirectUri, tokenUrl } = yahoo.config();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    });

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const { text, data } = await yahoo.parseResponse(tokenRes);
    if (!tokenRes.ok || !data?.access_token) {
      return res.redirect(302, `/?provider=yahoo&yahooError=${encodeURIComponent(`Yahoo token exchange failed (${tokenRes.status}) ${text.slice(0, 160)}`)}`);
    }

    yahoo.storeTokens(res, {
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
      tokenType: String(data.token_type || 'Bearer'),
      scope: String(data.scope || ''),
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 - 30000,
    });

    return res.redirect(302, '/?provider=yahoo&yahoo=connected');
  } catch (error) {
    return res.redirect(302, `/?provider=yahoo&yahooError=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
  }
};
