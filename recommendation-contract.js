(function installRecommendationContract(global) {
  'use strict';

  const num = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function rosterCounts(state) {
    const counts = {};
    const slot = num(state?.slot, null);
    (state?.picks || []).forEach((pick) => {
      if (slot != null && num(pick?.draft_slot, null) !== slot) return;
      const pos = String(pick?.metadata?.position || pick?.position || pick?.pos || '').toUpperCase();
      if (pos) counts[pos] = (counts[pos] || 0) + 1;
    });
    return counts;
  }

  function normalize(player, state, engine, platform = 'sleeper') {
    const baseScore = num(player?.baseScore, num(player?.score, 0));
    const totalScore = num(player?.strategyScore, num(player?.score, baseScore));
    const vor = num(player?.vor, num(player?.valueAboveReplacement, num(player?.valueOverReplacement, 0)));
    const tierDrop = num(player?.tierDrop, 0);
    const waitCost = num(player?.opportunityCost, 0);
    const vorAdjustment = clamp((vor || 0) * 0.22, -6, 16);
    const tierAdjustment = clamp((tierDrop || 0) * 0.45, 0, 8);
    const scoringSettings = { ...(state?.league?.scoring_settings || {}) };
    const rosterPositions = Array.isArray(state?.league?.roster_positions) ? [...state.league.roster_positions] : [];
    let profile = null;
    try { profile = typeof engine?.rosterProfile === 'function' ? engine.rosterProfile() : null; } catch { profile = null; }

    return {
      schemaVersion: 1,
      platform,
      player: {
        id: player?.playerId || player?.player_id || null,
        name: player?.name || null,
        position: player?.pos || player?.position || null,
        team: player?.team || null,
        adp: num(player?.adp, null),
        consensusRank: num(player?.consensusRank, null),
      },
      league: {
        id: state?.league?.league_id || state?.league?.leagueId || null,
        scoringInputs: scoringSettings,
        rosterPositions,
        teamCount: num(state?.league?.total_rosters, num(state?.league?.teamCount, null)),
        draftSlot: num(state?.slot, null),
      },
      recommendation: {
        totalScore,
        components: {
          leagueAdjustedBaseScore: baseScore,
          scoringAdjustment: num(player?.scoringAdjustment, 0),
          rosterAdjustment: num(player?.rosterAdjustment, 0),
          vorAdjustment,
          tierAdjustment,
          waitOpportunityCost: waitCost,
          completionPriority: num(player?.completionPriority, 1),
        },
        vor,
        tierDrop,
        nextPick: {
          overall: num(player?.nextPickOverall, null),
          survivalProbability: num(player?.survivalProbability, null),
        },
        waitOpportunityCost: waitCost,
        rosterContext: {
          profile,
          draftedCounts: rosterCounts(state),
          mustFillNow: Boolean(player?.mustFillNow),
          specialtyHold: Boolean(player?.specialtyHold),
        },
        explanation: String(player?.decisionNote || 'Best current roster-adjusted value'),
      },
    };
  }

  function attach(rows, state, engine, platform) {
    return (rows || []).map((player) => ({
      ...player,
      recommendation: normalize(player, state, engine, platform),
    }));
  }

  function wrapEngine(engine, platform) {
    if (!engine || typeof engine.recommendations !== 'function' || engine.__normalizedRecommendationWrapped) return;
    const original = engine.recommendations.bind(engine);
    const wrapped = function normalizedRecommendations(...args) {
      const rows = original(...args);
      const state = args[0]?.league ? args[0] : engine.state || global.state || null;
      return attach(rows, state, engine, platform);
    };
    engine.recommendations = wrapped;
    if (typeof global.recommendations === 'function') global.recommendations = wrapped;
    engine.__normalizedRecommendationWrapped = true;
  }

  global.WhoToDraftNextRecommendationContract = { normalize, attach, wrapEngine };
  wrapEngine(global.SleeperDraftEngine, 'sleeper');
  wrapEngine(global.PrivateSleeperDraftEngine, 'sleeper');
})(window);
