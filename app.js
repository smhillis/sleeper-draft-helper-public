const API='https://api.sleeper.app/v1';
const state={provider:'sleeper',username:'',leagueId:'',user:null,league:null,draft:null,rosters:[],picks:[],slot:null,timer:null,board:[],players:{},yahooLeagues:[],yahooLeague:null};
const $=id=>document.getElementById(id);
const norm=s=>(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');

async function j(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`Sleeper returned ${r.status}`);return r.json()}
async function apiJson(url,options){const r=await fetch(url,{cache:'no-store',...(options||{})});let data=null;try{data=await r.json()}catch{}return {r,data}}
function showErr(id,msg){const el=$(id);el.textContent=msg;el.style.display='block'}
function clearErr(id){const el=$(id);el.textContent='';el.style.display='none'}

function selectProvider(provider){
  state.provider=provider;
  const sleeper=provider==='sleeper';
  $('setupForm').classList.toggle('hidden',!sleeper);
  $('yahooSetup').classList.toggle('hidden',sleeper);
  $('sleeperTab').classList.toggle('active',sleeper);
  $('yahooTab').classList.toggle('active',!sleeper);
  $('sleeperTab').setAttribute('aria-selected',String(sleeper));
  $('yahooTab').setAttribute('aria-selected',String(!sleeper));
}

async function loadBoard(){const r=await fetch(`data/rankings.json?v=${Date.now()}`,{cache:'no-store'});const d=await r.json();state.board=d.players||[]}
async function loadPlayers(){try{const d=await j(`${API}/players/nfl`);const map={};Object.values(d||{}).forEach(p=>{const full=p.full_name||`${p.first_name||''} ${p.last_name||''}`.trim();if(full)map[norm(full)]={id:p.player_id,name:full}});state.players=map}catch{state.players={}}}
function photoUrl(name){const p=state.players[norm(name)];return p?`https://sleepercdn.com/content/nfl/players/${p.id}.jpg`:''}
function rosterForUser(){const id=state.user?.user_id;return state.rosters.find(r=>r.owner_id===id||(r.co_owners||[]).includes(id))||null}
function resolveSlot(){const uid=state.user?.user_id,d=state.draft||{};const direct=Number(d.draft_order?.[uid]);if(direct)return direct;const roster=rosterForUser();if(roster&&d.slot_to_roster_id){for(const [s,rid] of Object.entries(d.slot_to_roster_id)){if(Number(rid)===Number(roster.roster_id))return Number(s)}}return null}
function mine(){return state.picks.filter(p=>Number(p.draft_slot)===Number(state.slot))}
function nextMine(){const n=Number(state.league?.total_rosters||12),done=state.picks.length,out=[];if(!state.slot)return out;for(let r=1;r<30;r++){const overall=r%2?((r-1)*n+state.slot):(r*n-state.slot+1);if(overall>done)out.push({overall,round:r});if(out.length===2)break}return out}
function scoringAdjust(p){const s=state.league?.scoring_settings||{};let x=0;if(p.pos==='WR'||p.pos==='RB')x+=(Number(s.rec||0)-.5)*2;if(p.pos==='TE')x+=(Number(s.rec||0)-.5)*2+Number(s.bonus_rec_te||0)*3;if(p.pos==='QB')x+=(Number(s.pass_td||4)-4)*1.5;return x}
function recommendations(){const gone=new Set(state.picks.map(p=>norm(`${p.metadata?.first_name||''} ${p.metadata?.last_name||''}`)));const roster=mine().map(p=>p.metadata?.position).filter(Boolean);const targets={RB:2,WR:2,QB:1,TE:1};roster.forEach(p=>{if(targets[p]>0)targets[p]--});const next=nextMine()[0]?.overall||state.picks.length+1;return state.board.filter(p=>!gone.has(norm(p.name))).map(p=>{const base=110-Number(p.consensusRank||99);const need=targets[p.pos]>0?3:0;const qbEarly=p.pos==='QB'&&roster.length<3?-5:0;const market=Number(p.adp||p.consensusRank||99);const urgency=Math.max(-4,Math.min(8,(next-market)/5));const confidence=(Number(p.confidence||.75)-.75)*8;return {...p,score:base+need+qbEarly+urgency+confidence+scoringAdjust(p)}}).sort((a,b)=>b.score-a.score)}
function card(p,i){const photo=photoUrl(p.name);return `<article class="pick ${i===0?'best':''}"><span class="rank">${i+1}</span>${photo?`<img class="photo" src="${photo}" alt="${p.name}" onerror="this.style.display='none'">`:''}<div class="copy"><h2>${p.name}</h2><p>${p.pos} · ${p.team}${p.adp?` · ADP ${Number(p.adp).toFixed(1)}`:''}</p></div>${i===0?'<span class="badge">BEST PICK</span>':''}</article>`}
function render(){if(!state.league)return;$('leagueMeta').textContent=`${state.league.name||'Sleeper league'} · ${state.league.total_rosters||'?'} teams · ${state.username}`;$('slotValue').textContent=state.slot?`1.${String(state.slot).padStart(2,'0')}`:'?';$('draftStatus').textContent=(state.draft?.status||'PRE-DRAFT').replaceAll('_',' ').toUpperCase();$('pickStatus').textContent=state.draft?.status==='drafting'?`Pick ${state.picks.length+1} is on the clock`:state.draft?.status==='complete'?'Draft complete':'Draft not started';const rs=recommendations();$('pickCards').innerHTML=rs.slice(0,3).map(card).join('')||'<p>No recommendation available.</p>';const np=nextMine();$('turnCombo').innerHTML=np.length===2&&np[1].overall===np[0].overall+1&&rs[1]?`<b>BACK-TO-BACK PICKS</b><br><strong>Take ${rs[0].name} + ${rs[1].name}</strong>`:''}

