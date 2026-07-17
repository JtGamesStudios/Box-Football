/* =========================================================
   STATE — fonte única de verdade + persistência automática
   ========================================================= */
const SAVE_KEY = "boxclube_save_v1";

function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

/* "Dia de jogo" do Login Bonus — vira pro dia seguinte às 23h (em vez
   de à meia-noite), pra bater com o horário pedido pro reset diário. */
function loginDayInfo(){
  const d = new Date();
  if(d.getHours() >= 23) d.setDate(d.getDate()+1);
  d.setHours(0,0,0,0);
  return d;
}
function loginDayStr(d){
  d = d || loginDayInfo();
  return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
}

function defaultState(){
  return {
    currency: { gp: 15000, coins: 200 },
    ownedPlayers: [],           // [{...player, acquiredAt}]
    ownedIds: [],               // quick lookup
    boxRemoved: {},             // { boxId: [playerId, ...] } players já contratados (removidos da box)
    adminOverrides: {},         // { boxId: {name, description, banner, priceGP, priceCoins, active, extraPlayerIds:[]} }
    missionsProgress: {},       // { missionId: { progress, claimed } }
    gifts: [],                  // [{id, title, desc, gp, coins, claimed, createdAt}]
    redeemedCodes: [],          // [ "CODIGO1", "CODIGO2", ... ] — cupons já resgatados por este ID
    squads: [],                 // [{id,name, formationId, coachId, captainSlot, assignments:{slotId:playerId}}]
    activeSquadId: null,
    settings: { sound: true, vibration: true, reducedMotion: false },
    profile: {                  // Nome de usuário + nacionalidade p/ ranking global
      username: null,
      nationality: null,
      nationalityFlag: null,
      registeredAt: null,
    },
    campaign: {                 // Modo Campanha (Divisão/Rating, tela estilo eFootball)
      rating: 1000,
      wins: 0,
      draws: 0,
      losses: 0,
      phaseStart: Date.now(),
      difficulty: "normal",     // fácil | normal | difícil (Matchmaking Settings)
      matchHistory: [],         // [{date, score, result, ratingDelta}]
    },
    events: {                   // Modo de Evento — progresso por evento ativo
      points: {},                // { eventId: number }
      claimedMilestones: {},     // { eventId: [pointsThreshold, ...] }
      attemptsToday: {},         // { eventId: { date: "YYYY-M-D", used: number } }
      history: {},               // { eventId: [{date, score, result}, ...] }
    },
    seenContent: {               // controla o popup "Novidades" (boxes/eventos ativos)
      signature: null,
    },
    pvp: {                       // Jogo c/ amigo — PvP online (ver js/online.js)
      friends: [],                // [{id, nickname}]
      history: [],                // [{opponent, score, result, date}]
    },
    stats: {
      boxesOpened: 0,
      ballCounts: { branca: 0, prata: 0, dourada: 0, preta: 0 },
      gpSpent: 0,
      loginStreak: 0,
      lastLoginDate: null,
      dailyLoginPending: false,  // true quando o bônus do dia ainda não foi resgatado no popup
      dailyLoginMigrated: true, // marca que este save já passou pela migração do novo Login Bonus
      giftIdSeq: 1,
    },
  };
}

let STATE = null;

function loadState(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    STATE = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
  }catch(e){
    console.warn("Falha ao carregar save, iniciando novo.", e);
    STATE = defaultState();
  }
  const needsDailyLoginMigration = !('dailyLoginMigrated' in STATE.stats);

  // merge de campos novos que possam faltar em saves antigos
  const d = defaultState();
  for(const k in d){ if(!(k in STATE)) STATE[k] = d[k]; }
  for(const k in d.stats){ if(!(k in STATE.stats)) STATE.stats[k] = d.stats[k]; }

  // Migração única: saves de antes do popup de Login Bonus não devem
  // "pular" o Dia 1 — zera o ciclo pra começar hoje mesmo.
  if(needsDailyLoginMigration){
    STATE.stats.lastLoginDate = null;
    STATE.stats.loginStreak = 0;
    STATE.stats.dailyLoginPending = false;
    STATE.stats.dailyLoginMigrated = true;
  }

  return STATE;
}

