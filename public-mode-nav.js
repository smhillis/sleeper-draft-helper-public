(function installPublicSleeperModeNav(){
  'use strict';
  if(typeof document==='undefined') return;
  const DEST='https://sleeper.whotodraftnext.com';
  const oldTop=document.querySelector('body > header.top');
  if(oldTop) oldTop.style.display='none';

  const style=document.createElement('style');
  style.textContent=`
    .wtdn-public-header{background:#071321;color:#fff;border-bottom:1px solid #1e293b}
    .wtdn-public-inner{max-width:760px;margin:0 auto;padding:16px 16px 14px}
    .wtdn-public-brand-row{display:flex;align-items:center;gap:12px}
    .wtdn-public-brand-row img{width:48px;height:48px;border-radius:11px;flex:0 0 auto}
    .wtdn-public-wordmark{flex:1;min-width:0;margin:0;font-size:clamp(24px,6vw,32px);line-height:1;font-weight:950;font-style:italic;letter-spacing:-1px;text-transform:uppercase;white-space:nowrap}
    .wtdn-public-wordmark span{color:#22c55e}
    .wtdn-public-change{flex:0 0 auto;border:1px solid #475569;border-radius:999px;background:#0f172a;color:#fff;min-height:38px;padding:7px 13px;font-size:13px;font-weight:850}
    .wtdn-public-league{margin-top:10px;color:#cbd5e1;font-size:15px;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .wtdn-public-nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}
    .wtdn-public-nav a{min-height:48px;display:flex;align-items:center;justify-content:center;border:1px solid #475569;border-radius:11px;background:#0f172a;color:#fff;text-decoration:none;font-size:16px;font-weight:900;padding:8px 5px}
    .wtdn-public-nav a.active{background:#166534;border-color:#4ade80}
    body.wtdn-draft-complete .recs,body.wtdn-draft-complete #turnCombo{display:none!important}
    body.wtdn-draft-complete .drafthead{margin-bottom:0}
    @media(max-width:390px){.wtdn-public-inner{padding-left:12px;padding-right:12px}.wtdn-public-brand-row img{width:42px;height:42px}.wtdn-public-wordmark{font-size:23px}.wtdn-public-nav{gap:5px}.wtdn-public-nav a{min-height:46px;font-size:14px;border-radius:9px}.wtdn-public-change{min-height:36px;padding:6px 11px}.wtdn-public-league{font-size:14px}}
  `;
  document.head.appendChild(style);

  const header=document.createElement('div');
  header.className='wtdn-public-header';
  header.innerHTML=`<header class="wtdn-public-inner"><div class="wtdn-public-brand-row"><img src="brand-mark.svg" alt=""><h1 class="wtdn-public-wordmark">Who To <span>Draft</span> Next</h1><button type="button" class="wtdn-public-change">Home</button></div><div class="wtdn-public-league">Sleeper · <span data-league>Fantasy Football</span></div><nav class="wtdn-public-nav" aria-label="Sleeper fantasy tools"><a class="active" href="${DEST}/">Draft</a><a href="${DEST}/waivers.html">Waivers</a><a href="${DEST}/lineup.html">Lineup</a><a href="${DEST}/mock-draft.html">Mock</a></nav></header>`;
  document.body.insertBefore(header,document.body.firstChild);

  const leagueNode=header.querySelector('[data-league]');
  const change=header.querySelector('.wtdn-public-change');
  change?.addEventListener('click',()=>{location.href='https://www.whotodraftnext.com/';});

  function sync(){
    const meta=(document.getElementById('leagueMeta')?.textContent||'').trim();
    const saved=localStorage.getItem('private-sleeper-league-name-v1')||'';
    const leagueName=(meta?meta.split(' · ')[0].trim():saved)||'Fantasy Football';
    if(leagueNode && leagueNode.textContent!==leagueName) leagueNode.textContent=leagueName;
    const status=(document.getElementById('draftStatus')?.textContent||'').trim().toLowerCase();
    const pickStatus=(document.getElementById('pickStatus')?.textContent||'').trim().toLowerCase();
    const complete=status.includes('complete')||pickStatus==='draft complete';
    if(document.body.classList.contains('wtdn-draft-complete')!==complete){
      document.body.classList.toggle('wtdn-draft-complete',complete);
    }
    if(complete){
      const cards=document.getElementById('pickCards');
      if(cards && cards.childNodes.length) cards.replaceChildren();
    }
  }
  sync();
  setInterval(sync,1000);
})();