async function connectSleeper(username,leagueId){clearErr('setupError');$('connectBtn').textContent='Connecting…';$('setupForm').classList.add('loading');try{await Promise.all([loadBoard(),loadPlayers()]);if(!state.board.length)throw new Error('Rankings are temporarily unavailable.');const [user,league,drafts,rosters]=await Promise.all([j(`${API}/user/${encodeURIComponent(username)}`),j(`${API}/league/${leagueId}`),j(`${API}/league/${leagueId}/drafts`),j(`${API}/league/${leagueId}/rosters`)]);if(!user?.user_id)throw new Error('Sleeper username not found.');state.provider='sleeper';state.username=user.username||username;state.leagueId=leagueId;state.user=user;state.league=league;state.rosters=rosters||[];if(!rosterForUser())throw new Error('That Sleeper user is not on this league roster.');state.draft=(drafts||[]).find(d=>String(d.season)==='2026')||(drafts||[])[0]||null;if(!state.draft)throw new Error('No Sleeper draft was found for this league.');state.slot=resolveSlot();if(!state.slot)throw new Error('Sleeper has not assigned a draft slot to this roster yet.');state.picks=await j(`${API}/draft/${state.draft.draft_id}/picks`)||[];const q=new URLSearchParams({user:state.username,league:state.leagueId});history.replaceState(null,'',`${location.pathname}?${q}`);localStorage.setItem('wtdn-user',state.username);localStorage.setItem('wtdn-league',state.leagueId);$('syncSource').textContent='↻ Auto-updating from Sleeper';$('setup').classList.add('hidden');$('assistant').classList.remove('hidden');$('shareBtn').classList.remove('hidden');render();await sync();if(state.timer)clearInterval(state.timer);state.timer=setInterval(sync,5000)}catch(e){showErr('setupError',e.message||'Could not connect to Sleeper.')}finally{$('connectBtn').textContent='Show Me Who to Draft Next';$('setupForm').classList.remove('loading')}}
async function sync(){try{clearErr('syncError');const [league,drafts,rosters]=await Promise.all([j(`${API}/league/${state.leagueId}`),j(`${API}/league/${state.leagueId}/drafts`),j(`${API}/league/${state.leagueId}/rosters`)]);state.league=league;state.rosters=rosters||[];state.draft=(drafts||[]).find(d=>String(d.season)==='2026')||(drafts||[])[0]||state.draft;state.slot=resolveSlot()||state.slot;if(state.draft)state.picks=await j(`${API}/draft/${state.draft.draft_id}/picks`)||[];$('lastSync').textContent=`Updated ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit',second:'2-digit'})}`;render()}catch{showErr('syncError','Sleeper data is temporarily unavailable. Retrying automatically.');$('lastSync').textContent='Retrying…'}}

function setYahooConnected(connected){
  $('yahooDisconnected').classList.toggle('hidden',connected);
  $('yahooConnected').classList.toggle('hidden',!connected);
  if(!connected){$('yahooLeaguePicker').classList.add('hidden');$('yahooLeagueLoading').classList.add('hidden');$('yahooReady').classList.add('hidden')}
}

function yahooErrorMessage(data,status){
  const base=data?.error||`Yahoo request failed (HTTP ${status})`;
  const detail=(data?.detail||'').replace(/\s+/g,' ').trim();
  return detail?`${base}. ${detail.slice(0,260)}`:base;
}

