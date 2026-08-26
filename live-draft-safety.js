(function installLiveDraftSafety(global) {
  'use strict';

  const API = 'https://api.sleeper.app/v1';
  const POLL_MS = 1000;
  const WATCHDOG_MS = 250;
  const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const engine = global.SleeperDraftEngine;
  if (!engine?.state) return;

  const state = engine.state;
  const originalRecommendations = typeof global.recommendations === 'function'
    ? global.recommendations
    : engine.recommendations;

  function pickName(pick) {
    const metadata = pick?.metadata || {};
    return metadata.full_name
      || metadata.player_name
      || `${metadata.first_name || ''} ${metadata.last_name || ''}`.trim();
  }

  function isDrafted(player) {
    const draftedIds = new Set(
      (state.picks || []).map((pick) => String(pick?.player_id || '')).filter(Boolean),
    );
    const draftedNames = new Set(
      (state.picks || []).map((pick) => norm(pickName(pick))).filter(Boolean),
    );
    const sleeperPlayer = state.players?.[norm(player?.name)];
    const sleeperId = String(sleeperPlayer?.id || '');
    return (sleeperId && draftedIds.has(sleeperId)) || draftedNames.has(norm(player?.name));
  }

  function safeRecommendations() {
    const recommendations = typeof originalRecommendations === 'function'
      ? originalRecommendations()
      : [];
    return recommendations.filter((player) => !isDrafted(player));
  }

  global.recommendations = safeRecommendations;
  engine.recommendations = safeRecommendations;

  async function getJson(url) {
    const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Sleeper returned ${response.status}`);
    return response.json();
  }

  function chooseDraft(drafts) {
    const list = Array.isArray(drafts) ? drafts : [];
    const currentId = String(state.draft?.draft_id || '');
    return list.find((draft) => String(draft?.season) === '2026' && draft?.status === 'drafting')
      || list.find((draft) => draft?.status === 'drafting')
      || list.find((draft) => String(draft?.draft_id || '') === currentId)
      || list.find((draft) => String(draft?.season) === '2026' && draft?.status === 'pre_draft')
      || list.find((draft) => String(draft?.season) === '2026')
      || list[0]
      || state.draft
      || null;
  }

  function renderUnsafeSyncMessage() {
    const error = document.getElementById('syncError');
    if (error) {
      error.textContent = 'Live Sleeper draft sync is unavailable. Recommendations are withheld until the draft feed catches up.';
      error.style.display = 'block';
    }
    const lastSync = document.getElementById('lastSync');
    if (lastSync) lastSync.textContent = 'Live sync unavailable';
    const cards = document.getElementById('pickCards');
    if (cards) cards.innerHTML = '<p>Waiting for current Sleeper draft picks. Do not use stale recommendations.</p>';
  }

  async function safeSync() {
    if (!state.leagueId || state.__liveDraftSyncInFlight) return;
    state.__liveDraftSyncInFlight = true;
    try {
      const [league, drafts, rosters] = await Promise.all([
        getJson(`${API}/league/${state.leagueId}`),
        getJson(`${API}/league/${state.leagueId}/drafts`),
        getJson(`${API}/league/${state.leagueId}/rosters`),
      ]);
      const draft = chooseDraft(drafts);
      if (!draft?.draft_id) throw new Error('No active Sleeper draft was found.');
      const picks = await getJson(`${API}/draft/${draft.draft_id}/picks`);
      const nextPicks = Array.isArray(picks) ? picks : [];
      const sameDraft = String(state.draft?.draft_id || '') === String(draft.draft_id);

      // During a live draft the completed-pick feed should not move backwards.
      // If Sleeper/CDN briefly returns an older snapshot, keep the newer state
      // rather than reintroducing already-drafted players into recommendations.
      if (sameDraft && Array.isArray(state.picks) && nextPicks.length < state.picks.length) {
        throw new Error('Sleeper returned an older draft snapshot.');
      }

      state.league = league;
      state.rosters = rosters || [];
      state.draft = draft;
      state.picks = nextPicks;
      if (typeof global.resolveSlot === 'function') state.slot = global.resolveSlot() || state.slot;
      state.__liveDraftSafetyLastSuccess = Date.now();

      const error = document.getElementById('syncError');
      if (error) error.style.display = 'none';
      const lastSync = document.getElementById('lastSync');
      if (lastSync) {
        lastSync.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
      }
      if (typeof global.render === 'function') global.render();
    } catch {
      renderUnsafeSyncMessage();
    } finally {
      state.__liveDraftSyncInFlight = false;
    }
  }

  function ensureFastPolling() {
    if (!state.leagueId) return;

    // app.js owns state.timer. Do not put the safety interval there: connect()
    // clears/replaces state.timer after its initial sync, which used to kill the
    // 1-second safety poller and leave a stale interval ID behind.
    if (!state.__liveDraftSafetyTimer) {
      state.__liveDraftSafetyTimer = setInterval(safeSync, POLL_MS);
      safeSync();
    }

    // Once the independent safety poller exists, remove any slower legacy
    // interval created by app.js so it cannot overwrite live draft state.
    if (state.timer && state.timer !== state.__liveDraftSafetyTimer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  global.sync = safeSync;
  state.__liveDraftSafetyWatchdog = setInterval(ensureFastPolling, WATCHDOG_MS);
  ensureFastPolling();
})(window);
