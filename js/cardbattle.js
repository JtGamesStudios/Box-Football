/* =========================================================
   CARD BATTLE — duelo de cartas estilo "Top Stars: Football Match"
   Reaproveita: STATE.ownedPlayers / STATE.squads (elenco real do
   jogador) e GAME_DATA.players (pool pro time do CPU), e a mesma
   função renderPlayerCard() já usada nas Boxes (js/boxes.js) pra
   manter a cara visual das cartas idêntica ao resto do app.

   Regras do duelo:
   - Cada lado entra com uma "mão" de 5 cartas.
   - A cada rodada, você escolhe 1 carta; o CPU escolhe 1 carta dele.
   - "Poder" da carta = overall + vantagem de posição (ATA > DEF >
     MEI > ATA, tipo pedra-papel-tesoura) + variação aleatória pequena.
   - Quem tem mais poder na rodada tira vida do outro lado.
   - Jogar 2+ cartas seguidas do mesmo clube/seleção ativa COMBO
     (dano x1.4 naquela rodada).
   - Acaba quando a vida de um lado chega a 0, ou quando as mãos
     acabam (5 rodadas) — nesse caso quem tiver mais vida vence.

   MODO NÍVEIS
   - CB_OPPONENTS define uma sequência de adversários com força e
     estilo crescentes. O jogador destrava o próximo só vencendo o
     atual. Progresso fica em STATE.cardBattle (js/state.js) e é
     salvo com persist(), igual ao resto do save.
   ========================================================= */

/* ---------- controle de acesso (beta fechado) ----------
   Enquanto o Card Battle estiver em teste, só os IDs listados aqui
   conseguem ver/jogar. O ID de cada um aparece na tela de splash
   ("Seu ID: XXXX-XXXX") e em Configurações, com botão "Copiar".
   Pra liberar pra mais gente, só adicionar o ID na lista abaixo —
   não precisa mexer em mais nada. Lista vazia ([]) = liberado geral.

   CARD_BATTLE_RELEASE_AT: data/hora (ISO) em que o modo libera
   AUTOMATICAMENTE pra todo mundo, sem precisar tirar ninguém da
   whitelist nem dar reload na página (o watcher em main.js
   rechecka isso periodicamente). Deixe `null` pra não agendar nada
   e depender só da whitelist. */
const CARD_BATTLE_ACCESS_WHITELIST = [
  "PQXU-Z8W7",
  "ME7X-SK8M",
];
const CARD_BATTLE_RELEASE_AT = "2026-08-02T23:00:00";

function isCardBattleReleased(){
  if(!CARD_BATTLE_RELEASE_AT) return false;
  return Date.now() >= new Date(CARD_BATTLE_RELEASE_AT).getTime();
}

function hasCardBattleAccess(){
  if(isCardBattleReleased()) return true;
  if(!CARD_BATTLE_ACCESS_WHITELIST.length) return true;
  return typeof getPlayerId === "function" && CARD_BATTLE_ACCESS_WHITELIST.includes(getPlayerId());
}

/* ---------- adversários do modo Níveis ----------
   minOvr/maxOvr = faixa de overall usada pra montar a mão do CPU.
   aggro = 0 a 1, quanto maior mais frequentemente o CPU joga a
   MELHOR carta da mão (em vez de uma das melhores no acaso).
   boss = true dá um visual e recompensa diferenciados. */
const CB_OPPONENTS = [
  { id:1, name:"Vila Nova FC",     emoji:"🌱", tier:"Fácil",   minOvr:52, maxOvr:66, aggro:.15, reward:150 },
  { id:2, name:"União Atlética",   emoji:"🛡️", tier:"Fácil",   minOvr:56, maxOvr:70, aggro:.25, reward:200 },
  { id:3, name:"Estrela Azul",     emoji:"⚡", tier:"Médio",   minOvr:60, maxOvr:74, aggro:.35, reward:260 },
  { id:4, name:"Trovão SC",        emoji:"🌩️", tier:"Médio",   minOvr:64, maxOvr:78, aggro:.45, reward:320 },
  { id:5, name:"Norte United",     emoji:"❄️", tier:"Médio",   minOvr:68, maxOvr:81, aggro:.55, reward:390 },
  { id:6, name:"Fênix EC",         emoji:"🔥", tier:"Difícil", minOvr:72, maxOvr:85, aggro:.65, reward:470 },
  { id:7, name:"Aliança FC",       emoji:"🦅", tier:"Difícil", minOvr:76, maxOvr:88, aggro:.75, reward:560 },
  { id:8, name:"Vitória CF",       emoji:"👑", tier:"BOSS",    minOvr:80, maxOvr:99, aggro:.9,  reward:750, boss:true },
];

