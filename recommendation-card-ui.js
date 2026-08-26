(function installRecommendationCardUi(global) {
  'use strict';

  const numeric = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function signedWhole(value) {
    const n = numeric(value);
    if (n == null) return '—';
    const rounded = Math.round(n);
    return `${rounded >= 0 ? '+' : ''}${rounded}`;
  }

  function whole(value) {
    const n = numeric(value);
    return n == null ? '—' : String(Math.round(n));
  }

  function pct(value) {
    const n = numeric(value);
    return n == null ? null : Math.max(0, Math.min(100, Math.round(n * 100)));
  }

  function leagueContext() {
    try {
      if (typeof state === 'undefined' || !state?.league) return { scoring: {}, roster: [] };
      return {
        scoring: state.league.scoring_settings || {},
        roster: state.league.roster_positions || [],
      };
    } catch {
      return { scoring: {}, roster: [] };
    }
  }

  function scoringFormatEvidence(player, alternative) {
    const scoringEdge = numeric(player?.scoringAdjustment, 0) - numeric(alternative?.scoringAdjustment, 0);
    if (Math.abs(scoringEdge) < 3) return null;

    const { scoring, roster } = leagueContext();
    const positions = [String(player?.pos || '').toUpperCase(), String(alternative?.pos || '').toUpperCase()];
    const skill = positions.some((pos) => ['RB', 'WR', 'TE'].includes(pos));
    const qb = positions.includes('QB');
    const te = positions.includes('TE');
    const receptions = numeric(scoring.rec, 0);
    const passTd = numeric(scoring.pass_td, 0);
    const tePremium = numeric(scoring.bonus_rec_te, 0);
    const superflex = roster.some((slot) => String(slot).toUpperCase() === 'SUPER_FLEX');
    const lead = `${player.name} gets the larger league-scoring lift (${signedWhole(player.scoringAdjustment)} vs ${signedWhole(alternative.scoringAdjustment)})`;

    if (skill && receptions >= 0.95) return `full-PPR scoring matters here: ${lead}`;
    if (skill && receptions >= 0.45) return `half-PPR scoring matters here: ${lead}`;
    if (qb && superflex) return `this is a superflex league, and ${lead}`;
    if (qb && passTd >= 5.5) return `${Math.round(passTd)}-point passing TDs matter here: ${lead}`;
    if (te && tePremium > 0) return `the TE reception premium matters here: ${lead}`;
    return null;
  }

  function urgencyLine(player, index) {
    const pos = String(player?.pos || '').toUpperCase();
    if (player?.mustFillNow) return `FILL NOW · Required ${pos} starter`;

    const survival = pct(player?.survivalProbability);
    const next = numeric(player?.nextPickOverall);
    if (survival != null && next != null) {
      if (index === 0 && survival <= 35) return `TAKE NOW · Only ${survival}% chance available at #${Math.round(next)}`;
      if (index === 0) return `BEST PICK · ${survival}% chance available at #${Math.round(next)}`;
      if (survival <= 20) return `HIGH URGENCY · Only ${survival}% chance available at #${Math.round(next)}`;
      if (survival <= 45) return `RISKY TO WAIT · ${survival}% chance available at #${Math.round(next)}`;
      return `LIKELY TO LAST · ${survival}% chance available at #${Math.round(next)}`;
    }

    return index === 0 ? 'BEST PICK NOW' : 'STRONG OPTION';
  }

  function absoluteWhy(player) {
    const reasons = [];
    const pos = String(player?.pos || 'this position').toUpperCase();
    const vor = numeric(player?.vor);
    const tierDrop = numeric(player?.tierDrop);
    const waitCost = numeric(player?.opportunityCost);
    const survival = pct(player?.survivalProbability);
    const next = numeric(player?.nextPickOverall);

    if (player?.mustFillNow) reasons.push(`your roster requires a ${pos} starter now`);
    if (vor != null) reasons.push(`VOR ${signedWhole(vor)} at ${pos}`);
    if (tierDrop != null && tierDrop >= 3) reasons.push(`a ${whole(tierDrop)}-point tier drop sits behind him`);
    if (survival != null && next != null && survival <= 45) reasons.push(`only a ${survival}% chance to reach pick #${Math.round(next)}`);
    if (waitCost != null && waitCost >= 3 && reasons.length < 3) reasons.push(`waiting costs about ${signedWhole(waitCost)} recommendation points`);

    return reasons.slice(0, 3).join('; ') || 'He has the highest current recommendation score among the available players.';
  }

  function comparativeWhy(player, alternative) {
    if (!alternative?.name) return `Why this player: ${absoluteWhy(player)}.`;

    const reasons = [];
    const pVor = numeric(player?.vor);
    const aVor = numeric(alternative?.vor);
    const pTier = numeric(player?.tierDrop);
    const aTier = numeric(alternative?.tierDrop);
    const pWait = numeric(player?.opportunityCost);
    const aWait = numeric(alternative?.opportunityCost);
    const pSurvival = pct(player?.survivalProbability);
    const aSurvival = pct(alternative?.survivalProbability);
    const pScore = numeric(player?.strategyScore, numeric(player?.score));
    const aScore = numeric(alternative?.strategyScore, numeric(alternative?.score));
    const next = numeric(player?.nextPickOverall, numeric(alternative?.nextPickOverall));

    const formatReason = scoringFormatEvidence(player, alternative);
    if (formatReason) reasons.push(formatReason);

    if (pVor != null && aVor != null && pVor - aVor >= 3) {
      reasons.push(`VOR ${signedWhole(pVor)} vs ${signedWhole(aVor)} for ${alternative.name}`);
    }

    if (pTier != null && aTier != null && pTier - aTier >= 2) {
      reasons.push(`passing on ${player.name} exposes a bigger tier drop (${whole(pTier)} vs ${whole(aTier)})`);
    }

    if (pSurvival != null && aSurvival != null && aSurvival - pSurvival >= 8) {
      const pickText = next != null ? ` at #${Math.round(next)}` : '';
      reasons.push(`${player.name} has only a ${pSurvival}% chance back${pickText}, while ${alternative.name} is ${aSurvival}%`);
    }

    if (pWait != null && aWait != null && pWait - aWait >= 3 && reasons.length < 3) {
      reasons.push(`wait cost ${signedWhole(pWait)} vs ${signedWhole(aWait)}`);
    }

    if (!reasons.length && pScore != null && aScore != null) {
      reasons.push(`the league-adjusted recommendation score is ${pScore.toFixed(1)} vs ${aScore.toFixed(1)}`);
      if (pVor != null && aVor != null) reasons.push(`VOR ${signedWhole(pVor)} vs ${signedWhole(aVor)}`);
      if (pSurvival != null && aSurvival != null) reasons.push(`chance back is ${pSurvival}% vs ${aSurvival}%`);
    }

    return `Why ${player.name} over ${alternative.name}: ${reasons.slice(0, 3).join('; ')}.`;
  }

  function playerPhoto(name) {
    if (typeof global.photoUrl === 'function') return global.photoUrl(name) || '';
    if (typeof global.photo === 'function') return global.photo(name) || '';
    return '';
  }

  function renderCard(player, index, allPlayers) {
    const photo = playerPhoto(player?.name);
    const classes = ['pick'];
    if (index === 0) classes.push('best');
    if (index >= 3) classes.push('secondary-pick');

    const adp = numeric(player?.adp);
    const meta = `${escapeHtml(player?.pos || '—')} · ${escapeHtml(player?.team || 'FA')}${adp != null && adp > 0 ? ` · ADP ${adp.toFixed(1)}` : ''}`;
    const metrics = `VOR ${signedWhole(player?.vor)} · Tier drop ${whole(player?.tierDrop)} · Wait cost ${signedWhole(player?.opportunityCost)}`;
    const urgency = urgencyLine(player, index);
    const alternative = Array.isArray(allPlayers) ? allPlayers[index + 1] : null;
    const why = comparativeWhy(player, alternative);

    return `<article class="${classes.join(' ')}"><span class="rank">${index + 1}</span>${photo ? `<img class="photo" src="${escapeHtml(photo)}" alt="${escapeHtml(player?.name || '')}" onerror="this.style.display='none'">` : ''}<div class="copy"><h2>${escapeHtml(player?.name || 'Unknown player')}</h2><p class="player-meta">${meta}</p><p class="draft-urgency">${escapeHtml(urgency)}</p><p class="draft-metrics">${escapeHtml(metrics)}</p><p class="draft-why">${escapeHtml(why)}</p></div>${index === 0 ? '<span class="badge">BEST PICK</span>' : ''}</article>`;
  }

  function injectStyles() {
    if (document.getElementById('recommendation-card-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'recommendation-card-ui-styles';
    style.textContent = `
      .draft-urgency{margin:6px 0 0!important;color:#166534!important;font-size:10.5px!important;font-weight:900!important;line-height:1.25!important;letter-spacing:.15px!important}
      .draft-metrics{margin:4px 0 0!important;color:#475569!important;font-size:10.5px!important;font-weight:800!important;line-height:1.3!important}
      .draft-why{margin:5px 0 0!important;color:#475569!important;font-size:10.5px!important;font-weight:650!important;line-height:1.35!important}
      @media(max-width:540px){.draft-urgency,.draft-metrics,.draft-why{font-size:10px!important}.draft-why{line-height:1.3!important}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (typeof global.card !== 'function') return false;
    injectStyles();
    global.card = renderCard;
    global.WhoToDraftNextCardUi = { renderCard, urgencyLine, comparativeWhy };
    return true;
  }

  if (!install()) {
    setTimeout(install, 0);
    document.addEventListener('DOMContentLoaded', install, { once: true });
  }
})(window);
