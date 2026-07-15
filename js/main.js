/* =========================================================
   MAIN — bootstrap da aplicação
   ========================================================= */
function renderHome(){
  const hour = new Date().getHours();
  const greetingEl = document.getElementById("homeGreeting");
  if(greetingEl){
    const g = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    greetingEl.textContent = `${g}! Bora montar o time dos sonhos.`;
  }
  refreshWalletUI();
  document.getElementById("homePlayers").textContent = STATE.ownedPlayers.length;
  document.getElementById("homeGifts").textContent = STATE.gifts.filter(g=>!g.claimed).length;
  document.getElementById("homeMissions").textContent = Object.values(STATE.missionsProgress).filter(p=>p.claimed).length;
  document.getElementById("homeStreak").textContent = STATE.stats.loginStreak;

  const row = document.getElementById("dailyLoginRow");
  const cycleDay = ((STATE.stats.loginStreak - 1) % 7) + 1;
  row.innerHTML = (GAME_DATA.events.dailyLogin || []).map(r=>{
    const state = r.day < cycleDay ? "done" : r.day === cycleDay ? "today" : "";
    return `<div class="quick-card" style="min-width:90px;flex:0 0 auto;${state==='today'?'border-color:var(--turf);':''} ${state==='done'?'opacity:.5;':''}">
      <div class="lbl">Dia ${r.day}</div>
      <div class="num" style="font-size:16px;">${r.rewardGP} GP</div>
      ${state==="today" ? '<span style="font-size:10px;color:var(--turf);">HOJE</span>' : state==="done" ? '<span style="font-size:10px;">✓</span>' : ""}
    </div>`;
  }).join("");
}

function renderConfigScreen(){
  const el = document.getElementById("configPlayerId");
  if(el) el.textContent = getPlayerId();
}

function wireSettings(){
  const sSound = document.getElementById("toggleSound");
  const sMusic = document.getElementById("toggleMusic");
  const sVib = document.getElementById("toggleVibration");
  const sMotion = document.getElementById("toggleReducedMotion");
  sSound.checked = STATE.settings.sound;
  sMusic.checked = STATE.settings.music;
  sVib.checked = STATE.settings.vibration;
  sMotion.checked = STATE.settings.reducedMotion;

  sSound.onchange = ()=>{ STATE.settings.sound = sSound.checked; persist(); };
  sMusic.onchange = ()=>{ setMusicEnabled(sMusic.checked); };
  sVib.onchange = ()=>{ STATE.settings.vibration = sVib.checked; persist(); };
  sMotion.onchange = ()=>{
    STATE.settings.reducedMotion = sMotion.checked;
    document.body.style.setProperty("--reduced-motion", sMotion.checked ? "reduce":"no-preference");
    persist();
  };

  document.getElementById("btnResetSave").addEventListener("click", ()=>{
    if(!confirm("Isso vai apagar TODO o seu progresso salvo. Tem certeza?")) return;
    localStorage.removeItem(SAVE_KEY);
    location.reload();
  });
}

async function boot(){
  loadState();
  try{
    await loadGameData();
    await loadCoupons();
  }catch(e){
    console.error(e);
    document.getElementById("mainContent").innerHTML = `
      <div class="empty-state">
        <div class="big">⚠️</div>
        Não foi possível carregar os arquivos de dados (data/*.json).<br>
        Abra este projeto através de um servidor local (ex: <code>python -m http.server</code> ou a extensão Live Server),
        pois navegadores bloqueiam o carregamento direto de arquivos JSON via file://.
      </div>`;
    return;
  }

  buildNav();
  wireSettings();
  wireCouponRedeem();
  checkDailyLogin();
  refreshWalletUI();
  showScreen("home");
  const openedDailyLogin = typeof maybeShowDailyLogin === "function" && maybeShowDailyLogin();
  if(!openedDailyLogin && typeof maybeShowNovidades === "function") maybeShowNovidades();
  if(typeof maybeShowUsernamePopup === "function") maybeShowUsernamePopup();
  if(typeof pushProfileToFirestore === "function") pushProfileToFirestore();
}

document.addEventListener("DOMContentLoaded", boot);
