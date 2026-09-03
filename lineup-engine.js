(function (root, factory) {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.setAttribute('data-lineup-mobile-type', 'true');
    style.textContent = `
      .lineup-context{display:none;margin-top:14px;border:1px solid #dbe4ee;background:#fff;border-radius:12px;padding:10px 12px;box-shadow:0 4px 14px rgba(15,23,42,.05)}
      .lineup-context.visible{display:block}
      .context-main{display:flex;align-items:center;justify-content:space-between;gap:10px}
      .context-title{min-width:0;font-size:18px;line-height:1.25;color:#111827;font-weight:900;overflow-wrap:anywhere}
      .context-user{color:#64748b;font-weight:700}
      .context-league-short{display:none}
      .context-change{flex:0 0 auto;color:#166534;font-size:14px;font-weight:900;text-decoration:none;padding:6px 0}
      .context-meta{display:flex;align-items:center;gap:5px;margin-top:5px;color:#475569;font-size:14px;line-height:1.35;font-weight:800;white-space:normal}
      .context-risk{color:#b45309;font-weight:900;text-decoration:underline;text-underline-offset:2px}
      .context-risk.no-risk{color:#475569;text-decoration:none;pointer-events:none}
      .context-how{position:relative;margin-left:auto;flex:0 0 auto}
      .context-how summary{list-style:none;cursor:pointer;width:30px;height:30px;border-radius:999px;border:1px solid #cbd5e1;background:#f8fafc;color:#475569;display:inline-flex;align-items:center;justify-content:center;font-size:17px;font-weight:900}
      .context-how summary::-webkit-details-marker{display:none}
      .context-info{position:absolute;right:0;top:36px;width:min(330px,calc(100vw - 32px));z-index:50;border:1px solid #dbe4ee;border-radius:12px;background:#fff;padding:13px 14px;box-shadow:0 12px 30px rgba(15,23,42,.16)}
      .context-info p{margin:0;color:#475569;font-size:14px;line-height:1.5}
      .context-info .context-updated{margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;color:#64748b;font-size:13px}
      .risk-player{border-left:4px solid #f59e0b!important;scroll-margin-top:72px}
      .risk-player .status{background:#fef3c7!important;color:#92400e!important}
      @media (max-width: 650px) {
        body { font-size: 18px !important; }
        .top { padding: 11px 14px !important; gap: 8px !important; }
        .top h1 { font-size: 21px !important; line-height: 1.15 !important; }
        .top p { font-size: 13px !important; line-height: 1.3 !important; margin-top: 3px !important; }
        .nav { gap: 6px !important; }
        .nav a { min-height: 42px !important; font-size: 15px !important; padding: 7px 6px !important; }
        body.lineup-built .top p{display:none!important}
        body.lineup-built .top{padding-top:9px!important;padding-bottom:9px!important}
        .shell { padding: 18px 14px 48px !important; }
        .eyebrow { font-size: 14px !important; line-height: 1.3 !important; }
        .hero h2 { font-size: 30px !important; line-height: 1.13 !important; margin: 8px 0 12px !important; }
        .hero p { font-size: 18px !important; line-height: 1.5 !important; }
        .notice { font-size: 16px !important; line-height: 1.5 !important; padding: 15px !important; margin-top: 16px !important; }
        .panel { padding: 16px !important; margin-top: 18px !important; }
        .field label { font-size: 16px !important; margin-bottom: 8px !important; }
        .field input, .field select { min-height: 52px !important; font-size: 18px !important; padding: 12px 13px !important; }
        button { min-height: 50px !important; font-size: 17px !important; padding: 11px 14px !important; }
        .error { font-size: 16px !important; line-height: 1.5 !important; padding: 13px !important; }
        .summary { gap: 8px !important; margin-top: 18px !important; }
        .stat { padding: 12px !important; }
        .stat span { font-size: 13px !important; line-height: 1.25 !important; }
        .stat strong { font-size: 21px !important; margin-top: 4px !important; }
        .section { margin-top: 24px !important; }
        .section-head { gap: 4px !important; margin-bottom: 12px !important; }
        .section h3 { font-size: 27px !important; line-height: 1.15 !important; }
        .section-head span { font-size: 15px !important; line-height: 1.4 !important; }
        body.lineup-built #output>.section:first-of-type .section-head span{display:none!important}
        .lineup { gap: 10px !important; }
        .slot-card {
          display:grid !important;
          grid-template-columns:52px minmax(0,1fr) auto !important;
          grid-template-rows:auto auto !important;
          align-items:start !important;
          column-gap:12px !important;
          row-gap:5px !important;
          padding:14px 14px !important;
          min-height:110px !important;
        }
        .slot-card:not(.suggested-start){max-height:130px}
        .slot-label { grid-column:1;grid-row:1 / span 2;width:auto !important;flex:none !important;font-size:17px !important;line-height:1.3 !important;padding-top:3px !important; }
        .player-copy { grid-column:2;grid-row:1 / span 2;min-width:0 !important; }
        .player-copy strong { font-size:21px !important; line-height:1.2 !important; white-space:normal !important; overflow:visible !important; text-overflow:clip !important; }
        .player-copy>span:not(.change-flag){font-size:16px !important;line-height:1.4 !important;margin-top:5px !important}
        .status { grid-column:3 !important;grid-row:1 !important;justify-self:end !important;margin:0 !important;font-size:13px !important;line-height:1.2 !important;padding:6px 8px !important; }
        .slot-card.suggested-start{min-height:0!important;padding:16px 14px 15px!important;grid-template-columns:52px minmax(0,1fr) auto!important}
        .suggested-start .change-flag{display:inline-flex!important;margin:0 8px 5px 0!important;font-size:14px!important;padding:6px 9px!important;vertical-align:middle}
        .suggested-start .player-copy>strong{display:inline!important;font-size:22px!important;vertical-align:middle}
        .suggested-start .player-copy>span:not(.change-flag){display:block!important;margin-top:8px!important;font-size:16px!important}
        .inline-change{font-size:18px!important;line-height:1.4!important;font-weight:900!important;margin-top:8px!important}
        .why{margin-top:9px!important;padding-top:8px!important}
        .why summary{font-size:17px!important;min-height:42px!important}
        .why p{font-size:17px!important;line-height:1.55!important}
        .why-meta span{font-size:15px!important}
        .bench { gap: 9px !important; }
        .bench-card { padding: 14px !important; }
        .bench-card strong { font-size: 20px !important; line-height: 1.3 !important; }
        .bench-card span { font-size: 16px !important; line-height: 1.45 !important; margin-top: 4px !important; }
        .hold { font-size: 17px !important; line-height: 1.5 !important; padding: 15px !important; }
        .fine { font-size: 14px !important; line-height: 1.5 !important; margin-top: 20px !important; }
        .lineup-context{position:sticky;top:0;z-index:30;margin:0 -1px 8px;padding:9px 11px;border-radius:0 0 11px 11px;box-shadow:0 6px 15px rgba(15,23,42,.08)}
        .context-title{font-size:17px}
        .context-change{font-size:14px;padding:4px 0}
        .context-meta{font-size:14px;margin-top:4px;gap:4px}
        .context-how summary{width:28px;height:28px;font-size:16px}
        .lineup-context.scrolled{display:flex!important;align-items:center;gap:0;padding:7px 11px;border-radius:0;min-height:42px}
        .lineup-context.scrolled .context-main{display:block;min-width:0;flex:0 1 auto}
        .lineup-context.scrolled .context-title{font-size:15px;white-space:nowrap}
        .lineup-context.scrolled .context-league-full{display:none}
        .lineup-context.scrolled .context-league-short{display:inline}
        .lineup-context.scrolled .context-user,.lineup-context.scrolled .context-change,.lineup-context.scrolled .context-starters,.lineup-context.scrolled .context-how{display:none!important}
        .lineup-context.scrolled .context-meta{margin:0 0 0 4px;font-size:13px;white-space:nowrap;flex:0 0 auto}
        .lineup-context.scrolled .context-meta::before{content:'·';margin-right:3px;color:#94a3b8}
        body.lineup-built .shell{padding-top:0!important}
        body.lineup-built #output>.section:first-of-type{margin-top:16px!important}
      }
      @media (max-width:390px) {
        .top h1{font-size:20px!important}
        .nav a{font-size:14px!important;min-height:40px!important}
        .slot-card{grid-template-columns:46px minmax(0,1fr) auto!important;padding:13px 12px!important}
        .slot-label{font-size:16px!important}
        .player-copy strong{font-size:20px!important}
        .player-copy>span:not(.change-flag){font-size:15px!important}
        .status{font-size:12px!important;padding:5px 7px!important}
        .lineup-context.scrolled .context-title{font-size:14px}
        .lineup-context.scrolled .context-meta{font-size:12px}
      }
    `;
    document.head.appendChild(style);

    const installCompactContext = () => {
      const shell = document.querySelector('.shell');
      const hero = document.querySelector('.hero');
      const panel = document.querySelector('.panel');
      const output = document.getElementById('output');
      const username = document.getElementById('username');
      const league = document.getElementById('league');
      if (!shell || !hero || !panel || !output || !username || !league || document.querySelector('.lineup-context')) return;

      const context = document.createElement('section');
      context.className = 'lineup-context';
      context.innerHTML = '<div class="context-main"><div class="context-title"><span class="context-league-full">League</span><span class="context-league-short">League</span><span class="context-user"></span></div><a class="context-change" href="#">Change</a></div><div class="context-meta"><span class="context-changes"></span><span>·</span><a class="context-risk no-risk" href="#"></a><span>·</span><span class="context-starters"></span><details class="context-how"><summary aria-label="How recommendations work" title="How recommendations work">ⓘ</summary><div class="context-info"><p>The assistant builds the best legal lineup from your live roster using the maintained Who To Draft Next research and current injury availability. Weekly opponent, weather and game-specific projection adjustments are still being added, so season-long research rank is not presented as a fake weekly point projection.</p><p class="context-updated"></p></div></details></div>';
      panel.insertAdjacentElement('afterend', context);

      const shortLeagueName = (value) => {
        const cleaned = String(value || 'League').replace(/\s+Football\b/i, '').trim();
        return cleaned.length > 20 ? cleaned.slice(0, 20).trim() : cleaned;
      };

      const enhanceCards = () => {
        const cards = [...output.querySelectorAll('.slot-card')];
        const riskCards = [];
        cards.forEach((card) => {
          const copy = card.querySelector('.player-copy');
          const name = copy?.querySelector('strong')?.textContent?.trim() || '';
          const meta = copy ? [...copy.children].find((el) => el.tagName === 'SPAN' && !el.classList.contains('change-flag')) : null;
          if (meta) {
            const parts = meta.textContent.split(' · ').map((part) => part.trim()).filter(Boolean);
            const pos = parts[0] || '';
            const team = parts[1] || '';
            const rankPart = (parts.find((part) => /research rank|unranked/i.test(part)) || '').replace(/research rank/i, 'Rank');
            meta.textContent = card.classList.contains('suggested-start') ? [pos, team, rankPart].filter(Boolean).join(' · ') : [team, rankPart].filter(Boolean).join(' · ');
          }
          if (card.classList.contains('suggested-start')) {
            const changeText = card.querySelector('.inline-change');
            if (changeText) {
              const match = changeText.textContent.trim().match(/^Start over (.+) in (.+)\.$/i);
              if (match) changeText.textContent = `Sit ${match[1]} · ${match[2]}`;
            }
          }
          const status = card.querySelector('.status');
          const statusText = status?.textContent?.trim().toUpperCase() || '';
          if (['QUESTIONABLE','Q','GTD','DTD','DOUBTFUL','D'].includes(statusText)) {
            card.classList.add('risk-player');
            card.id = `risk-player-${riskCards.length + 1}`;
            card.dataset.playerName = name;
            riskCards.push(card);
          }
        });
        return riskCards;
      };

      const collapse = () => {
        const summary = output.querySelector('.summary');
        if (!summary) return;
        const stats = {};
        summary.querySelectorAll('.stat').forEach((card) => {
          const label = card.querySelector('span')?.textContent?.trim();
          const value = card.querySelector('strong')?.textContent?.trim();
          if (label) stats[label] = value;
        });
        const riskCards = enhanceCards();
        const selectedLeague = league.selectedOptions?.[0]?.textContent?.trim() || stats.LEAGUE || 'Sleeper league';
        context.querySelector('.context-league-full').textContent = selectedLeague;
        context.querySelector('.context-league-short').textContent = shortLeagueName(selectedLeague);
        context.querySelector('.context-user').textContent = username.value.trim() ? ` · ${username.value.trim()}` : '';
        const changes = stats.CHANGES || '0';
        const starters = stats.STARTERS || '';
        context.querySelector('.context-changes').textContent = `${changes} change${changes === '1' ? '' : 's'}`;
        const riskLink = context.querySelector('.context-risk');
        const risks = String(riskCards.length || Number(stats['RISK FLAGS'] || 0));
        riskLink.textContent = `${risks} risk${risks === '1' ? '' : 's'}`;
        if (riskCards.length) {
          riskLink.classList.remove('no-risk');
          riskLink.href = `#${riskCards[0].id}`;
        } else {
          riskLink.classList.add('no-risk');
          riskLink.href = '#';
        }
        context.querySelector('.context-starters').textContent = starters ? `${starters} starters` : '';
        const researchNote = output.querySelector('.section .section-head span')?.textContent?.trim() || '';
        context.querySelector('.context-updated').textContent = researchNote || 'Research uses the latest maintained Who To Draft Next data.';
        hero.style.display = 'none';
        panel.style.display = 'none';
        summary.style.display = 'none';
        context.classList.add('visible');
        document.body.classList.add('lineup-built');
      };

      context.querySelector('.context-change').addEventListener('click', (event) => {
        event.preventDefault();
        context.classList.remove('visible','scrolled');
        panel.style.display = '';
        hero.style.display = 'none';
        document.body.classList.remove('lineup-built');
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      context.querySelector('.context-risk').addEventListener('click', (event) => {
        const targetId = event.currentTarget.getAttribute('href')?.replace('#','');
        if (!targetId) return;
        const target = document.getElementById(targetId);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });

      const syncStickyState = () => {
        if (!context.classList.contains('visible')) return;
        context.classList.toggle('scrolled', window.scrollY > 230);
      };
      window.addEventListener('scroll', syncStickyState, { passive: true });

      const observer = new MutationObserver(() => {
        collapse();
        syncStickyState();
      });
      observer.observe(output, { childList: true, subtree: true });
      collapse();
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installCompactContext);
    else installCompactContext();
  }

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PublicLineupEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const STARTABLE = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF']);
  const EXCLUDED = new Set(['BN', 'BENCH', 'IR', 'IR+', 'RESERVE', 'TAXI', 'NA']);

  function normalizedPos(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (raw === 'DST' || raw === 'D/ST') return 'DEF';
    return raw;
  }

  function slotEligiblePositions(value) {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw || EXCLUDED.has(raw)) return [];
    const pos = normalizedPos(raw);
    if (STARTABLE.has(pos)) return [pos];
    if (raw === 'SUPER_FLEX' || raw === 'SUPERFLEX' || (/Q/.test(raw) && /R|W|T/.test(raw))) {
      return ['QB', 'RB', 'WR', 'TE'];
    }
    if (raw === 'FLEX' || (!/Q/.test(raw) && /R|W|T/.test(raw) && raw.length > 2)) {
      return ['RB', 'WR', 'TE'];
    }
    return [];
  }

  function friendlySlot(value) {
    const raw = String(value || '').trim().toUpperCase();
    const eligible = slotEligiblePositions(raw);
    if (eligible.length === 4) return 'SUPER FLEX';
    if (eligible.length === 3) return 'FLEX';
    return normalizedPos(raw) || raw;
  }

  function expandSlots(rosterPositions) {
    const slots = [];
    for (const item of rosterPositions || []) {
      if (typeof item === 'string') {
        const eligible = slotEligiblePositions(item);
        if (eligible.length) slots.push({ raw: item, label: friendlySlot(item), eligible });
        continue;
      }
      const raw = item?.position || item?.slot || '';
      const count = Math.max(1, Number(item?.count || 1));
      const eligible = slotEligiblePositions(raw);
      if (!eligible.length) continue;
      for (let i = 0; i < count; i += 1) slots.push({ raw, label: friendlySlot(raw), eligible });
    }
    return slots.map((slot, index) => ({ ...slot, id: `${slot.raw || slot.label}-${index}` }));
  }

  function statusPenalty(player) {
    const status = String(player?.status || player?.injury_status || player?.injuryStatus || '').trim().toUpperCase();
    if (['IR', 'PUP', 'OUT', 'SUSP', 'SUSPENDED', 'NA'].includes(status)) return { penalty: -10000, label: status || 'OUT' };
    if (['DOUBTFUL', 'D'].includes(status)) return { penalty: -180, label: 'DOUBTFUL' };
    if (['QUESTIONABLE', 'Q', 'GTD', 'DTD'].includes(status)) return { penalty: -18, label: status };
    return { penalty: 0, label: status };
  }

  function scorePlayer(player, ranked, research, alert) {
    const rank = Number(research?.consensusRank || ranked?.consensusRank || ranked?.rank || 999);
    const confidenceRaw = Number(research?.confidence ?? ranked?.confidence ?? 0.68);
    const confidence = Number.isFinite(confidenceRaw) ? Math.max(0.2, Math.min(1, confidenceRaw)) : 0.68;
    const base = rank < 999 ? Math.max(1, 360 - rank) : 20;
    const impact = String(alert?.impact || '').toLowerCase();
    const researchAdjustment = impact === 'up' ? 12 : impact === 'down' ? -24 : impact === 'mixed' ? -7 : 0;
    const status = statusPenalty(player);
    const score = base * (0.72 + confidence * 0.28) + researchAdjustment + status.penalty;
    return {
      score,
      rank,
      confidence,
      status: status.label,
      alert: alert || null,
      researchAdjustment,
    };
  }

  function eligible(player, slot) {
    return slot?.eligible?.includes(normalizedPos(player?.position));
  }

  function greedyOptimize(slots, players) {
    const used = new Set();
    const assignments = [];
    const ordered = slots.map((slot, originalIndex) => ({ slot, originalIndex }))
      .sort((a, b) => a.slot.eligible.length - b.slot.eligible.length);
    for (const item of ordered) {
      const best = players
        .map((player, index) => ({ player, index }))
        .filter(({ player, index }) => !used.has(index) && eligible(player, item.slot) && Number(player.score || -99999) > -5000)
        .sort((a, b) => Number(b.player.score || -99999) - Number(a.player.score || -99999))[0];
      if (best) used.add(best.index);
      assignments.push({ originalIndex: item.originalIndex, slot: item.slot, player: best?.player || null });
    }
    return assignments.sort((a, b) => a.originalIndex - b.originalIndex);
  }

  function optimizeLineup(slots, players) {
    const cleanPlayers = (players || []).filter((player) => player && player.id && player.position);
    if (!slots?.length) return [];
    if (cleanPlayers.length > 28) return greedyOptimize(slots, cleanPlayers);

    const ordered = slots.map((slot, originalIndex) => ({ slot, originalIndex }))
      .sort((a, b) => {
        const ac = cleanPlayers.filter((player) => eligible(player, a.slot)).length;
        const bc = cleanPlayers.filter((player) => eligible(player, b.slot)).length;
        return ac - bc || a.slot.eligible.length - b.slot.eligible.length;
      });
    const memo = new Map();

    function solve(index, usedMask) {
      if (index >= ordered.length) return { total: 0, picks: [] };
      const key = `${index}:${usedMask.toString()}`;
      if (memo.has(key)) return memo.get(key);
      const item = ordered[index];
      let best = null;

      for (let playerIndex = 0; playerIndex < cleanPlayers.length; playerIndex += 1) {
        const bit = 1n << BigInt(playerIndex);
        if ((usedMask & bit) !== 0n) continue;
        const player = cleanPlayers[playerIndex];
        if (!eligible(player, item.slot)) continue;
        const next = solve(index + 1, usedMask | bit);
        const total = Number(player.score || -99999) + next.total;
        if (!best || total > best.total) best = { total, picks: [{ item, playerIndex }, ...next.picks] };
      }

      const emptyNext = solve(index + 1, usedMask);
      const empty = { total: emptyNext.total - 5000, picks: [{ item, playerIndex: -1 }, ...emptyNext.picks] };
      if (!best || empty.total > best.total) best = empty;
      memo.set(key, best);
      return best;
    }

    const result = solve(0, 0n);
    return result.picks.map(({ item, playerIndex }) => ({
      originalIndex: item.originalIndex,
      slot: item.slot,
      player: playerIndex >= 0 ? cleanPlayers[playerIndex] : null,
    })).sort((a, b) => a.originalIndex - b.originalIndex);
  }

  function buildChanges(currentStarterIds, assignments, players) {
    const byId = new Map((players || []).map((player) => [String(player.id), player]));
    const current = new Set((currentStarterIds || []).map(String).filter((id) => byId.has(id)));
    const recommended = new Set((assignments || []).map((assignment) => assignment.player?.id).filter(Boolean).map(String));
    const starts = [...recommended].filter((id) => !current.has(id)).map((id) => byId.get(id)).sort((a, b) => b.score - a.score);
    const sits = [...current].filter((id) => !recommended.has(id)).map((id) => byId.get(id)).sort((a, b) => a.score - b.score);
    const usedSits = new Set();
    return starts.map((start) => {
      const assignment = assignments.find((item) => String(item.player?.id || '') === String(start.id));
      let sit = sits.find((candidate) => !usedSits.has(String(candidate.id)) && assignment?.slot?.eligible?.includes(normalizedPos(candidate.position)));
      if (!sit) sit = sits.find((candidate) => !usedSits.has(String(candidate.id))) || null;
      if (sit) usedSits.add(String(sit.id));
      return { start, sit, slot: assignment?.slot || null, edge: sit ? start.score - sit.score : null };
    });
  }

  return {
    normalizedPos,
    slotEligiblePositions,
    expandSlots,
    scorePlayer,
    optimizeLineup,
    buildChanges,
  };
});