function cbProgress(){
  if(!STATE.cardBattle) STATE.cardBattle = { unlockedLevel:1, stars:{} };
  if(!STATE.cardBattle.stars) STATE.cardBattle.stars = {};
  return STATE.cardBattle;
}

const CB = {
  homeHand: [],
  awayHand: [],
  homeLife: 100,
  awayLife: 100,
  round: 1,
  maxRounds: 5,
  selectedIdx: null,
  lastHomeCard: null,
  lastAwayCard: null,
  homeStreak: 0,   // rodadas seguidas jogando cartas "compatíveis" (clube/seleção)
  awayStreak: 0,
  busy: false,     // trava input durante animação
  homeName: "Meu Time",
  awayName: "CPU",
  opponent: null,  // item de CB_OPPONENTS em uso na partida atual
};

const CB_POS_GROUP = {
  GK:"DEF", CB:"DEF", LB:"DEF", RB:"DEF", DF:"DEF",
  DMF:"MEI", CMF:"MEI", AMF:"MEI", LMF:"MEI", RMF:"MEI", MF:"MEI",
  LWF:"ATA", RWF:"ATA", CF:"ATA", SS:"ATA", ST:"ATA", FW:"ATA",
};
function cbPosGroup(pos){ return CB_POS_GROUP[(pos||"").toUpperCase()] || "MEI"; }

/* ATA bate DEF, DEF bate MEI, MEI bate ATA — pequeno bônus de poder */
function cbTriangleBonus(myGroup, oppGroup){
  const beats = { ATA:"DEF", DEF:"MEI", MEI:"ATA" };
  if(beats[myGroup] === oppGroup) return 6;
  if(beats[oppGroup] === myGroup) return -6;
  return 0;
}

/* ---------- montagem das mãos ----------
   IMPORTANTE: cbConfirmSelection marca `card.__used = true` direto no
   objeto da carta pra travar ela na mão depois de jogada. Só que os
   objetos que chegavam aqui (STATE.ownedPlayers e GAME_DATA.players)
   eram passados por REFERÊNCIA — ou seja, esse "__used" ficava colado
   pra sempre no jogador real, e como esses objetos são compartilhados
   entre partidas (e até salvos no localStorage via persist()), na
   partida seguinte aquele mesmo jogador já nascia "usado" e a carta
   dele ficava impossível de jogar (esse era o bug de "não dá pra
   colocar mais cartas"). A correção é sempre clonar a carta antes de
   colocar na mão, pra `__used` viver só naquela partida. */
function cbCloneCard(p){ return Object.assign({}, p, { __used:false }); }

function cbBuildHomeHand(){
  let pool = [];
  const squad = (typeof getActiveSquad === "function") ? getActiveSquad() : (STATE.squads || []).find(s=>s.id===STATE.activeSquadId);
  if(squad && squad.assignments){
    const ids = Object.values(squad.assignments).filter(Boolean);
    pool = ids.map(id => STATE.ownedPlayers.find(p=>p.id===id)).filter(Boolean);
  }
  if(pool.length < 5 && STATE.ownedPlayers && STATE.ownedPlayers.length){
    const extra = [...STATE.ownedPlayers].sort((a,b)=>(b.overall||0)-(a.overall||0));
    for(const p of extra){
      if(pool.length >= 5) break;
      if(!pool.find(x=>x.id===p.id)) pool.push(p);
    }
  }
  // fallback total: ninguém tem elenco ainda — usa jogadores base do jogo
  if(pool.length < 5 && typeof GAME_DATA !== 'undefined' && GAME_DATA.players && GAME_DATA.players.length){
    const extra = [...GAME_DATA.players].sort((a,b)=>(b.overall||0)-(a.overall||0)).slice(0,20);
    for(const p of extra){
      if(pool.length >= 5) break;
      if(!pool.find(x=>x.id===p.id)) pool.push(p);
    }
  }
  return pool.slice(0,5).map(cbCloneCard);
}

