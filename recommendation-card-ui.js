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

  function urgencyLine(player, index) {
    const pos = String(player?.pos || '').toUpperCase();
    if (player?.mustFillNow) return `FILL NOW · Required ${pos} starter`;

    const survival = numeric(player?.survivalProbability);
    const next = numeric(player?.nextPickOverall);
    if (survival != null && next != null) {
      const pct = Math.max(0, Math.min(100, Math.round(survival * 100)));
      if (index === 0 && pct <= 35) return `TAKE NOW · Only ${pct}% chance available at #${Math.round(next)}`;
      if (index === 0) return `BEST PICK · ${pct}% chance available at #${Math.round(next)}`;
      if (pct <= 20) return `HIGH URGENCY · Only ${pct}% chance available at #${Math.round(next)}`;
      if (pct <= 45) return `RISKY TO WAIT · ${pct}% chance available at #${Math.round(next)}`;
      return `LIKELY TO LAST · ${pct}% chance available at #${Math.round(next)}`;
    }

    return index === 0 ? 'BEST PICK NOW' : 'STRONG OPTION';
  }

  function whyPlayer(player) {
    const reasons = [];
    const pos = String(player?.pos || 'this position').toUpperCase();
    const scoringAdjustment = numeric(player?.scoringAdjustment, 0);
    const vor = numeric(player?.vor);
    const tierDrop = numeric(player?.tierDrop);
    const waitCost = numeric(player?.opportunityCost);
    const survival = numeric(player?.survivalProbability);
    const next = numeric(player?.nextPickOverall);

    if (player?.mustFillNow) {
      reasons.push(`your remaining roster slots require a ${pos} starter now`);
    }
    if (scoringAdjustment >= 4) {
      reasons.push('your league scoring boosts his value');
    }
    if (vor != null && vor >= 12) {
      reasons.push(`his VOR is ${signedWhole(vor)} over the replacement-level ${pos} option`);
    } else if (vor != null && vor >= 4) {
      reasons.push(`he still holds a ${signedWhole(vor)} VOR edge at ${pos}`);
    }
    if (tierDrop != null && tierDrop >= 7) {
      reasons.push('there is a major tier drop behind him');
    } else if (tierDrop != null && tierDrop >= 3) {
      reasons.push(`the ${pos} tier drops behind him`);
    }
    if (survival != null && next != null) {
      const pct = Math.max(0, Math.min(100, Math.round(survival * 100)));
      if (pct <= 20) reasons.push(`he is very unlikely to still be there at #${Math.round(next)}`);
      else if (pct <= 45) reasons.push(`waiting carries real availability risk before #${Math.round(next)}`);
    }
    if (waitCost != null && waitCost >= 8 && reasons.length < 3) {
      reasons.push('the opportunity cost of waiting is high');
    }

    if (!reasons.length) {
      reasons.push('he has the best current combination of league scoring, roster fit, and remaining-player value');
    }

    const sentence = reasons.slice(0, 3).join('; ');
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
  }

  function playerPhoto(name) {
    if (typeof global.photoUrl === 'function') return global.photoUrl(name) || '';
    if (typeof global.photo === 'function') return global.photo(name) || '';
    return '';
  }

  function renderCard(player, index) {
    const photo = playerPhoto(player?.name);
    const classes = ['pick'];
    if (index === 0) classes.push('best');
    if (index >= 3) classes.push('secondary-pick');

    const adp = numeric(player?.adp);
    const meta = `${escapeHtml(player?.pos || '—')} · ${escapeHtml(player?.team || 'FA')}${adp != null && adp > 0 ? ` · ADP ${adp.toFixed(1)}` : ''}`;
    const metrics = `VOR ${signedWhole(player?.vor)} · Tier drop ${whole(player?.tierDrop)} · Wait cost ${signedWhole(player?.opportunityCost)}`;
    const urgency = urgencyLine(player, index);
    const why = whyPlayer(player);

    return `<article class="${classes.join(' ')}"><span class="rank">${index + 1}</span>${photo ? `<img class="photo" src="${escapeHtml(photo)}" alt="${escapeHtml(player?.name || '')}" onerror="this.style.display='none'">` : ''}<div class="copy"><h2>${escapeHtml(player?.name || 'Unknown player')}</h2><p class="player-meta">${meta}</p><p class="draft-urgency">${escapeHtml(urgency)}</p><p class="draft-metrics">${escapeHtml(metrics)}</p><p class="draft-why"><strong>Why this player:</strong> ${escapeHtml(why)}</p></div>${index === 0 ? '<span class="badge">BEST PICK</span>' : ''}</article>`;
  }

  function injectStyles() {
    if (document.getElementById('recommendation-card-ui-styles')) return;
    const style = document.createElement('style');
    style.id = 'recommendation-card-ui-styles';
    style.textContent = `
      .draft-urgency{margin:6px 0 0!important;color:#166534!important;font-size:10.5px!important;font-weight:900!important;line-height:1.25!important;letter-spacing:.15px!important}
      .draft-metrics{margin:4px 0 0!important;color:#475569!important;font-size:10.5px!important;font-weight:800!important;line-height:1.3!important}
      .draft-why{margin:5px 0 0!important;color:#64748b!important;font-size:10.5px!important;font-weight:600!important;line-height:1.35!important}
      .draft-why strong{color:#334155!important;font-weight:900!important}
      @media(max-width:540px){.draft-urgency,.draft-metrics,.draft-why{font-size:10px!important}.draft-why{line-height:1.3!important}}
    `;
    document.head.appendChild(style);
  }

  function install() {
    if (typeof global.card !== 'function') return false;
    injectStyles();
    global.card = renderCard;
    global.WhoToDraftNextCardUi = { renderCard, urgencyLine, whyPlayer };
    return true;
  }

  if (!install()) {
    setTimeout(install, 0);
    document.addEventListener('DOMContentLoaded', install, { once: true });
  }
})(window);
