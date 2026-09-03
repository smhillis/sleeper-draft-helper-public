(function installSleeperLeaguePicker(){
  'use strict';
  const USER_KEY='wtdn-user';
  const LEAGUE_KEY='wtdn-league';
  const SHARED_USER_KEY='private-sleeper-username-v1';
  const SHARED_LEAGUE_KEY='private-sleeper-league-v2';
  const SHARED_NAME_KEY='private-sleeper-league-name-v1';

  const username=document.getElementById('username');
  const league=document.getElementById('leagueId');
  const form=document.getElementById('setupForm');
  const button=document.getElementById('connectBtn');
  const error=document.getElementById('setupError');
  if(!username||!league||!form||!button) return;

  let loading=false;
  let loadedFor='';

  function showError(message){
    if(!error) return;
    error.textContent=message||'';
    error.style.display=message?'block':'none';
  }

  async function lookupLeagues(entered){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetch(`/api/sleeper-leagues?username=${encodeURIComponent(entered)}&t=${Date.now()}`,{
        cache:'no-store',
        signal:controller.signal
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(payload?.error||`League lookup failed (${response.status}).`);
      return payload;
    }catch(err){
      if(err?.name==='AbortError') throw new Error('Sleeper is taking too long to respond. Try again.');
      throw err;
    }finally{
      clearTimeout(timer);
    }
  }

  function resetLeague(message='Enter your Sleeper name first'){
    league.innerHTML=`<option value="">${message}</option>`;
    league.value='';
    league.disabled=true;
    loadedFor='';
    button.textContent='Find My Leagues';
  }

  function rememberSelection(){
    const user=username.value.trim();
    const option=league.selectedOptions?.[0];
    const leagueId=league.value;
    if(user){
      localStorage.setItem(USER_KEY,user);
      localStorage.setItem(SHARED_USER_KEY,user);
    }
    if(leagueId){
      localStorage.setItem(LEAGUE_KEY,leagueId);
      localStorage.setItem(SHARED_LEAGUE_KEY,leagueId);
      if(option?.textContent) localStorage.setItem(SHARED_NAME_KEY,option.textContent.trim());
    }
  }

  async function loadLeagues(){
    const entered=username.value.trim();
    if(!entered){
      showError('Enter your Sleeper username first.');
      resetLeague();
      username.focus();
      return false;
    }
    if(loading) return false;
    loading=true;
    showError('');
    button.textContent='Finding leagues…';
    button.disabled=true;
    try{
      const payload=await lookupLeagues(entered);
      const user=payload?.user||{};
      const current=Array.isArray(payload?.leagues)?payload.leagues:[];
      if(!current.length) throw new Error('No 2026 Sleeper leagues were found for this username.');

      const saved=localStorage.getItem(LEAGUE_KEY)||localStorage.getItem(SHARED_LEAGUE_KEY)||'';
      league.innerHTML='<option value="">Choose a league</option>'+current.map(item=>`<option value="${String(item.league_id).replace(/"/g,'&quot;')}">${String(item.name||item.league_id).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</option>`).join('');
      league.disabled=false;
      loadedFor=entered.toLowerCase();
      if(saved&&current.some(item=>String(item.league_id)===String(saved))) league.value=String(saved);
      else if(current.length===1) league.value=String(current[0].league_id);

      localStorage.setItem(USER_KEY,user.username||entered);
      localStorage.setItem(SHARED_USER_KEY,user.username||entered);
      button.textContent=league.value?'Show Me Who to Draft Next':'Choose a League';
      if(league.value) rememberSelection();
      return true;
    }catch(err){
      resetLeague('No leagues loaded');
      showError(err?.message||'Could not load Sleeper leagues.');
      return false;
    }finally{
      loading=false;
      button.disabled=false;
    }
  }

  username.addEventListener('input',()=>{
    if(loadedFor&&username.value.trim().toLowerCase()!==loadedFor) resetLeague('Find leagues for this username');
  });

  username.addEventListener('blur',()=>{
    if(username.value.trim()&&!league.value&&!loading) loadLeagues();
  });

  league.addEventListener('change',()=>{
    showError('');
    if(league.value){
      rememberSelection();
      button.textContent='Show Me Who to Draft Next';
    }else button.textContent='Choose a League';
  });

  form.addEventListener('submit',async(event)=>{
    if(league.value){ rememberSelection(); return; }
    event.preventDefault();
    event.stopImmediatePropagation();
    if(loadedFor===username.value.trim().toLowerCase()){
      showError('Choose a Sleeper league.');
      league.focus();
      return;
    }
    await loadLeagues();
    if(!league.value&&league.disabled===false) league.focus();
  },true);

  setTimeout(()=>{
    const savedUser=localStorage.getItem(USER_KEY)||localStorage.getItem(SHARED_USER_KEY)||'';
    if(!username.value&&savedUser) username.value=savedUser;
    if(username.value.trim()) loadLeagues();
    else resetLeague();
  },0);
})();