/* Monta a mão do CPU dentro da faixa de overall do adversário
   escolhido no modo Níveis. Se a faixa não tiver jogadores
   suficientes, vai alargando a busca aos poucos até fechar 5. */
function cbBuildAwayHand(opponent){
  const all = (typeof GAME_DATA !== 'undefined' && GAME_DATA.players) ? GAME_DATA.players : [];
  if(!all.length) return [];

  let min = opponent ? opponent.minOvr : 0;
  let max = opponent ? opponent.maxOvr : 999;
  let picked = [];
  let guard = 0;
  while(picked.length < 5 && guard < 12){
    const range = all.filter(p => (p.overall||0) >= min && (p.overall||0) <= max);
    const shuffled = [...range].sort(()=>Math.random()-0.5);
    for(const p of shuffled){
      if(picked.length >= 5) break;
      if(!picked.find(x=>x.id===p.id)) picked.push(p);
    }
    min -= 4; max += 4; // alarga a faixa se faltou gente
    guard++;
  }
  return picked.slice(0,5).map(cbCloneCard);
}

/* ---------- ciclo de vida da tela ---------- */
function initCardBattleScreen(){
  if(!hasCardBattleAccess()){
    document.getElementById("cbIntro").classList.remove("hidden");
    document.getElementById("cbLevels").classList.add("hidden");
    document.getElementById("cbArena").classList.add("hidden");
    document.getElementById("cbIntro").dataset.locked = "1";
    document.getElementById("cbIntro").innerHTML = `
      <div class="cb-intro-badge">🔒 EM BREVE</div>
      <h1 class="cb-intro-title">Card Battle</h1>
      <p class="cb-intro-sub">Esse modo está em teste fechado no momento. Em breve libera pra todo mundo!</p>`;
    return;
  }
  delete document.getElementById("cbIntro").dataset.locked;
  document.getElementById("cbIntro").classList.remove("hidden");
  document.getElementById("cbLevels").classList.add("hidden");
  document.getElementById("cbArena").classList.add("hidden");
  const startBtn = document.getElementById("cbStartBtn");
  if(startBtn) startBtn.onclick = cbShowLevels;
  const backBtn = document.getElementById("cbLevelsBackBtn");
  if(backBtn) backBtn.onclick = ()=>{
    document.getElementById("cbLevels").classList.add("hidden");
    document.getElementById("cbIntro").classList.remove("hidden");
  };
  const endBtn = document.getElementById("cbEndBtn");
  if(endBtn) endBtn.onclick = ()=> showScreen("home");
  const nextBtn = document.getElementById("cbNextLevelBtn");
  if(nextBtn) nextBtn.onclick = cbGoNextLevel;
  const retryBtn = document.getElementById("cbRetryBtn");
  if(retryBtn) retryBtn.onclick = ()=>{
    document.getElementById("cbEndOverlay").classList.add("hidden");
    cbStartBattle(CB.opponent);
  };
  const levelsBtn = document.getElementById("cbBackToLevelsBtn");
  if(levelsBtn) levelsBtn.onclick = ()=>{
    document.getElementById("cbEndOverlay").classList.add("hidden");
    document.getElementById("cbArena").classList.add("hidden");
    cbShowLevels();
  };
  const confirmBtn = document.getElementById("cbConfirmBtn");
  if(confirmBtn) confirmBtn.onclick = cbConfirmSelection;
}

/* ---------- tela de seleção de nível ---------- */
function cbShowLevels(){
  document.getElementById("cbIntro").classList.add("hidden");
  document.getElementById("cbArena").classList.add("hidden");
  document.getElementById("cbLevels").classList.remove("hidden");
  cbRenderLevels();
}

