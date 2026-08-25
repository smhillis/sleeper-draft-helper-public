(function installSleeperExhaustiveScoring(global) {
  'use strict';

  const n = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const normPos = (pos) => {
    const value = String(pos || '').toUpperCase().replace(/[^A-Z/]/g, '');
    if (['DST','D/ST','DEF'].includes(value)) return 'DEF';
    if (['DE','DT','DL'].includes(value)) return 'DL';
    if (['CB','S','SS','FS','DB'].includes(value)) return 'DB';
    if (['ILB','OLB'].includes(value)) return 'LB';
    return value;
  };

  const ALIASES = {
    int_ret_td:'pass_int_td', fum_rec_td:'fum_ret_td', dst_td:'def_td',
    pass_td_40p:'bonus_pass_td_40p', pass_td_50p:'bonus_pass_td_50p', pass_cmp_40p:'bonus_pass_cmp_40p',
    rush_td_40p:'bonus_rush_td_40p', rush_td_50p:'bonus_rush_td_50p', rush_40p:'bonus_rush_40p',
    rec_td_40p:'bonus_rec_td_40p', rec_td_50p:'bonus_rec_td_50p', rec_40p:'bonus_rec_40p',
    idp_pass_def:'idp_pd', idp_pass_defended:'idp_pd', idp_qb_hit:'idp_qbhit', idp_safe:'idp_safety',
    idp_fum_rec:'idp_fr', idp_fum_ret_yd:'idp_fr_yd',
  };

  const EXACT_KEYS = new Set([
    'pass_yd','pass_td','pass_int','pass_int_td','pass_2pt','pass_sack','pass_cmp','pass_att','pass_inc','pass_fd',
    'rush_yd','rush_td','rush_2pt','rush_fd','rush_att','bonus_rush_att',
    'rec','rec_yd','rec_td','rec_2pt','rec_fd','bonus_rec_te','bonus_rec_rb','bonus_rec_wr',
    'rec_0_4','rec_5_9','rec_10_19','rec_20_29','rec_30_39',
    'fum','fum_lost','fum_rec','fum_ret_td','st_td','ret_td','kr_td','pr_td','blk_kick','blk_kick_ret_td',
    'kr_yd','pr_yd','st_tkl_solo','st_tkl_ast','st_ff','st_fum_rec','blk_kick_ret_yd','fg_ret_yd','fum_ret_yd',
    'bonus_fd_qb','bonus_fd_rb','bonus_fd_wr','bonus_fd_te',
    'bonus_pass_yd_300','bonus_pass_yd_400','bonus_rush_yd_100','bonus_rush_yd_200','bonus_rec_yd_100','bonus_rec_yd_200',
    'bonus_rush_rec_yd_100','bonus_rush_rec_yd_200','bonus_pass_cmp_25','bonus_rush_att_20',
    'bonus_pass_td_40p','bonus_pass_td_50p','bonus_pass_cmp_40p','bonus_rush_td_40p','bonus_rush_td_50p','bonus_rec_td_40p','bonus_rec_td_50p','bonus_rec_40p','bonus_rush_40p',
    'bonus_def_fum_td_50p','bonus_def_int_td_50p','bonus_sack_2p','bonus_tkl_10p','idp_pass_def_3p',
    'idp_tkl','idp_tkl_solo','idp_tkl_ast','idp_tkl_loss','idp_sack','idp_sack_yd','idp_int','idp_int_ret_yd','idp_int_td',
    'idp_ff','idp_fr','idp_fr_yd','idp_fr_td','idp_def_td','idp_pd','idp_qbhit','idp_safety','idp_blk_kick',
    'fgm','fgm_0_19','fgm_20_29','fgm_30_39','fgm_0_39','fgm_40_49','fgm_50_59','fgm_50p','fgm_60p',
    'fgmiss','fgmiss_0_19','fgmiss_20_29','fgmiss_30_39','fgmiss_0_39','fgmiss_40_49','fgmiss_50_59','fgmiss_50p','fgmiss_60p',
    'xpm','xpmiss','fgm_yds','fgm_yds_over_30',
    'def_td','def_2pt','def_1pt_safe','def_int_td','def_fum_td','def_ff','def_3_and_out','def_4_and_stop','def_forced_punts','def_pass_def','def_st_tkl_solo','def_kr_yd','def_pr_yd',
    'sack','sack_half','sack_yd','int','int_ret_yd','safe','tkl','tkl_solo','tkl_ast','tkl_3','tkl_5','tkl_loss','qb_hit','fum_rec',
    'def_kr_yd_10','def_kr_yd_25','def_pr_yd_10','def_pr_yd_25','pts_allow','yds_allow',
  ]);

  const canonical = (raw) => ALIASES[String(raw || '').toLowerCase()] || String(raw || '').toLowerCase();
  const dynamicKnown = (key) => /^(pts_allow_|yds_allow_|fgm_\d|fgmiss_\d|rec_\d+_\d+|bonus_(pass|rush|rec|rush_rec)_yd_\d+)$/.test(key);
  const isKnown = (raw) => EXACT_KEYS.has(canonical(raw)) || dynamicKnown(canonical(raw));

  function logisticAbove(avg, threshold, spread) {
    return 1 / (1 + Math.exp(-1.7 * ((avg - threshold) / Math.max(1, spread))));
  }
  function aboveGames(total, threshold, spread) {
    return 17 * logisticAbove(n(total) / 17, threshold, spread);
  }
  function rangeGames(total, low, high, spread) {
    const avg = n(total) / 17;
    const lo = low <= 0 ? 1 : logisticAbove(avg, low, spread);
    const hi = high >= 99999 ? 0 : logisticAbove(avg, high, spread);
    return 17 * Math.max(0, lo - hi);
  }
  function parseRange(key, prefix) {
    if (!key.startsWith(prefix)) return null;
    const nums = key.slice(prefix.length).match(/\d+/g)?.map(Number) || [];
    if (!nums.length) return null;
    return { low: nums[0], high: /p$/.test(key) ? 99999 : (nums[1] ?? nums[0]) };
  }

  function firstDowns(p) {
    return {
      pass: n(p.passFd, n(p.passCmp) * .52),
      rush: n(p.rushFd, n(p.rushAtt) * .24 + n(p.rushTd) * .6),
      rec: n(p.recFd, n(p.rec) * .55),
    };
  }
  function receptionsByDistance(p, key) {
    const pos = normPos(p.pos);
    const profile = {
      RB:{rec_0_4:.38,rec_5_9:.28,rec_10_19:.22,rec_20_29:.07,rec_30_39:.03,bonus_rec_40p:.02},
      WR:{rec_0_4:.16,rec_5_9:.22,rec_10_19:.34,rec_20_29:.15,rec_30_39:.07,bonus_rec_40p:.06},
      TE:{rec_0_4:.25,rec_5_9:.27,rec_10_19:.31,rec_20_29:.10,rec_30_39:.04,bonus_rec_40p:.03},
    };
    return n(p.rec) * n(profile[pos]?.[key]);
  }
  function fgShares(key) {
    return ({fgm_0_19:.04,fgm_20_29:.13,fgm_30_39:.25,fgm_0_39:.42,fgm_40_49:.32,fgm_50_59:.21,fgm_50p:.26,fgm_60p:.05})[key];
  }
  function returnEstimate(p, type) {
    const pos = normPos(p.pos);
    if (type === 'krYds') return n(p.krYds, pos === 'DEF' ? n(p.defKrYds,760) : pos === 'DB' ? 180 : pos === 'RB' ? Math.max(40,n(p.rushYds)*.12) : pos === 'WR' ? Math.max(25,n(p.recYds)*.08) : 0);
    if (type === 'prYds') return n(p.prYds, pos === 'DEF' ? n(p.defPrYds,420) : pos === 'DB' ? 95 : pos === 'WR' ? Math.max(15,n(p.recYds)*.045) : pos === 'RB' ? 25 : 0);
    if (type === 'krTd') return n(p.krTd, returnEstimate(p,'krYds') / 1500);
    if (type === 'prTd') return n(p.prTd, returnEstimate(p,'prYds') / 950);
    return 0;
  }

  function value(p, rawKey) {
    const key = canonical(rawKey);
    const pos = normPos(p?.pos);
    const direct = {
      pass_att:'passAtt',pass_cmp:'passCmp',pass_yd:'passYds',pass_td:'passTd',pass_int:'passInt',rush_att:'rushAtt',rush_yd:'rushYds',rush_td:'rushTd',
      rec:'rec',rec_yd:'recYds',rec_td:'recTd',fum_lost:'fumLost',fgm:'fgm',xpm:'xpm',
      idp_tkl_solo:'solo',idp_tkl_ast:'ast',idp_tkl_loss:'tfl',idp_sack:'sacks',idp_int:'ints',idp_pd:'pd',idp_qbhit:'qbHit',idp_ff:'ff',idp_fr:'fr',idp_safety:'safeties',idp_blk_kick:'blocks',idp_def_td:'defTd',
      sack:'sacks',int:'ints',safe:'safeties',tkl:'tkl',tkl_solo:'solo',tkl_ast:'ast',tkl_loss:'tfl',qb_hit:'qbHit',def_ff:'ff',def_td:'defTd',def_pass_def:'pd',
    };
    if (direct[key]) return n(p[direct[key]]);
    if (key === 'pass_inc') return Math.max(0,n(p.passAtt)-n(p.passCmp));
    if (key === 'pass_int_td') return n(p.passPickSix, n(p.passInt)*.11);
    if (key === 'pass_sack') return n(p.passSack, pos === 'QB' ? n(p.passAtt)*.06 : 0);
    if (key === 'pass_fd') return firstDowns(p).pass;
    if (key === 'rush_fd') return firstDowns(p).rush;
    if (key === 'rec_fd') return firstDowns(p).rec;
    if (key === 'pass_2pt') return n(p.pass2pt,n(p.passTd)*.025);
    if (key === 'rush_2pt') return n(p.rush2pt,n(p.rushTd)*.025);
    if (key === 'rec_2pt') return n(p.rec2pt,n(p.recTd)*.025);
    if (key === 'fum') return n(p.fum,n(p.fumLost)*1.8);
    if (key === 'fum_rec') return n(p.fumRecOff,n(p.fumLost)*.25);
    if (key === 'fum_ret_td') return n(p.fumRetTd,n(p.fumLost)*.018);
    if (key === 'fum_ret_yd') return n(p.fumRetYds,n(p.fumLost)*2.2);
    if (key === 'blk_kick') return pos === 'DEF' ? n(p.blocks,1.25) : n(p.blocks,.03);
    if (key === 'blk_kick_ret_td') return n(p.blkKickRetTd, pos === 'DEF' ? n(p.blocks)*.08 : .003);
    if (key === 'blk_kick_ret_yd') return n(p.blkKickRetYds, value(p,'blk_kick_ret_td')*28);
    if (key === 'fg_ret_yd') return n(p.fgRetYds, pos === 'DB' ? 12 : 0);
    if (key === 'kr_yd') return returnEstimate(p,'krYds');
    if (key === 'pr_yd') return returnEstimate(p,'prYds');
    if (key === 'kr_td') return returnEstimate(p,'krTd');
    if (key === 'pr_td') return returnEstimate(p,'prTd');
    if (key === 'ret_td') return returnEstimate(p,'krTd') + returnEstimate(p,'prTd');
    if (key === 'st_td') return pos === 'DEF' ? n(p.stTd,returnEstimate(p,'krTd')+returnEstimate(p,'prTd')) : returnEstimate(p,'krTd')+returnEstimate(p,'prTd');
    if (key === 'st_tkl_solo') return n(p.stSolo, ['LB','DB'].includes(pos) ? 2.5 : ['RB','WR'].includes(pos) ? .7 : pos === 'DEF' ? 18 : 0);
    if (key === 'st_tkl_ast') return n(p.stAst, value(p,'st_tkl_solo')*.45);
    if (key === 'st_ff') return n(p.stFf, value(p,'st_tkl_solo')*.018);
    if (key === 'st_fum_rec') return n(p.stFr, value(p,'st_tkl_solo')*.012);

    if (['rec_0_4','rec_5_9','rec_10_19','rec_20_29','rec_30_39','bonus_rec_40p'].includes(key)) return receptionsByDistance(p,key);
    if (key === 'bonus_rec_te') return pos === 'TE' ? n(p.rec) : 0;
    if (key === 'bonus_rec_rb') return pos === 'RB' ? n(p.rec) : 0;
    if (key === 'bonus_rec_wr') return pos === 'WR' ? n(p.rec) : 0;
    if (key === 'bonus_rush_att') return pos === 'RB' ? n(p.rushAtt) : 0;
    if (key === 'bonus_fd_qb') return pos === 'QB' ? firstDowns(p).pass+firstDowns(p).rush : 0;
    if (key === 'bonus_fd_rb') return pos === 'RB' ? firstDowns(p).rush+firstDowns(p).rec : 0;
    if (key === 'bonus_fd_wr') return pos === 'WR' ? firstDowns(p).rec : 0;
    if (key === 'bonus_fd_te') return pos === 'TE' ? firstDowns(p).rec : 0;

    if (key === 'bonus_pass_cmp_40p') return n(p.passCmp40,n(p.passYds)/400);
    if (key === 'bonus_pass_td_40p') return n(p.passTd40,n(p.passTd)*.22);
    if (key === 'bonus_pass_td_50p') return n(p.passTd50,n(p.passTd)*.12);
    if (key === 'bonus_rush_40p') return n(p.rush40,n(p.rushYds)/300);
    if (key === 'bonus_rush_td_40p') return n(p.rushTd40,n(p.rushTd)*.18);
    if (key === 'bonus_rush_td_50p') return n(p.rushTd50,n(p.rushTd)*.10);
    if (key === 'bonus_rec_td_40p') return n(p.recTd40,n(p.recTd)*.20);
    if (key === 'bonus_rec_td_50p') return n(p.recTd50,n(p.recTd)*.11);
    if (key === 'bonus_pass_cmp_25') return aboveGames(p.passCmp,25,7);
    if (key === 'bonus_rush_att_20') return aboveGames(p.rushAtt,20,6);

    const threshold = key.match(/^bonus_(pass|rush|rec|rush_rec)_yd_(\d+)$/);
    if (threshold) {
      const total = threshold[1] === 'pass' ? p.passYds : threshold[1] === 'rush' ? p.rushYds : threshold[1] === 'rec' ? p.recYds : n(p.rushYds)+n(p.recYds);
      const spread = threshold[1] === 'pass' ? 70 : threshold[1] === 'rush' ? 38 : 42;
      return aboveGames(total,Number(threshold[2]),spread);
    }

    if (key === 'fgmiss') return Math.max(0,n(p.fga)-n(p.fgm));
    if (key === 'xpmiss') return Math.max(0,n(p.xpa)-n(p.xpm));
    if (key === 'fgm_yds') return n(p.fgYds,n(p.fgm)*41.5);
    if (key === 'fgm_yds_over_30') return n(p.fgYdsOver30,n(p.fgm)*11.5);
    const madeShare = fgShares(key);
    if (madeShare != null) return n(p.fgm)*madeShare;
    if (/^fgmiss_/.test(key)) {
      const equivalent = key.replace('fgmiss_','fgm_');
      return Math.max(0,n(p.fga)-n(p.fgm))*n(fgShares(equivalent),.2);
    }

    if (key === 'idp_tkl') return n(p.tkl,n(p.solo)+n(p.ast));
    if (key === 'idp_sack_yd') return n(p.sackYds,n(p.sacks)*7.2);
    if (key === 'idp_int_ret_yd') return n(p.intRetYds,n(p.ints)*14);
    if (key === 'idp_int_td') return n(p.intTd,n(p.ints)*.11);
    if (key === 'idp_fr_yd') return n(p.frYds,n(p.fr)*8);
    if (key === 'idp_fr_td') return n(p.frTd,n(p.fr)*.08);
    if (key === 'bonus_sack_2p') return aboveGames(p.sacks,2,.75);
    if (key === 'bonus_tkl_10p') return aboveGames(n(p.solo)+n(p.ast),10,3.2);
    if (key === 'idp_pass_def_3p') return aboveGames(p.pd,3,1.3);

    if (key === 'def_int_td') return n(p.intTd,n(p.ints)*.10);
    if (key === 'def_fum_td') return n(p.fumTd,n(p.fumRec)*.10);
    if (key === 'def_2pt') return n(p.def2pt,.18);
    if (key === 'def_1pt_safe') return n(p.def1ptSafe,.02);
    if (key === 'def_3_and_out') return n(p.threeAndOut, pos === 'DEF' ? 38 + n(p.sacks)*.18 : 0);
    if (key === 'def_4_and_stop') return n(p.fourthStops, pos === 'DEF' ? 8 + n(p.sacks)*.03 : 0);
    if (key === 'def_forced_punts') return n(p.forcedPunts, pos === 'DEF' ? 52 + n(p.sacks)*.20 : 0);
    if (key === 'def_st_tkl_solo') return n(p.defStSolo, pos === 'DEF' ? 18 : 0);
    if (key === 'def_kr_yd') return pos === 'DEF' ? returnEstimate(p,'krYds') : 0;
    if (key === 'def_pr_yd') return pos === 'DEF' ? returnEstimate(p,'prYds') : 0;
    if (key === 'def_kr_yd_10') return value(p,'def_kr_yd')/10;
    if (key === 'def_kr_yd_25') return value(p,'def_kr_yd')/25;
    if (key === 'def_pr_yd_10') return value(p,'def_pr_yd')/10;
    if (key === 'def_pr_yd_25') return value(p,'def_pr_yd')/25;
    if (key === 'sack_half') return n(p.sackHalf,n(p.sacks)*.28);
    if (key === 'sack_yd') return n(p.sackYds,n(p.sacks)*7.2);
    if (key === 'int_ret_yd') return n(p.intRetYds,n(p.ints)*15);
    if (key === 'tkl_3') return n(p.tkl,n(p.solo)+n(p.ast))/3;
    if (key === 'tkl_5') return n(p.tkl,n(p.solo)+n(p.ast))/5;
    if (key === 'bonus_def_fum_td_50p') return n(p.fumTd,n(p.fumRec)*.10)*.35;
    if (key === 'bonus_def_int_td_50p') return n(p.intTd,n(p.ints)*.10)*.35;
    if (key === 'pts_allow') return pos === 'DEF' ? n(p.pa) : 0;
    if (key === 'yds_allow') return pos === 'DEF' ? n(p.ya) : 0;
    const pa = parseRange(key,'pts_allow_');
    if (pa && pos === 'DEF') return rangeGames(p.pa,pa.low-.5,pa.high>=99999?99999:pa.high+.5,10);
    const ya = parseRange(key,'yds_allow_');
    if (ya && pos === 'DEF') return rangeGames(p.ya,ya.low-.5,ya.high>=99999?99999:ya.high+.5,80);
    return 0;
  }

  function family(rawKey) {
    const key = canonical(rawKey);
    if (/^(fg|xp)/.test(key)) return 'K';
    if (/^(idp_|bonus_sack_2p|bonus_tkl_10p)/.test(key)) return 'IDP';
    if (/^(def_|pts_allow|yds_allow|sack$|sack_|int$|int_ret_yd|safe$|tkl$|tkl_|qb_hit$)/.test(key)) return 'DEF';
    if (/^(kr_|pr_|st_|ret_td|blk_kick|fg_ret_yd|fum_ret_yd)/.test(key)) return 'ST';
    return 'OFF';
  }
  function applies(rawKey, rawPos) {
    const key = canonical(rawKey); const pos = normPos(rawPos); const f = family(key);
    if (key === 'bonus_rec_te') return pos === 'TE';
    if (key === 'bonus_rec_rb') return pos === 'RB';
    if (key === 'bonus_rec_wr') return pos === 'WR';
    if (key === 'bonus_rush_att') return pos === 'RB';
    if (f === 'K') return pos === 'K';
    if (f === 'IDP') return ['LB','DL','DB'].includes(pos);
    if (f === 'DEF') return pos === 'DEF';
    if (f === 'ST') return pos === 'DEF' || ['RB','WR','DB','LB'].includes(pos);
    return ['QB','RB','WR','TE'].includes(pos);
  }
  function projectedPoints(p, scoring) {
    if (!p || !scoring || typeof scoring !== 'object') return null;
    let points = 0; let used = 0;
    for (const [rawKey, rawMultiplier] of Object.entries(scoring)) {
      const multiplier = Number(rawMultiplier);
      if (!Number.isFinite(multiplier) || multiplier === 0 || !applies(rawKey,p.pos)) continue;
      points += value(p,rawKey) * multiplier;
      used += 1;
    }
    return used ? points : 0;
  }
  function coverage(scoring) {
    const active = Object.entries(scoring || {}).filter(([,v]) => Number.isFinite(Number(v)) && Number(v) !== 0);
    const known = active.filter(([k]) => isKnown(k));
    return { active:active.length, modeled:active.length, exactKnown:known.length, derived:active.length-known.length, unmodeled:[] };
  }

  const api = { canonical, isKnown, value, applies, projectedPoints, coverage, knownKeys:[...EXACT_KEYS] };
  global.SleeperExhaustiveScoring = api;

  // Public WhoToDraftNext uses global function declarations in app.js. Rebind
  // those functions so the existing recommendation/strategy layer consumes the
  // exhaustive stat resolver without changing VOR, roster or draft logic.
  if (global.SleeperDraftEngine && typeof global.SleeperDraftEngine === 'object') {
    global.keyIsModeled = () => true;
    global.statValue = (p,key) => api.value(p,key);
    global.keyAppliesToPosition = (key,pos) => api.applies(key,pos);
    global.leaguePoints = (p) => api.projectedPoints(p, state?.league?.scoring_settings || {});
    global.scoringCoverage = () => api.coverage(state?.league?.scoring_settings || {});
    global.SleeperDraftEngine.leaguePoints = global.leaguePoints;
    global.SleeperDraftEngine.scoringCoverage = global.scoringCoverage;
  }
})(window);