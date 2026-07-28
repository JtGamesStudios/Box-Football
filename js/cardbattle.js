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
   ========================================================= */

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

/* ---------- montagem das mãos ---------- */
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
  if(pool.length < 5 && window.GAME_DATA && GAME_DATA.players && GAME_DATA.players.length){
    const extra = [...GAME_DATA.players].sort((a,b)=>(b.overall||0)-(a.overall||0)).slice(0,20);
    for(const p of extra){
      if(pool.length >= 5) break;
      if(!pool.find(x=>x.id===p.id)) pool.push(p);
    }
  }
  return pool.slice(0,5);
}

function cbBuildAwayHand(){
  const all = (window.GAME_DATA && GAME_DATA.players) ? GAME_DATA.players : [];
  if(!all.length) return [];
  const sorted = [...all].sort((a,b)=>(b.overall||0)-(a.overall||0));
  // pega um "time" de força parecida com a do jogador: uma faixa
  // aleatória dentro do top 60 pra não ficar sempre o mesmo CPU
  const topSlice = sorted.slice(0, Math.min(60, sorted.length));
  const shuffled = topSlice.sort(()=>Math.random()-0.5);
  return shuffled.slice(0,5);
}

/* ---------- ciclo de vida da tela ---------- */
function initCardBattleScreen(){
  document.getElementById("cbIntro").classList.remove("hidden");
  document.getElementById("cbArena").classList.add("hidden");
  const startBtn = document.getElementById("cbStartBtn");
  if(startBtn) startBtn.onclick = cbStartBattle;
  const endBtn = document.getElementById("cbEndBtn");
  if(endBtn) endBtn.onclick = ()=> showScreen("home");
  const confirmBtn = document.getElementById("cbConfirmBtn");
  if(confirmBtn) confirmBtn.onclick = cbConfirmSelection;
}

function cbStartBattle(){
  CB.homeHand = cbBuildHomeHand();
  CB.awayHand = cbBuildAwayHand();

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
  CB.awayName = cbRandomRivalName();

  document.getElementById("cbIntro").classList.add("hidden");
  document.getElementById("cbArena").classList.remove("hidden");
  document.getElementById("cbHomeName").textContent = CB.homeName;
  document.getElementById("cbAwayName").textContent = CB.awayName;
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
    <div class="cb-hand-card" data-idx="${i}">
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
  document.getElementById("cbAwaySlot").innerHTML = `<div class="cb-slot-placeholder">?</div>`;
  document.getElementById("cbHomeSlot").innerHTML = `<div class="cb-slot-placeholder">Escolha</div>`;
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
  // CPU escolhe a melhor carta disponível na mão dele (com um pouco de folga)
  const awayAvailable = CB.awayHand.filter(p=>!p.__used);
  awayAvailable.sort((a,b)=>(b.overall||0)-(a.overall||0));
  const awayCard = awayAvailable[Math.floor(Math.random()*Math.min(2,awayAvailable.length))] || awayAvailable[0];
  awayCard.__used = true;

  CB.lastHomeCardIdx = CB.selectedIdx;

  // mostra as duas cartas nos slots
  document.getElementById("cbHomeSlot").innerHTML = renderPlayerCard(homeCard);
  document.getElementById("cbAwaySlot").innerHTML = renderPlayerCard(awayCard);

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

function cbFinishBattle(){
  CB.busy = true;
  let result, title, desc, reward = 0;
  if(CB.homeLife <= 0 && CB.awayLife <= 0){
    result = "draw"; title = "Empate!"; desc = "As duas vidas zeraram juntas. Duelo equilibrado!";
  } else if(CB.homeLife <= 0){
    result = "lose"; title = "Derrota"; desc = `${CB.awayName} levou a melhor dessa vez. Ajuste seu elenco e tente de novo.`;
  } else if(CB.awayLife <= 0 || CB.homeLife > CB.awayLife){
    result = "win"; title = "Vitória! 🏆"; desc = `Você venceu ${CB.awayName} e ganhou recompensas pela batalha.`;
    reward = 300;
  } else if(CB.homeLife === CB.awayLife){
    result = "draw"; title = "Empate!"; desc = "Ninguém levou a melhor nessa arena.";
  } else {
    result = "lose"; title = "Derrota"; desc = `${CB.awayName} terminou com mais vida. Tente de novo!`;
  }

  const banner = document.getElementById("cbResultBanner");
  banner.textContent = result === "win" ? "Vitória na rodada final!" : (result === "draw" ? "Empate na rodada final." : "Derrota na rodada final.");
  banner.className = "cb-result-banner " + result;

  if(reward > 0 && STATE && STATE.currency){
    STATE.currency.gp = (STATE.currency.gp||0) + reward;
    if(typeof persist === "function") persist();
    desc += ` (+${reward} GP)`;
  }

  setTimeout(()=>{
    document.getElementById("cbEndTitle").textContent = title;
    document.getElementById("cbEndDesc").textContent = desc;
    document.getElementById("cbEndOverlay").classList.remove("hidden");
  }, 500);
}
