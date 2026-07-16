/* =========================================================
   LOGIN BONUS — popup diário estilo eFootball ("World Cup 2026:
   Login Bonus"), com banner de fundo + calendário de 7 dias.

   Como configurar (data/events.json):
     "dailyLoginTitle":  título mostrado no topo do popup
     "dailyLoginBanner": caminho da imagem de fundo (banner)
     "dailyLogin": [ {day, rewardGP, rewardCoins}, ... ]  // 7 dias

   Fluxo:
   - state.js -> checkDailyLogin() detecta um novo "dia de jogo"
     (reseta às 23h, não à meia-noite) e marca STATE.stats.dailyLoginPending = true.
   - boot() (main.js) chama maybeShowDailyLogin(), que abre o popup
     se houver bônus pendente.
   - O jogador clica em "Resgatar" -> claimDailyLogin() credita o
     prêmio do dia atual, fecha o popup e zera o "pending".
   ========================================================= */

function getDailyLoginCycleDay(){
  return ((STATE.stats.loginStreak - 1) % 7) + 1;
}

function renderDailyLoginPopup(){
  const cycleDay = getDailyLoginCycleDay();

  const titleEl = document.getElementById("dailyLoginPopupTitle");
  if(titleEl) titleEl.textContent = GAME_DATA.events.dailyLoginTitle || "Login Bonus";

  const bannerEl = document.getElementById("dailyLoginPopupBanner");
  if(bannerEl){
    bannerEl.style.backgroundImage = GAME_DATA.events.dailyLoginBanner
      ? `url('${GAME_DATA.events.dailyLoginBanner}')` : "none";
  }

  const grid = document.getElementById("dailyLoginPopupGrid");
  if(!grid) return;
  grid.innerHTML = (GAME_DATA.events.dailyLogin || []).map(r=>{
    const status = r.day < cycleDay ? "done" : r.day === cycleDay ? "today" : "locked";
    const icon = status === "done" ? "✓" : status === "today" ? "🎁" : "🔒";
    const prize = r.rewardCoins
      ? `${r.rewardGP.toLocaleString("pt-BR")} GP<br>+${r.rewardCoins} Moedas`
      : `${r.rewardGP.toLocaleString("pt-BR")} GP`;
    return `
      <div class="daily-login-day ${status}">
        <div class="daily-login-day-num">Dia ${r.day}</div>
        <div class="daily-login-day-icon">${icon}</div>
        <div class="daily-login-day-prize">${prize}</div>
      </div>`;
  }).join("");

  const claimBtn = document.getElementById("dailyLoginClaimBtn");
  if(claimBtn) claimBtn.textContent = `Resgatar bônus do Dia ${cycleDay}`;
}

function claimDailyLogin(){
  if(!STATE.stats.dailyLoginPending) return closeDailyLoginPopup();
  const cycleDay = getDailyLoginCycleDay();
  const reward = (GAME_DATA.events.dailyLogin || []).find(r=>r.day===cycleDay) || {rewardGP:500, rewardCoins:0};

  grantCurrency(reward.rewardGP, reward.rewardCoins);
  STATE.stats.dailyLoginPending = false;
  persist();

  toast(`Bônus do Dia ${cycleDay} resgatado!`, "success");
  closeDailyLoginPopup();
  if(typeof renderHome === "function" && currentScreen === "home") renderHome();
  if(typeof maybeShowNovidades === "function") maybeShowNovidades();
}

function closeDailyLoginPopup(){
  const overlay = document.getElementById("dailyLoginOverlay");
  if(overlay) overlay.classList.add("hidden");
}

function maybeShowDailyLogin(){
  const overlay = document.getElementById("dailyLoginOverlay");
  if(!overlay || !STATE.stats.dailyLoginPending) return false;
  renderDailyLoginPopup();
  overlay.classList.remove("hidden");
  return true;
}

document.addEventListener("DOMContentLoaded", ()=>{
  const claimBtn = document.getElementById("dailyLoginClaimBtn");
  if(claimBtn) claimBtn.onclick = claimDailyLogin;
});
