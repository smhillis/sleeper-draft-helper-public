const crypto = require('crypto');

const TOKENS_COOKIE = 'wtdn_yahoo_tokens';
const STATE_COOKIE = 'wtdn_yahoo_state';
const DEFAULT_REDIRECT_URI = 'https://whotodraftnext.com/api/yahoo/callback';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function config() {
  return {
    clientId: requireEnv('YAHOO_CLIENT_ID'),
    clientSecret: requireEnv('YAHOO_CLIENT_SECRET'),
    redirectUri: process.env.YAHOO_REDIRECT_URI || DEFAULT_REDIRECT_URI,
    authUrl: 'https://api.login.yahoo.com/oauth2/request_auth',
    tokenUrl: 'https://api.login.yahoo.com/oauth2/get_token',
    apiBase: 'https://fantasysports.yahooapis.com/fantasy/v2',
  };
}

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie || '';
  raw.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  });
  return out;
}

function appendCookie(res, value) {
  const current = res.getHeader('Set-Cookie');
  if (!current) res.setHeader('Set-Cookie', [value]);
  else if (Array.isArray(current)) res.setHeader('Set-Cookie', [...current, value]);
  else res.setHeader('Set-Cookie', [current, value]);
}

function cookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function clearCookie(res, name) {
  appendCookie(res, `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

function keyFromSecret(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function encrypt(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decrypt(value, secret) {
  try {
    const buf = Buffer.from(value, 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromSecret(secret), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8'));
  } catch {
    return null;
  }
}

function createState() {
  return crypto.randomBytes(24).toString('hex');
}

function setState(res, state) {
  appendCookie(res, cookie(STATE_COOKIE, state, 60 * 10));
}

function getState(req) {
  return parseCookies(req)[STATE_COOKIE] || null;
}

function clearState(res) {
  clearCookie(res, STATE_COOKIE);
}

function storeTokens(res, tokens) {
  const { clientSecret } = config();
  appendCookie(res, cookie(TOKENS_COOKIE, encrypt(tokens, clientSecret), 60 * 60 * 24 * 14));
}

function getStoredTokens(req) {
  const { clientSecret } = config();
  const raw = parseCookies(req)[TOKENS_COOKIE];
  return raw ? decrypt(raw, clientSecret) : null;
}

function clearTokens(res) {
  clearCookie(res, TOKENS_COOKIE);
}

async function parseResponse(response) {
  const text = await response.text();
  if (!text) return { text: '', data: null };
  try {
    return { text, data: JSON.parse(text) };
  } catch {
    return { text, data: null };
  }
}

async function refreshTokens(tokens) {
  if (!tokens || !tokens.refreshToken) throw new Error('Yahoo refresh token is unavailable.');
  const { clientId, clientSecret, redirectUri, tokenUrl } = config();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refreshToken,
    redirect_uri: redirectUri,
  });
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const { text, data } = await parseResponse(response);
  if (!response.ok || !data?.access_token) {
    throw new Error(`Yahoo token refresh failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token || tokens.refreshToken),
    tokenType: String(data.token_type || tokens.tokenType || 'Bearer'),
    scope: String(data.scope || tokens.scope || ''),
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 - 30000,
  };
}

async function validTokens(req, res) {
  let tokens = getStoredTokens(req);
  if (!tokens?.accessToken) throw new Error('Yahoo is not connected.');
  if (Date.now() >= Number(tokens.expiresAt || 0) - 5 * 60 * 1000) {
    tokens = await refreshTokens(tokens);
    storeTokens(res, tokens);
  }
  return tokens;
}

async function yahooGet(req, res, endpoint) {
  const tokens = await validTokens(req, res);
  const { apiBase } = config();
  const separator = endpoint.includes('?') ? '&' : '?';
  const url = `${apiBase}/${endpoint}${separator}format=json`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });
  const parsed = await parseResponse(response);
  return { response, url, ...parsed };
}

function collectEntities(root, keyField) {
  const found = [];
  const seen = new Set();

  function add(candidate) {
    const key = candidate?.[keyField];
    if (key == null) return;
    const id = String(key);
    if (seen.has(id)) return;
    seen.add(id);
    found.push(candidate);
  }

  function walk(node) {
    if (!node) return;
    if (Array.isArray(node)) {
      const merged = {};
      for (const item of node) {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          for (const [k, v] of Object.entries(item)) {
            if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) merged[k] = v;
          }
        }
      }
      add(merged);
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') {
      add(node);
      Object.values(node).forEach(walk);
    }
  }

  walk(root);
  return found;
}

function normalizeLeagues(data) {
  const all = collectEntities(data, 'league_key').map((league) => ({
    leagueKey: String(league.league_key || ''),
    leagueId: String(league.league_id || ''),
    name: String(league.name || 'Yahoo league'),
    season: league.season != null ? String(league.season) : '',
    numTeams: Number(league.num_teams || 0) || null,
    draftStatus: String(league.draft_status || ''),
    scoringType: String(league.scoring_type || ''),
    url: String(league.url || ''),
  }));
  const current = all.filter((league) => league.season === '2026');
  return current.length ? current : all;
}

module.exports = {
  config,
  createState,
  setState,
  getState,
  clearState,
  storeTokens,
  getStoredTokens,
  clearTokens,
  parseResponse,
  yahooGet,
  normalizeLeagues,
};