function cbRenderLevels(){
  const prog = cbProgress();
  const grid = document.getElementById("cbLevelsGrid");
  grid.innerHTML = CB_OPPONENTS.map((op, i)=>{
    const levelNum = i + 1;
    const unlocked = levelNum <= prog.unlockedLevel;
    const stars = prog.stars[op.id] || 0;
    const starsHtml = `<div class="cb-lv-stars">${[1,2,3].map(n=>`<span class="${n<=stars?'on':''}">★</span>`).join("")}</div>`;
    return `
      <button class="cb-lv-card ${unlocked?'':'locked'} ${op.boss?'boss':''}" data-level="${levelNum}" ${unlocked?'':'disabled'}>
        <div class="cb-lv-emoji">${unlocked ? op.emoji : '🔒'}</div>
        <div class="cb-lv-name">${unlocked ? op.name : '???'}</div>
        <div class="cb-lv-tier">${unlocked ? op.tier : 'Bloqueado'}</div>
        ${unlocked ? starsHtml : ''}
      </button>`;
  }).join("");
  grid.querySelectorAll(".cb-lv-card:not(.locked)").forEach(el=>{
    el.onclick = ()=>{
      const lvl = parseInt(el.dataset.level, 10);
      const opponent = CB_OPPONENTS[lvl-1];
      document.getElementById("cbLevels").classList.add("hidden");
      cbStartBattle(opponent);
    };
  });
}

function cbGoNextLevel(){
  const idx = CB_OPPONENTS.findIndex(o=>o.id === CB.opponent.id);
  const next = CB_OPPONENTS[idx+1];
  document.getElementById("cbEndOverlay").classList.add("hidden");
  if(next){
    cbStartBattle(next);
  } else {
    document.getElementById("cbArena").classList.add("hidden");
    cbShowLevels();
  }
}

function cbStartBattle(opponent){
  CB.opponent = opponent;
  CB.homeHand = cbBuildHomeHand();
  CB.awayHand = cbBuildAwayHand(opponent);

  if(!CB.homeHand.length || !CB.awayHand.length){
    toast("Não foi possível montar as cartas do duelo. Contrate jogadores primeiro!", "");
    return;
  }

  CB.homeLife = 100; CB.awayLife = 100;
  CB.round = 1; CB.maxRounds = Math.min(CB.homeHand.length, CB.awayHand.length);
  CB.selectedIdx = null; CB.lastHomeCard = null; CB.lastAwayCard = null;
  CB.homeStreak = 0; CB.awayStreak = 0; CB.busy = false;

  const squad = (typeof getActiveSquad === "function") ? getActiveSquad() : null;
  CB.homeName = (squad && squad.name) ? squad.name : "Meu Time";
  CB.awayName = opponent ? `${opponent.emoji} ${opponent.name}` : cbRandomRivalName();

  document.getElementById("cbIntro").classList.add("hidden");
  document.getElementById("cbLevels").classList.add("hidden");
  document.getElementById("cbArena").classList.remove("hidden");
  document.getElementById("cbArena").classList.toggle("boss-arena", !!(opponent && opponent.boss));
  document.getElementById("cbHomeName").textContent = CB.homeName;
  document.getElementById("cbAwayName").textContent = CB.awayName;
  const lvlTag = document.getElementById("cbLevelTag");
  if(lvlTag){
    const idx = opponent ? CB_OPPONENTS.findIndex(o=>o.id===opponent.id) : -1;
    lvlTag.textContent = opponent ? `Nível ${idx+1}${opponent.boss ? " · BOSS" : ""}` : "";
    lvlTag.classList.toggle("hidden", !opponent);
  }
  document.getElementById("cbEndOverlay").classList.add("hidden");
  document.getElementById("cbResultBanner").classList.add("hidden");
  document.getElementById("cbLog").innerHTML = "";

  cbUpdateLifeBars(true);
  cbRenderHand();
  cbResetSlots();
  cbUpdateRoundTag();
}

function cbRandomRivalName(){
  const names = ["Rival FC","União Atlética","Estrela Azul","Fênix EC","Trovão SC","Norte United","Vitória CF","Aliança FC"];
  return names[Math.floor(Math.random()*names.length)];
}