async function loadYahooLeagues(){
  clearErr('yahooError');
  $('yahooLeagueLoading').classList.remove('hidden');
  $('yahooLeaguePicker').classList.add('hidden');
  $('yahooReady').classList.add('hidden');
  $('yahooConnectionMeta').textContent='Finding your football leagues…';
  try{
    const {r,data}=await apiJson('/api/yahoo/leagues');
    if(!r.ok||!data?.ok)throw new Error(yahooErrorMessage(data,r.status));
    state.yahooLeagues=data.leagues||[];
    $('yahooLeagueLoading').classList.add('hidden');
    if(!state.yahooLeagues.length){
      $('yahooConnectionMeta').textContent='Yahoo is connected.';
      showErr('yahooError','Yahoo connected successfully, but Yahoo returned no fantasy football leagues for this account.');
      return;
    }
    const select=$('yahooLeagueSelect');
    select.replaceChildren();
    state.yahooLeagues.forEach(league=>{
      const option=document.createElement('option');
      option.value=league.leagueKey;
      const teams=league.numTeams?` · ${league.numTeams} teams`:'';
      const season=league.season?` · ${league.season}`:'';
      option.textContent=`${league.name}${teams}${season}`;
      select.appendChild(option);
    });
    const saved=localStorage.getItem('wtdn-yahoo-league');
    if(saved&&state.yahooLeagues.some(l=>l.leagueKey===saved))select.value=saved;
    $('yahooConnectionMeta').textContent=`${state.yahooLeagues.length} football league${state.yahooLeagues.length===1?'':'s'} found`;
    $('yahooLeaguePicker').classList.remove('hidden');
  }catch(error){
    $('yahooLeagueLoading').classList.add('hidden');
    $('yahooConnectionMeta').textContent='Yahoo is connected, but league access failed.';
    showErr('yahooError',error.message||'Could not load Yahoo leagues.');
  }
}

async function initYahoo(){
  const params=new URLSearchParams(location.search);
  if(params.get('yahooError'))showErr('yahooError',params.get('yahooError'));
  try{
    const {r,data}=await apiJson('/api/yahoo/status');
    if(!r.ok||!data?.ok){setYahooConnected(false);return}
    setYahooConnected(Boolean(data.connected));
    if(data.connected)await loadYahooLeagues();
  }catch{
    setYahooConnected(false);
  }
}

$('sleeperTab').onclick=()=>selectProvider('sleeper');
$('yahooTab').onclick=()=>selectProvider('yahoo');
$('setupForm').addEventListener('submit',e=>{e.preventDefault();connectSleeper($('username').value.trim(),$('leagueId').value.trim())});
$('yahooConnect').onclick=()=>{location.href='/api/yahoo/start'};
$('yahooDisconnect').onclick=async()=>{clearErr('yahooError');try{await apiJson('/api/yahoo/disconnect',{method:'POST'});state.yahooLeagues=[];state.yahooLeague=null;localStorage.removeItem('wtdn-yahoo-league');localStorage.removeItem('wtdn-yahoo-league-name');setYahooConnected(false);history.replaceState(null,'',location.pathname+'?provider=yahoo')}catch{showErr('yahooError','Could not disconnect Yahoo.')}};
$('yahooLeagueBtn').onclick=()=>{
  const key=$('yahooLeagueSelect').value;
  const league=state.yahooLeagues.find(item=>item.leagueKey===key);
  if(!league)return;
  state.yahooLeague=league;
  localStorage.setItem('wtdn-yahoo-league',league.leagueKey);
  localStorage.setItem('wtdn-yahoo-league-name',league.name);
  const q=new URLSearchParams({provider:'yahoo',leagueKey:league.leagueKey});
  history.replaceState(null,'',`${location.pathname}?${q}`);
  $('yahooReady').textContent=`${league.name} is selected. Yahoo connection and league discovery are working; live draft synchronization is the next integration step.`;
  $('yahooReady').classList.remove('hidden');
};
$('changeLeague').onclick=()=>{if(state.timer)clearInterval(state.timer);state.timer=null;$('assistant').classList.add('hidden');$('setup').classList.remove('hidden');$('shareBtn').classList.add('hidden');history.replaceState(null,'',location.pathname);selectProvider(state.provider)};
$('shareBtn').onclick=async()=>{const url=location.href;try{if(navigator.share)await navigator.share({title:'Who To Draft Next',url});else await navigator.clipboard.writeText(url)}catch{}};

const params=new URLSearchParams(location.search);
const u=params.get('user')||localStorage.getItem('wtdn-user')||'';
const l=params.get('league')||localStorage.getItem('wtdn-league')||'';
$('username').value=u;
$('leagueId').value=l;
if(params.get('provider')==='yahoo'||params.has('yahoo')||params.has('yahooError')||params.has('leagueKey')){
  selectProvider('yahoo');
  initYahoo();
}else{
  selectProvider('sleeper');
  if(params.get('user')&&params.get('league'))connectSleeper(params.get('user'),params.get('league'));
}
