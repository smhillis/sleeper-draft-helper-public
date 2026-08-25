(function installSleeperDraftStrategy(global) {
  const engine = global.SleeperDraftEngine;
  if (!engine || typeof engine.recommendations !== 'function') return;

  const baseRecommendations = engine.recommendations;
  const baseCard = typeof global.card === 'function' ? global.card : null;
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function normalizePos(pos) {
    const value = String(pos || '').toUpperCase().replace(/[^A-Z/]/g, '');
    if (['DST', 'D/ST', 'DEF'].includes(value)) return 'DEF';
    if (['DE', 'DT', 'DL'].includes(value)) return 'DL';
    if (['CB', 'S', 'DB'].includes(value)) return 'DB';
    return value;
  }

  function nextUserPicks(state) {
    const teamCount = Math.max(2, num(state?.league?.total_rosters, 12));
    const slot = num(state?.slot, 0);
    const completed = Array.isArray(state?.picks) ? state.picks.length : 0;
    const out = [];
    if (!slot) return { teamCount, slot: null, upcoming: completed + 1, following: null, picksBetween: null };
    for (let round = 1; round <= 40; round += 1) {
      const overall = round % 2 === 1
        ? (round - 1) * teamCount + slot
        : round * teamCount - slot + 1;
      if (overall > completed) out.push(overall);
      if (out.length === 2) break;
    }
    return {
      teamCount,
      slot,
      upcoming: out[0] || completed + 1,
      following: out[1] || null,
      picksBetween: out[1] ? out[1] - out[0] - 1 : null,
    };
  }

  function marketPick(player) {
    for (const candidate of [player?.adp, player?.averageDraftPosition, player?.consensusRank]) {
      const value = Number(candidate);
      if (Number.isFinite(value) && value > 0) return value;
    }
    return null;
  }

  function marketSpread(player, market) {
    const explicit = [player?.adpStdDev, player?.adpSD, player?.adpDeviation]
      .map(Number)
      .find((value) => Number.isFinite(value) && value > 0);
    return explicit || clamp(4.5 + market * 0.055, 5, 14);
  }

  function survivalAtPick(pick, market, spread) {
    if (!Number.isFinite(pick) || !Number.isFinite(market) || !Number.isFinite(spread)) return null;
    const exponent = clamp((pick - market) / Math.max(1, spread), -30, 30);
    return 1 / (1 + Math.exp(exponent));
  }

  function survivalProbabilityAtNextTurn(player, state) {
    const context = nextUserPicks(state);
    const market = marketPick(player);
    if (!market || !context.following || context.following <= context.upcoming) return null;
    const spread = marketSpread(player, market);
    const availableNow = survivalAtPick(context.upcoming - 0.5, market, spread);
    const availableLater = survivalAtPick(context.following - 0.5, market, spread);
    if (availableNow == null || availableLater == null) return null;
    return clamp(availableLater / Math.max(0.02, availableNow), 0, 1);
  }

  function demandPerTeam(profile, pos) {
    const flex = num(profile?.FLEX, 0);
    const sf = num(profile?.SUPER_FLEX, 0);
    const idpFlex = num(profile?.IDP_FLEX, 0);
    const demand = {
      QB: num(profile?.QB, 0) + sf * 0.85,
      RB: num(profile?.RB, 0) + flex * 0.40 + sf * 0.04,
      WR: num(profile?.WR, 0) + flex * 0.45 + sf * 0.06,
      TE: num(profile?.TE, 0) + flex * 0.15 + sf * 0.05,
      K: num(profile?.K, 0),
      DEF: num(profile?.DEF, 0),
      DL: num(profile?.DL, 0) + idpFlex / 3,
      LB: num(profile?.LB, 0) + idpFlex / 3,
      DB: num(profile?.DB, 0) + idpFlex / 3,
    };
    return Math.max(0, num(demand[pos], 0));
  }

  function draftedByPosition(state) {
    const counts = {};
    (state?.picks || []).forEach((pick) => {
      const pos = normalizePos(pick?.metadata?.position || pick?.position || pick?.pos);
      if (pos) counts[pos] = (counts[pos] || 0) + 1;
    });
    return counts;
  }

  function replacementMetrics(baseRows, state) {
    const context = nextUserPicks(state);
    const profile = engine.rosterProfile();
    const drafted = draftedByPosition(state);
    const groups = {};

    (baseRows || []).forEach((row) => {
      const pos = normalizePos(row?.pos);
      if (!pos) return;
      (groups[pos] ||= []).push(row);
    });
    Object.values(groups).forEach((rows) => rows.sort((a, b) => num(b.score) - num(a.score)));

    const metrics = new Map();
    Object.entries(groups).forEach(([pos, rows]) => {
      const totalDemand = Math.max(1, Math.round(context.teamCount * demandPerTeam(profile, pos)));
      const remainingDemand = Math.max(1, totalDemand - num(drafted[pos], 0));
      const replacementIndex = Math.min(rows.length - 1, Math.max(0, remainingDemand - 1));
      const replacementScore = num(rows[replacementIndex]?.score, num(rows[rows.length - 1]?.score, 0));
      rows.forEach((row, index) => {
        const next = rows[index + 1];
        const tierDrop = next ? Math.max(0, num(row.score) - num(next.score)) : Math.max(0, num(row.score) - replacementScore);
        metrics.set(row.name, {
          replacementScore,
          replacementIndex: replacementIndex + 1,
          valueAboveReplacement: num(row.score) - replacementScore,
          tierDrop,
        });
      });
    });
    return metrics;
  }

  function decisionNote({ survivalProbability, valueAboveReplacement, tierDrop, following }) {
    const vor = num(valueAboveReplacement, 0);
    const gap = num(tierDrop, 0);
    if (survivalProbability != null && following) {
      const pct = Math.round(survivalProbability * 100);
      if (pct <= 20) return `${pct}% chance to make it back`;
      if (pct <= 45) return `Risky to wait · ${pct}% chance back`;
      if (gap >= 7) return `Tier drop behind him · ${pct}% chance back`;
      if (vor >= 12) return `Strong VOR · ${pct}% chance back`;
      return `${pct}% chance to make it back`;
    }
    if (gap >= 7) return 'Meaningful tier drop behind him';
    if (vor >= 12) return 'Strong value above replacement';
    return 'Best current roster-adjusted value';
  }

  function applyDraftStrategy(baseRows, state) {
    const replacement = replacementMetrics(baseRows, state);
    const context = nextUserPicks(state);
    return (baseRows || []).map((row) => {
      const metric = replacement.get(row.name) || { valueAboveReplacement: 0, tierDrop: 0, replacementScore: num(row.score), replacementIndex: 1 };
      const survivalProbability = survivalProbabilityAtNextTurn(row, state);
      const risk = survivalProbability == null ? 0 : 1 - survivalProbability;
      const vorAdjustment = clamp(metric.valueAboveReplacement * 0.22, -6, 16);
      const tierAdjustment = clamp(metric.tierDrop * 0.45, 0, 8);
      const opportunityCost = risk * clamp(5 + Math.max(0, metric.valueAboveReplacement) * 0.18 + metric.tierDrop * 0.60, 0, 18);
      const strategyScore = num(row.score) + vorAdjustment + tierAdjustment + opportunityCost;
      return {
        ...row,
        baseScore: num(row.score),
        score: strategyScore,
        strategyScore,
        valueAboveReplacement: metric.valueAboveReplacement,
        vor: metric.valueAboveReplacement,
        replacementScore: metric.replacementScore,
        replacementIndex: metric.replacementIndex,
        tierDrop: metric.tierDrop,
        survivalProbability,
        opportunityCost,
        nextPickOverall: context.following,
        decisionNote: decisionNote({
          survivalProbability,
          valueAboveReplacement: metric.valueAboveReplacement,
          tierDrop: metric.tierDrop,
          following: context.following,
        }),
      };
    }).sort((a, b) => num(b.score) - num(a.score));
  }

  function strategicRecommendations() {
    return applyDraftStrategy(baseRecommendations(), engine.state);
  }

  function strategicCard(player, index) {
    if (!baseCard) return '';
    const html = baseCard(player, index);
    if (!player?.decisionNote) return html;
    const vor = Number(player.vor);
    const note = `${player.decisionNote}${Number.isFinite(vor) ? ` · VOR ${vor >= 0 ? '+' : ''}${vor.toFixed(0)}` : ''}`;
    return html.replace('</div>', `<p style="margin-top:3px;font-size:11px;font-weight:800;color:#475569">${note}</p></div>`);
  }

  global.recommendations = strategicRecommendations;
  if (baseCard) global.card = strategicCard;
  engine.baseRecommendations = baseRecommendations;
  engine.recommendations = strategicRecommendations;
  engine.applyDraftStrategy = applyDraftStrategy;
  engine.nextTurnContext = nextUserPicks;
  engine.survivalProbabilityAtNextTurn = (player) => survivalProbabilityAtNextTurn(player, engine.state);

  global.SleeperDraftStrategy = {
    applyDraftStrategy,
    nextTurnContext: nextUserPicks,
    survivalProbabilityAtNextTurn,
  };
})(window);