/* ---------- render da mão ---------- */
function cbRenderHand(){
  const wrap = document.getElementById("cbHand");
  wrap.innerHTML = CB.homeHand.map((p,i)=>`
    <div class="cb-hand-card" data-idx="${i}" style="animation-delay:${i*45}ms">
      ${renderPlayerCard(p)}
    </div>`).join("");
  wrap.querySelectorAll(".cb-hand-card").forEach(el=>{
    el.onclick = ()=> cbSelectCard(parseInt(el.dataset.idx,10));
  });
}

function cbSelectCard(idx){
  if(CB.busy) return;
  const card = CB.homeHand[idx];
  if(!card || card.__used) return;
  CB.selectedIdx = idx;
  document.querySelectorAll(".cb-hand-card").forEach(el=>{
    el.classList.toggle("selected", parseInt(el.dataset.idx,10) === idx);
  });
  document.getElementById("cbConfirmBtn").disabled = false;
}

function cbResetSlots(){
  document.getElementById("cbAwaySlot").innerHTML = `<div class="cb-slot-placeholder"><span>Aguardando</span></div>`;
  document.getElementById("cbHomeSlot").innerHTML = `<div class="cb-slot-placeholder"><span>Escolha</span></div>`;
  document.getElementById("cbAwaySlot").className = "cb-slot cb-slot-away";
  document.getElementById("cbHomeSlot").className = "cb-slot cb-slot-home";
  document.getElementById("cbClash").classList.remove("pop");
}

function cbUpdateRoundTag(){
  document.getElementById("cbRoundTag").textContent = `Rodada ${CB.round} de ${CB.maxRounds}`;
}

function cbUpdateLifeBars(instant){
  const hf = document.getElementById("cbHomeLifeFill");
  const af = document.getElementById("cbAwayLifeFill");
  const hn = document.getElementById("cbHomeLifeNum");
  const an = document.getElementById("cbAwayLifeNum");
  const apply = ()=>{
    hf.style.width = Math.max(0,CB.homeLife) + "%";
    af.style.width = Math.max(0,CB.awayLife) + "%";
    hn.textContent = Math.max(0,Math.round(CB.homeLife));
    an.textContent = Math.max(0,Math.round(CB.awayLife));
    hf.classList.toggle("low", CB.homeLife <= 30);
    af.classList.toggle("low", CB.awayLife <= 30);
  };
  if(instant){
    hf.style.transition = "none"; af.style.transition = "none";
    apply();
    requestAnimationFrame(()=>{ hf.style.transition = ""; af.style.transition = ""; });
  } else apply();
}

/* ---------- resolução da rodada ---------- */
function cbConfirmSelection(){
  if(CB.busy || CB.selectedIdx == null) return;
  CB.busy = true;
  document.getElementById("cbConfirmBtn").disabled = true;

  const homeCard = CB.homeHand[CB.selectedIdx];
  homeCard.__used = true;
  // CPU escolhe a carta com base no "aggro" do adversário: quanto
  // maior, mais chance de vir logo a melhor carta disponível em vez
  // de uma das melhores no acaso — deixa os níveis avançados mais
  // espertos e os iniciais mais imprevisíveis.
  let awayAvailable = CB.awayHand.filter(p=>!p.__used);
  // Rede de segurança: se por qualquer motivo a mão do CPU esvaziar antes
  // da sua (ex: rodadas ficaram fora de sincronia), reabre a mão dele em
  // vez de travar o jogo — antes isso quebrava com "awayCard undefined" e
  // ninguém mais conseguia jogar carta nenhuma pelo resto da partida.
  if(!awayAvailable.length){
    CB.awayHand.forEach(p=> p.__used = false);
    awayAvailable = CB.awayHand.slice();
  }
  awayAvailable.sort((a,b)=>(b.overall||0)-(a.overall||0));
  const aggro = (CB.opponent && CB.opponent.aggro != null) ? CB.opponent.aggro : .3;
  const pickPoolSize = Math.random() < aggro ? 1 : Math.min(3, awayAvailable.length);
  const awayCard = awayAvailable[Math.floor(Math.random()*pickPoolSize)] || awayAvailable[0];
  awayCard.__used = true;

  CB.lastHomeCardIdx = CB.selectedIdx;

  // mostra as duas cartas nos slots com animação de "virada"
  document.getElementById("cbHomeSlot").innerHTML = renderPlayerCard(homeCard);
  document.getElementById("cbAwaySlot").innerHTML = renderPlayerCard(awayCard);
  document.getElementById("cbHomeSlot").classList.add("deal");
  document.getElementById("cbAwaySlot").classList.add("deal");

  document.querySelectorAll(".cb-hand-card").forEach(el=>{
    if(parseInt(el.dataset.idx,10) === CB.selectedIdx) el.classList.add("used");
  });

  setTimeout(()=> cbResolveClash(homeCard, awayCard), 450);
}

