(function installMobileCardReadability() {
  'use strict';

  const STYLE_ID = 'mobile-card-readability-styles';
  const GLOSSARY_CLASS = 'metric-glossary';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .metric-glossary{margin:18px 0 4px;padding:14px 15px;border:1px solid var(--line,#e5e7eb);border-radius:13px;background:rgba(127,127,127,.07);color:inherit}
      .metric-glossary h4{margin:0 0 10px;font-size:14px;line-height:1.25;letter-spacing:.03em}
      .metric-glossary dl{margin:0;display:grid;gap:8px}
      .metric-glossary .metric-definition{display:grid;grid-template-columns:92px minmax(0,1fr);gap:9px;align-items:start}
      .metric-glossary dt{margin:0;font-size:12.5px;font-weight:900;line-height:1.35}
      .metric-glossary dd{margin:0;color:var(--muted,#6b7280);font-size:12.5px;line-height:1.42}
      @media(max-width:600px){
        .pick{display:grid!important;grid-template-columns:max-content max-content minmax(0,1fr) max-content!important;align-items:start!important;column-gap:10px!important;row-gap:0!important}
        .pick>.rank{grid-column:1;grid-row:1}
        .pick>.photo{grid-column:2;grid-row:1}
        .pick>.copy{display:contents!important}
        .pick>.copy>h2{grid-column:3;grid-row:1;align-self:center;min-width:0}
        .pick>.badge{grid-column:4;grid-row:1;align-self:start}
        .pick>.copy>.player-meta,.pick>.copy>p:first-of-type{grid-column:1/-1;grid-row:2;margin:11px 0 0!important;font-size:15px!important;font-weight:800!important;line-height:1.32!important}
        .pick>.copy>.draft-urgency,.pick>.copy>p:nth-of-type(2){grid-column:1/-1;grid-row:3;margin:7px 0 0!important;font-size:13px!important;line-height:1.35!important}
        .pick>.copy>.draft-metrics,.pick>.copy>p:nth-of-type(3){grid-column:1/-1;grid-row:4;margin:5px 0 0!important;font-size:12.5px!important;line-height:1.4!important}
        .pick>.copy>.draft-why,.pick>.copy>p:nth-of-type(4){grid-column:1/-1;grid-row:5;margin:6px 0 0!important;font-size:14px!important;line-height:1.45!important}
        .metric-glossary{padding:14px;margin-top:16px}
        .metric-glossary h4{font-size:15px}
        .metric-glossary .metric-definition{grid-template-columns:82px minmax(0,1fr);gap:8px}
        .metric-glossary dt,.metric-glossary dd{font-size:13px}
      }
    `;
    document.head.appendChild(style);
  }

  function glossaryHtml() {
    return `
      <h4>WHAT THE NUMBERS MEAN</h4>
      <dl>
        <div class="metric-definition"><dt>ADP</dt><dd>Average Draft Position. Roughly where this player is usually selected. A lower number means an earlier pick.</dd></div>
        <div class="metric-definition"><dt>VOR</dt><dd>Value Over Replacement. How much stronger this player is than a replacement-level option at the same position. Higher is better.</dd></div>
        <div class="metric-definition"><dt>Tier drop</dt><dd>The quality drop from this player to the next comparable option. A bigger number means passing is more costly.</dd></div>
        <div class="metric-definition"><dt>Wait cost</dt><dd>Estimated recommendation value you risk losing by waiting until your next pick. Higher means more reason to act now.</dd></div>
        <div class="metric-definition"><dt>Chance back</dt><dd>Estimated probability this player will still be available when you pick again.</dd></div>
        <div class="metric-definition"><dt>Rec. score</dt><dd>The assistant's combined league-adjusted recommendation score after scoring, roster fit, scarcity, and wait risk are considered.</dd></div>
      </dl>`;
  }

  function ensureGlossary() {
    const recs = document.querySelector('.recs');
    if (!recs || recs.querySelector(`.${GLOSSARY_CLASS}`)) return;
    const glossary = document.createElement('section');
    glossary.className = GLOSSARY_CLASS;
    glossary.setAttribute('aria-label', 'Draft metric definitions');
    glossary.innerHTML = glossaryHtml();
    recs.appendChild(glossary);
  }

  function install() {
    injectStyles();
    ensureGlossary();
  }

  install();
  document.addEventListener('DOMContentLoaded', install, { once: true });
  const observer = new MutationObserver(ensureGlossary);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