function saveState(){
  try{
    localStorage.setItem(SAVE_KEY, JSON.stringify(STATE));
  }catch(e){
    console.error("Falha ao salvar progresso", e);
  }
}

// autosave debounced
let _saveTimer = null;
function persist(){
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveState, 150);
}

/* ---------- moeda ---------- */
function grantCurrency(gp, coins, reason){
  STATE.currency.gp += gp || 0;
  STATE.currency.coins += coins || 0;
  persist();
  refreshWalletUI();
}

function spendCurrency(gp, coins){
  if((gp||0) > STATE.currency.gp || (coins||0) > STATE.currency.coins) return false;
  STATE.currency.gp -= gp || 0;
  STATE.currency.coins -= coins || 0;
  STATE.stats.gpSpent += gp || 0;
  persist();
  refreshWalletUI();
  return true;
}

function refreshWalletUI(){
  const gp = STATE.currency.gp.toLocaleString("pt-BR");
  const coins = STATE.currency.coins.toLocaleString("pt-BR");
  ["gpValue-side","gpValue-top"].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent = gp; });
  ["coinsValue-side","coinsValue-top"].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent = coins; });
  const homeGP = document.getElementById("homeGP"); if(homeGP) homeGP.textContent = gp;
  const homeCoins = document.getElementById("homeCoins"); if(homeCoins) homeCoins.textContent = coins;
}

/* ---------- presentes ---------- */
function addGift(title, desc, gp, coins){
  const id = "g" + (STATE.stats.giftIdSeq++);
  STATE.gifts.push({ id, title, desc, gp: gp||0, coins: coins||0, claimed:false, createdAt: Date.now() });
  persist();
}

function claimGift(id){
  const g = STATE.gifts.find(g=>g.id===id);
  if(!g || g.claimed) return;
  g.claimed = true;
  grantCurrency(g.gp, g.coins);
  persist();
}

function claimAllGifts(){
  let gp=0, coins=0, count=0;
  STATE.gifts.forEach(g=>{ if(!g.claimed){ gp+=g.gp; coins+=g.coins; g.claimed=true; count++; } });
  if(count>0){ grantCurrency(gp, coins); toast(`${count} presente(s) resgatado(s)!`, "success"); }
  else toast("Nenhum presente pendente.", "");
  persist();
}

/* ---------- jogadores ---------- */
function ownPlayer(player){
  STATE.ownedPlayers.push(Object.assign({}, player, { acquiredAt: Date.now() }));
  STATE.ownedIds.push(player.id);
  persist();
}

function isOwned(playerId){
  return STATE.ownedIds.includes(playerId);
}

/* ---------- toast ---------- */
function toast(msg, type){
  const wrap = document.getElementById("toastWrap");
  if(!wrap) return;
  const el = document.createElement("div");
  el.className = "toast " + (type||"");
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(), 300); }, 2600);
}

/* ---------- daily login ----------
   Reseta às 23h (loginDayStr, ver acima). Ao detectar um novo "dia de
   jogo", só avança a sequência e marca dailyLoginPending=true — quem
   realmente credita o prêmio é claimDailyLogin() (js/dailylogin.js),
   quando o jogador clica em "Resgatar" no popup. */
function checkDailyLogin(){
  const dayObj = loginDayInfo();
  const today = loginDayStr(dayObj);
  if(STATE.stats.lastLoginDate === today) return; // já processou esse dia de jogo

  const yObj = new Date(dayObj); yObj.setDate(yObj.getDate()-1);
  const yStr = loginDayStr(yObj);
  if(STATE.stats.lastLoginDate === yStr){ STATE.stats.loginStreak += 1; }
  else { STATE.stats.loginStreak = 1; }
  STATE.stats.lastLoginDate = today;
  STATE.stats.dailyLoginPending = true;

  updateMissionProgress("loginStreak", null, STATE.stats.loginStreak, true);
  persist();
}