function cbResolveClash(homeCard, awayCard){
  document.getElementById("cbClash").classList.add("pop");
  document.getElementById("cbDuelStage").querySelectorAll(".cb-slot").forEach(s=>s.classList.add("shake"));

  const homeGroup = cbPosGroup(homeCard.position);
  const awayGroup = cbPosGroup(awayCard.position);

  let homePower = (homeCard.overall||70) + cbTriangleBonus(homeGroup, awayGroup) + (Math.random()*10-5);
  let awayPower = (awayCard.overall||70) + cbTriangleBonus(awayGroup, homeGroup) + (Math.random()*10-5);

  document.getElementById("cbHomeSlot").insertAdjacentHTML("beforeend", `<div class="p-power-tag">⚡ ${Math.round(homePower)}</div>`);
  document.getElementById("cbAwaySlot").insertAdjacentHTML("beforeend", `<div class="p-power-tag">⚡ ${Math.round(awayPower)}</div>`);

  // combo: mesma seleção ou clube do lance anterior daquele lado
  const homeCombo = CB.lastHomeCard && (CB.lastHomeCard.club === homeCard.club || CB.lastHomeCard.nationality === homeCard.nationality);
  const awayCombo = CB.lastAwayCard && (CB.lastAwayCard.club === awayCard.club || CB.lastAwayCard.nationality === awayCard.nationality);

  let comboSide = null;
  if(homeCombo) comboSide = "home";
  else if(awayCombo) comboSide = "away";

  CB.lastHomeCard = homeCard; CB.lastAwayCard = awayCard;

  let diff = homePower - awayPower;
  let dmg = Math.max(8, Math.min(30, 12 + Math.abs(diff)*0.6));
  let logMsg = "";

  setTimeout(()=>{
    document.getElementById("cbDuelStage").querySelectorAll(".cb-slot").forEach(s=>s.classList.remove("shake"));

    if(Math.abs(diff) < 1.5){
      // empate técnico: os dois levam dano leve
      CB.homeLife -= 6; CB.awayLife -= 6;
      logMsg = `Empate na rodada ${CB.round}: ${homeCard.name} x ${awayCard.name}.`;
    } else if(diff > 0){
      if(comboSide === "home") dmg *= 1.4;
      CB.awayLife -= dmg;
      document.getElementById("cbHomeSlot").classList.add("winner");
      document.getElementById("cbAwaySlot").classList.add("loser");
      logMsg = `${homeCard.name} venceu o duelo contra ${awayCard.name} (-${Math.round(dmg)} de vida do rival).`;
    } else {
      if(comboSide === "away") dmg *= 1.4;
      CB.homeLife -= dmg;
      document.getElementById("cbAwaySlot").classList.add("winner");
      document.getElementById("cbHomeSlot").classList.add("loser");
      logMsg = `${awayCard.name} venceu o duelo contra ${homeCard.name} (-${Math.round(dmg)} de vida sua).`;
    }

    if(comboSide){
      const popup = document.getElementById("cbComboPopup");
      popup.classList.remove("show"); void popup.offsetWidth;
      popup.classList.remove("hidden"); popup.classList.add("show");
    }

    cbAppendLog(logMsg);
    cbUpdateLifeBars(false);

    setTimeout(()=> cbEndOfRound(), 900);
  }, 380);
}

function cbAppendLog(msg){
  const log = document.getElementById("cbLog");
  const div = document.createElement("div");
  div.textContent = msg;
  log.appendChild(div);
  while(log.children.length > 3) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function cbEndOfRound(){
  if(CB.homeLife <= 0 || CB.awayLife <= 0 || CB.round >= CB.maxRounds){
    cbFinishBattle();
    return;
  }
  CB.round += 1;
  CB.selectedIdx = null;
  CB.busy = false;
  cbUpdateRoundTag();
  cbResetSlots();
  document.getElementById("cbComboPopup").classList.remove("show");
  document.getElementById("cbConfirmBtn").disabled = true;
}

/* 3 estrelas = venceu com >65% de vida sobrando, 2 = >30%, 1 = venceu raspando */
function cbStarsForResult(){
  if(CB.homeLife <= 0) return 0;
  const pct = CB.homeLife / 100;
  if(pct > .65) return 3;
  if(pct > .30) return 2;
  return 1;
}

function cbFinishBattle(){
  CB.busy = true;
  let result, title, desc, reward = 0, won = false;
  const opponent = CB.opponent;

  if(CB.homeLife <= 0 && CB.awayLife <= 0){
    result = "draw"; title = "Empate!"; desc = "As duas vidas zeraram juntas. Duelo equilibrado!";
  } else if(CB.homeLife <= 0){
    result = "lose"; title = "Derrota"; desc = `${CB.awayName} levou a melhor dessa vez. Ajuste seu elenco e tente de novo.`;
  } else if(CB.awayLife <= 0 || CB.homeLife > CB.awayLife){
    won = true;
    result = "win"; title = opponent && opponent.boss ? "BOSS DERROTADO! 👑" : "Vitória! 🏆";
    reward = opponent ? opponent.reward : 300;
    desc = `Você venceu ${CB.awayName} e ganhou recompensas pela batalha.`;
  } else if(CB.homeLife === CB.awayLife){
    result = "draw"; title = "Empate!"; desc = "Ninguém levou a melhor nessa arena.";
  } else {
    result = "lose"; title = "Derrota"; desc = `${CB.awayName} terminou com mais vida. Tente de novo!`;
  }

  const banner = document.getElementById("cbResultBanner");
  banner.textContent = result === "win" ? "Vitória na rodada final!" : (result === "draw" ? "Empate na rodada final." : "Derrota na rodada final.");
  banner.className = "cb-result-banner " + result;

  let starsEarned = 0;
  let unlockedNext = false;
  if(won && opponent){
    starsEarned = cbStarsForResult();
    const prog = cbProgress();
    const prevStars = prog.stars[opponent.id] || 0;
    if(starsEarned > prevStars) prog.stars[opponent.id] = starsEarned;
    const idx = CB_OPPONENTS.findIndex(o=>o.id===opponent.id);
    if(idx + 2 > prog.unlockedLevel && idx + 1 < CB_OPPONENTS.length){
      prog.unlockedLevel = idx + 2;
      unlockedNext = true;
    }
  }

  if(reward > 0 && STATE && STATE.currency){
    STATE.currency.gp = (STATE.currency.gp||0) + reward;
    desc += ` (+${reward} GP)`;
  }
  if(typeof persist === "function") persist();

  setTimeout(()=>{
    document.getElementById("cbEndTitle").textContent = title;
    document.getElementById("cbEndDesc").textContent = desc;

    const starsWrap = document.getElementById("cbEndStars");
    if(starsWrap){
      starsWrap.classList.toggle("hidden", !won);
      starsWrap.innerHTML = [1,2,3].map(n=>`<span class="${n<=starsEarned?'on':''}">★</span>`).join("");
    }
    const nextBtn = document.getElementById("cbNextLevelBtn");
    if(nextBtn){
      const hasNext = opponent && (CB_OPPONENTS.findIndex(o=>o.id===opponent.id) + 1) < CB_OPPONENTS.length;
      nextBtn.classList.toggle("hidden", !(won && hasNext));
      nextBtn.textContent = unlockedNext ? "Próximo nível 🔓 ›" : "Próximo nível ›";
    }
    const retryBtn = document.getElementById("cbRetryBtn");
    if(retryBtn) retryBtn.classList.toggle("hidden", !opponent);
    const levelsBtn = document.getElementById("cbBackToLevelsBtn");
    if(levelsBtn) levelsBtn.classList.toggle("hidden", !opponent);

    document.getElementById("cbEndOverlay").classList.remove("hidden");
    document.getElementById("cbEndOverlay").classList.toggle("win-fx", won);
  }, 500);
}
