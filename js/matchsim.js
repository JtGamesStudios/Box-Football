/* =========================================================
   MATCH ENGINE — motor de simulação de partida (QTE), compartilhado
   entre Campanha, Modo de Evento, Jogo c/ Amigo etc.

   Filosofia (v2): o resultado deve depender principalmente da SUA
   habilidade no toque/timing, não do overall do time. Força/OVR
   entram só como pequenos modificadores (poucos pontos percentuais),
   nunca como fator dominante:
     - Passe e drible: mini-QTE de timing (acerta a janela ou perde a bola)
     - Finalização: primeiro você MIRA (grade de 6 zonas do gol),
       depois acerta o TIMING — cantos valem mais mas têm janela menor
     - Defesa: quando o adversário ataca, você tem uma janela curta
       pra "desarmar" (reflexo), reduzindo a chance de gol dele

   Qualquer tela que quiser "jogar uma partida" só precisa chamar:

     startMatch({
       competitionLabel,                    // ex: "Campanha — Divisão 1"
       title, homeTeamName, awayTeamName,
       homeLineup, awayLineup,              // [{number,name,pos,id?,ovr?}, ...]
       playerStrength, opponentStrength,    // 0-100
       totalChances,                        // nº de lances da partida
       weather,                             // opcional: "chuva" (afeta eventos raros)
       winCondition(score) => {result:"win"|"draw"|"loss"},  // opcional
       onComplete(result)                   // decide o que fazer com o resultado
     });

   winCondition default = mais gols vence. Um evento pode sobrescrever,
   ex: "marque 10 gols", "não sofra gol", "vença de virada" etc.

   result passado pro onComplete inclui, além de homeGoals/awayGoals/result:
     usedHomeIds   -> ids (cfg.homeLineup[i].id) que entraram em campo
     cardEvents    -> [{ playerId, playerName }]  (cartão amarelo)
     injuryEvents  -> [{ playerId, playerName }]  (lesão leve)
   Isso permite que a tela chamadora (ex: campaign.js) aplique fadiga,
   cartões acumulados e lesões nos jogadores do elenco entre partidas.
   ========================================================= */

const MATCH_DEFAULTS = {
  competitionLabel: "Partida Amistosa",
  title: "Partida Amistosa",
  homeTeamName: "Meu Clube",
  awayTeamName: "CPU",
  homeLineup: null,
  awayLineup: null,
  playerStrength: 70,
  opponentStrength: 70,
  totalChances: 8,
  weather: null,
  winCondition: null,
  onComplete: null,
  // ---- Modo online (PvP c/ amigo, ver js/online.js) ----
  online: false,             // true = lances "away" não são resolvidos por RNG, e sim por um adversário real
  turnQueue: null,           // se informado, sobrescreve o sorteio normal (usado pra sincronizar os 2 lados)
  onLocalChance: null,       // (chanceIndex, {isGoal, message}) => void  — chamado toda vez que UM LANCE NOSSO é resolvido, pra sincronizar
  onWaitRemoteChance: null,  // (chanceIndex, callback) => void — callback deve ser chamado com {isGoal, message} quando o lance do amigo chegar
};

let _match = null;

function startMatch(userConfig){
  const cfg = Object.assign({}, MATCH_DEFAULTS, userConfig || {});
  // Se ninguém definiu o clima, uma pequena chance de chuva — só pra
  // dar tempero aos eventos raros (escorregões etc.)
  if(cfg.weather == null) cfg.weather = (Math.random() < 0.12) ? "chuva" : null;

  _match = {
    cfg,
    chanceIndex: 0,
    homeGoals: 0,
    awayGoals: 0,
    turnQueue: cfg.turnQueue || buildTurnQueue(cfg),
    momentum: { home: 0, away: 0 },
    usedHomeIds: new Set(),
    cardEvents: [],
    injuryEvents: [],
    pendingResult: null,
  };
  showPreMatchLineup(cfg);
}

/* ---------- Tela de pré-jogo: banner + escalação de cada lado ---------- */
function placeholderLineup(){
  return Array.from({length:11}, (_,i)=>({ number:i+1, name:`Jogador ${i+1}`, pos:"-" }));
}

function renderLineupList(containerId, lineup){
  const wrap = document.getElementById(containerId);
  if(!wrap) return;
  wrap.innerHTML = lineup.map(p=>`
    <div class="prematch-row">
      <span class="prematch-num">${p.number}</span>
      <span class="prematch-name">${p.name}</span>
      <span class="prematch-pos">${p.pos || ""}</span>
    </div>`).join("");
}

function ensureLineupOverlay(){
  if(document.getElementById("prematchOverlay")) return;
  const div = document.createElement("div");
  div.className = "prematch-overlay hidden";
  div.id = "prematchOverlay";
  div.innerHTML = `
    <div class="prematch-inner">
      <div class="prematch-comp-banner" id="prematchCompLabel">Partida</div>
      <div class="prematch-vs-row">
        <div class="prematch-team-name home" id="prematchHomeName">Meu Clube</div>
        <div class="prematch-vs-badge">VS</div>
        <div class="prematch-team-name away" id="prematchAwayName">CPU</div>
      </div>
      <div class="prematch-lineups">
        <div class="prematch-lineup-list" id="prematchHomeList"></div>
        <div class="prematch-lineup-list away" id="prematchAwayList"></div>
      </div>
      <button class="btn btn-primary prematch-continue-btn" id="prematchContinueBtn">Entrar em campo ›</button>
    </div>`;
  document.body.appendChild(div);
}

function showPreMatchLineup(cfg){
  ensureLineupOverlay();
  document.getElementById("prematchCompLabel").textContent = cfg.competitionLabel;
  document.getElementById("prematchHomeName").textContent = cfg.homeTeamName;
  document.getElementById("prematchAwayName").textContent = cfg.awayTeamName;
  renderLineupList("prematchHomeList", cfg.homeLineup || placeholderLineup());
  renderLineupList("prematchAwayList", cfg.awayLineup || placeholderLineup());
  document.getElementById("prematchOverlay").classList.remove("hidden");
  document.getElementById("prematchContinueBtn").onclick = ()=>{
    document.getElementById("prematchOverlay").classList.add("hidden");
    beginMatchEngine();
  };
}

function beginMatchEngine(){
  ensureMatchOverlay();
  renderMatchHeader();
  document.getElementById("matchsimOverlay").classList.remove("hidden");
  nextChance();
}

/* Sorteia de quem é cada lance, ponderado pela força relativa dos times */
function buildTurnQueue(cfg){
  const total = cfg.totalChances;
  const pStr = Math.max(1, cfg.playerStrength);
  const oStr = Math.max(1, cfg.opponentStrength);
  const pShare = pStr / (pStr + oStr);
  const queue = [];
  for(let i=0;i<total;i++){
    queue.push(Math.random() < pShare ? "home" : "away");
  }
  return queue;
}

function ensureMatchOverlay(){
  if(document.getElementById("matchsimOverlay")) return;
  const div = document.createElement("div");
  div.className = "matchsim-overlay hidden";
  div.id = "matchsimOverlay";
  div.innerHTML = `
    <div class="matchsim-inner">
      <div class="matchsim-scoreboard">
        <div class="matchsim-team home">
          <span class="matchsim-team-name" id="matchsimHomeName">Meu Clube</span>
          <span class="matchsim-goals" id="matchsimHomeGoals">0</span>
        </div>
        <div class="matchsim-mid">
          <span class="matchsim-title" id="matchsimTitle">Partida</span>
          <span class="matchsim-progress" id="matchsimProgress">Lance 1/8</span>
          <span class="matchsim-minute" id="matchsimMinute">8'</span>
        </div>
        <div class="matchsim-team away">
          <span class="matchsim-goals" id="matchsimAwayGoals">0</span>
          <span class="matchsim-team-name" id="matchsimAwayName">CPU</span>
        </div>
      </div>

      <div class="matchsim-stage" id="matchsimStage">
        <div class="matchsim-hint" id="matchsimHint">Preparando lance...</div>
        <div class="matchsim-commentary" id="matchsimCommentary"></div>

        <div class="matchsim-decision hidden" id="matchsimDecision">
          <button class="btn btn-ghost decision-btn" data-choice="chutar">Chutar</button>
          <button class="btn btn-ghost decision-btn" data-choice="passar">Passar</button>
          <button class="btn btn-ghost decision-btn" data-choice="driblar">Driblar</button>
        </div>

        <div class="goal-grid hidden" id="goalGrid">
          <button class="goal-zone tl" data-zone="TL"><span>↖</span></button>
          <button class="goal-zone tc" data-zone="TC"><span>↑</span></button>
          <button class="goal-zone tr" data-zone="TR"><span>↗</span></button>
          <button class="goal-zone bl" data-zone="BL"><span>↙</span></button>
          <button class="goal-zone bc" data-zone="BC"><span>↓</span></button>
          <button class="goal-zone br" data-zone="BR"><span>↘</span></button>
        </div>

        <div class="qte-track" id="qteTrack">
          <div class="qte-zone" id="qteZone"></div>
          <div class="qte-pointer" id="qtePointer"></div>
        </div>
        <button class="btn btn-primary qte-btn" id="qteBtn">Finalizar!</button>
      </div>

      <div class="matchsim-result hidden" id="matchsimResultWrap">
        <div class="matchsim-result-title" id="matchsimResultTitle">Vitória!</div>
        <div class="matchsim-result-score" id="matchsimResultScore">2 - 1</div>
        <button class="btn btn-primary" id="matchsimCloseBtn">Continuar</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  document.getElementById("matchsimCloseBtn").onclick = closeMatch;
}

function renderMatchHeader(){
  const { cfg } = _match;
  document.getElementById("matchsimHomeName").textContent = cfg.homeTeamName;
  document.getElementById("matchsimAwayName").textContent = cfg.awayTeamName;
  document.getElementById("matchsimTitle").textContent = cfg.title;
  document.getElementById("matchsimHomeGoals").textContent = "0";
  document.getElementById("matchsimAwayGoals").textContent = "0";
  document.getElementById("matchsimResultWrap").classList.add("hidden");
  document.getElementById("matchsimStage").classList.remove("hidden");
}

/* ---------- Contexto da partida: minuto + comentário ambiente ---------- */
function minuteLabelForIndex(i, total){
  const pct = (i + 0.5) / total;
  if(pct >= 0.98) return `90+${Math.max(1, Math.round((pct-0.9)*30))}'`;
  return `${Math.max(1, Math.round(pct * 90))}'`;
}

const COMMENTARY_TIED = [
  "Os dois times se estudam no meio-campo.",
  "Jogo equilibrado, ninguém quer se arriscar demais.",
  "A torcida pede mais intensidade.",
];
const COMMENTARY_WINNING = [
  "Seu time administra a vantagem com calma.",
  "O adversário arrisca mais, sabendo que precisa reagir.",
  "Sua defesa se fecha um pouco mais no resultado.",
];
const COMMENTARY_LOSING = [
  "Seu técnico pede mais intensidade lá na frente.",
  "O time vai para cima, mas se expõe a contra-ataques.",
  "A torcida cobra reação imediata.",
];

function renderCommentary(){
  const el = document.getElementById("matchsimCommentary");
  if(!el) return;
  const diff = _match.homeGoals - _match.awayGoals;
  const pool = diff > 0 ? COMMENTARY_WINNING : diff < 0 ? COMMENTARY_LOSING : COMMENTARY_TIED;
  el.textContent = pool[Math.floor(Math.random() * pool.length)];
}

/* ---------- Momentum: placar muda o "ritmo" dos lances seguintes ---------- */
function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }

function applyMomentum(base, side){
  const m = _match.momentum[side] || 0;
  return clamp(Math.round(base + m), 1, 99);
}

function registerGoalMomentum(scoringSide){
  const conceding = scoringSide === "home" ? "away" : "home";
  _match.momentum[conceding] = clamp(_match.momentum[conceding] + 5, -15, 22); // precisa reagir
  _match.momentum[scoringSide] = clamp(_match.momentum[scoringSide] - 2, -15, 22); // administra
}

function nextChance(){
  if(_match.chanceIndex >= _match.turnQueue.length){
    finishMatch();
    return;
  }
  const side = _match.turnQueue[_match.chanceIndex];
  document.getElementById("matchsimProgress").textContent =
    `Lance ${_match.chanceIndex+1}/${_match.turnQueue.length}`;
  document.getElementById("matchsimMinute").textContent =
    minuteLabelForIndex(_match.chanceIndex, _match.turnQueue.length);
  renderCommentary();

  if(side === "home") beginPlayerTurn();
  else if(_match.cfg.online) awaitRemoteChance();
  else runOpponentChance();
}

/* =========================================================
   LANCE DO AMIGO (modo online) — em vez de sortear por RNG,
   fica esperando o resultado que o cliente do amigo vai publicar
   (ver js/online.js: onLocalChance / onWaitRemoteChance).
   ========================================================= */
function awaitRemoteChance(){
  document.getElementById("matchsimDecision").classList.add("hidden");
  document.getElementById("goalGrid").classList.add("hidden");
  document.getElementById("qteTrack").classList.add("hidden");
  document.getElementById("qteBtn").classList.add("hidden");
  document.getElementById("matchsimHint").textContent = `Aguardando o lance do ${_match.cfg.awayTeamName}...`;

  if(typeof _match.cfg.onWaitRemoteChance !== "function"){
    // sem handler configurado — evita travar o jogo, resolve como perdido
    advanceChance();
    return;
  }

  _match.cfg.onWaitRemoteChance(_match.chanceIndex, (data)=>{
    data = data || {};
    if(data.isGoal){
      toast(data.message || pickMsg(AWAY_GOAL_MESSAGES(_match.cfg.awayTeamName)), "");
      registerGoal("away");
    } else {
      toast(data.message || pickMsg(AWAY_SAVE_MESSAGES), "success");
    }
    advanceChance();
  });
}

/* =========================================================
   LANCE DO JOGADOR — dois formatos possíveis:
   1) "cabeceio"      -> direto pra um QTE de física diferente (cruzamento)
   2) "chute aberto"  -> passa por uma decisão (Chutar/Passar/Driblar)
   ========================================================= */
function pickHomePlayer(){
  const lineup = _match.cfg.homeLineup;
  if(!lineup || !lineup.length) return null;
  // pesa mais pra frente (ATA/PON/MEI) — são quem mais recebe a bola em ataque
  const weight = p => ({ATA:5, PON:4, MEI:3, VOL:2, LAT:2, ZAG:1, GOL:0.2})[p.pos] ?? 2;
  const total = lineup.reduce((s,p)=>s+weight(p), 0);
  let r = Math.random() * total;
  for(const p of lineup){
    r -= weight(p);
    if(r <= 0) return p;
  }
  return lineup[lineup.length - 1];
}

function playerEffectiveOvr(player){
  if(!player) return null;
  const raw = player.ovr ?? player.overall ?? player.rating ?? null;
  if(raw == null) return null;
  const condition = player.condition ?? 100; // 100 = descansado
  const penalty = (100 - condition) * 0.15;
  return clamp(Math.round(raw - penalty), 20, 99);
}

function beginPlayerTurn(){
  document.getElementById("matchsimDecision").classList.add("hidden");
  document.getElementById("goalGrid").classList.add("hidden");
  document.getElementById("qteTrack").classList.add("hidden");
  document.getElementById("qteBtn").classList.add("hidden");

  const player = pickHomePlayer();
  _match.currentPlayer = player;
  if(player && player.id) _match.usedHomeIds.add(player.id);

  const isCabeceio = Math.random() < 0.28;
  if(isCabeceio){
    document.getElementById("matchsimHint").textContent = player
      ? `Cruzamento na área! ${player.name} sobe para cabecear.`
      : "Cruzamento na área! Cabeceio!";
    const strength = applyMomentum(_match.cfg.playerStrength, "home");
    showGoalTargetGrid({ kind: "cabeceio", zoneMult: 0.8, strengthOverride: strength, speedMult: 1.2 });
    return;
  }

  document.getElementById("matchsimHint").textContent = player
    ? `${player.name} recebeu a bola livre. O que fazer?`
    : "Chance livre! O que fazer?";
  showDecisionButtons(player);
}

function showDecisionButtons(player){
  const wrap = document.getElementById("matchsimDecision");
  wrap.classList.remove("hidden");
  wrap.querySelectorAll(".decision-btn").forEach(btn=>{
    btn.onclick = () => resolveDecision(btn.dataset.choice, player);
  });
}

function resolveDecision(choice, player){
  document.getElementById("matchsimDecision").classList.add("hidden");
  const ovr = playerEffectiveOvr(player);
  const baseStrength = applyMomentum(_match.cfg.playerStrength, "home");
  // combina força do time com o overall do jogador sorteado (efeito pequeno — quem decide é o timing)
  const blended = ovr != null ? Math.round(baseStrength*0.45 + ovr*0.55) : baseStrength;

  if(choice === "chutar"){
    document.getElementById("matchsimHint").textContent = "Finalização direta! Escolha onde mirar:";
    showGoalTargetGrid({ kind: "chute", zoneMult: 1.0, strengthOverride: blended });
    return;
  }

  if(choice === "passar"){
    document.getElementById("matchsimHint").textContent = "Toque na hora certa pra tocar a bola:";
    runActionQTE("passar", blended, (success)=>{
      if(!success){
        toast("Passe interceptado! A jogada morreu ali.", "");
        syncLocalChance(false, "Passe interceptado! A jogada morreu ali.");
        advanceChance();
        return;
      }
      document.getElementById("matchsimHint").textContent = "Passe certo! Escolha onde mirar:";
      showGoalTargetGrid({ kind: "chute", zoneMult: 1.25, strengthOverride: blended });
    });
    return;
  }

  // driblar
  document.getElementById("matchsimHint").textContent = "Toque na hora certa pra encarar o marcador:";
  runActionQTE("driblar", blended, (success)=>{
    if(!success){
      toast("Perdeu a bola no drible...", "");
      syncLocalChance(false, "Perdeu a bola no drible...");
      advanceChance();
      return;
    }
    document.getElementById("matchsimHint").textContent = "Cara a cara com o goleiro! Escolha o canto:";
    showGoalTargetGrid({ kind: "penalti", zoneMult: 1.15, strengthOverride: blended });
  });
}

/* =========================================================
   PASSE / DRIBLE — mini-QTE de timing (sem RNG cru): acerte a
   janela na barra pra ter sucesso. Força/overall só encolhem ou
   alargam a janela em uns poucos pontos percentuais.
   ========================================================= */
function runActionQTE(kind, strength, onDone){
  const track = document.getElementById("qteTrack");
  const pointer = document.getElementById("qtePointer");
  const zoneEl = document.getElementById("qteZone");
  const btn = document.getElementById("qteBtn");
  track.classList.remove("hidden");
  btn.classList.remove("hidden");
  btn.disabled = false;
  btn.textContent = kind === "passar" ? "Tocar!" : "Driblar!";

  const isPass = kind === "passar";
  const base = isPass ? 46 : 26; // passe é mais generoso que o drible
  const strMod = clamp((strength - 65) * 0.1, -5, 5); // efeito pequeno de proposito
  const widthPct = clamp(base + strMod, isPass ? 30 : 16, isPass ? 62 : 40);
  const leftPct = Math.random() * (100 - widthPct);
  zoneEl.style.width = widthPct + "%";
  zoneEl.style.left = leftPct + "%";
  pointer.style.left = "0%";

  let pos = 0, dir = 1;
  const speed = isPass ? 1.5 : 2.1;
  let raf = requestAnimationFrame(function tick(){
    pos += dir * speed;
    if(pos >= 100){ pos = 100; dir = -1; }
    if(pos <= 0){ pos = 0; dir = 1; }
    pointer.style.left = pos + "%";
    raf = requestAnimationFrame(tick);
  });

  btn.onclick = () => {
    cancelAnimationFrame(raf);
    btn.disabled = true;
    const success = pos >= leftPct && pos <= leftPct + widthPct;
    setTimeout(()=> onDone(success), 250);
  };
}

/* =========================================================
   FINALIZAÇÃO — 2 eixos, igual ao "estilo Soccer Champs":
   1) MIRA: você escolhe uma das 6 zonas do gol (cantos valem mais,
      mas têm janela de timing menor — risco x recompensa real)
   2) TIMING: barra de precisão pra "bater bem" na zona escolhida
   O goleiro "adivinha" uma zona depois (com viés pequeno pro seu
   adversário ter mais chance de acertar quanto mais forte for) —
   se ele acertar a MESMA zona que você mirou, só uma pancada muito
   bem cronometrada ainda vira gol. Se errar a zona, é gol quase certo.
   ========================================================= */
const GOAL_ZONES = {
  TL: { label: "canto superior esquerdo", corner: true,  weight: 1.0 },
  TC: { label: "meio do gol, alto",        corner: false, weight: 2.4 },
  TR: { label: "canto superior direito",   corner: true,  weight: 1.0 },
  BL: { label: "canto inferior esquerdo",  corner: true,  weight: 1.3 },
  BC: { label: "meio do gol, rasteiro",    corner: false, weight: 2.6 },
  BR: { label: "canto inferior direito",   corner: true,  weight: 1.3 },
};

function showGoalTargetGrid(opts){
  document.getElementById("matchsimDecision").classList.add("hidden");
  document.getElementById("qteTrack").classList.add("hidden");
  document.getElementById("qteBtn").classList.add("hidden");
  const grid = document.getElementById("goalGrid");
  grid.classList.remove("hidden");
  grid.querySelectorAll(".goal-zone").forEach(btn=>{
    btn.onclick = () => {
      grid.classList.add("hidden");
      runShotTimingQTE(btn.dataset.zone, opts);
    };
  });
}

function computeZoneWidth(zone, opts){
  const info = GOAL_ZONES[zone];
  const base = info.corner ? 20 : 40; // cantos = janela bem mais apertada
  const strength = opts.strengthOverride ?? applyMomentum(_match.cfg.playerStrength, "home");
  const strMod = clamp((strength - 65) * 0.12, -6, 6); // efeito pequeno de proposito
  const width = (base + strMod) * (opts.zoneMult ?? 1);
  return clamp(width, info.corner ? 10 : 20, info.corner ? 34 : 58);
}

function runShotTimingQTE(zone, opts){
  const track = document.getElementById("qteTrack");
  const pointer = document.getElementById("qtePointer");
  const zoneEl = document.getElementById("qteZone");
  const btn = document.getElementById("qteBtn");
  track.classList.remove("hidden");
  btn.classList.remove("hidden");
  btn.disabled = false;
  btn.textContent = "Finalizar!";

  const info = GOAL_ZONES[zone];
  document.getElementById("matchsimHint").textContent = `Mirando no ${info.label}. Toque na hora certa!`;

  const widthPct = computeZoneWidth(zone, opts);
  const leftPct = Math.random() * (100 - widthPct);
  zoneEl.style.width = widthPct + "%";
  zoneEl.style.left = leftPct + "%";
  pointer.style.left = "0%";

  let pos = 0, dir = 1;
  const speed = (info.corner ? 2.0 : 1.6) * (opts.speedMult ?? 1);
  let raf = requestAnimationFrame(function tick(){
    pos += dir * speed;
    if(pos >= 100){ pos = 100; dir = -1; }
    if(pos <= 0){ pos = 0; dir = 1; }
    pointer.style.left = pos + "%";
    raf = requestAnimationFrame(tick);
  });

  btn.onclick = () => {
    cancelAnimationFrame(raf);
    btn.disabled = true;
    const sweetWidth = widthPct * 0.4;
    const center = leftPct + widthPct / 2;
    const dist = Math.abs(pos - center);
    let quality = "miss";
    if(dist <= sweetWidth / 2) quality = "sweet";
    else if(pos >= leftPct && pos <= leftPct + widthPct) quality = "hit";
    setTimeout(()=> resolveGoalAttempt(zone, quality, opts), 250);
  };
}

/* Decide o resultado a partir da MIRA + QUALIDADE do toque.
   O goleiro "chuta" uma zona (viés levíssimo pela força do adversário)
   — o resto é 100% a sua pontaria e timing. */
function resolveGoalAttempt(zone, quality, opts){
  if(quality === "miss"){
    setTimeout(()=> resolvePlayerShot(false, opts), 0);
    return;
  }

  const oppStrength = _match.cfg.opponentStrength || 65;
  const oppMod = 1 + clamp((oppStrength - 50) / 500, -0.1, 0.1); // efeito pequeno de proposito
  const weights = {};
  for(const z in GOAL_ZONES) weights[z] = GOAL_ZONES[z].weight;
  weights[zone] = weights[zone] * oppMod;

  const totalW = Object.values(weights).reduce((a,b)=>a+b, 0);
  let r = Math.random() * totalW;
  let keeperZone = zone;
  for(const z in weights){
    r -= weights[z];
    if(r <= 0){ keeperZone = z; break; }
  }

  let isGoal;
  if(keeperZone !== zone){
    isGoal = Math.random() < 0.94; // goleiro foi pro lado errado — gol quase certo
  } else if(quality === "sweet"){
    isGoal = Math.random() < 0.58; // bateu perfeito mesmo com o goleiro no canto certo
  } else {
    isGoal = Math.random() < 0.14; // só "acertou" a janela, e o goleiro adivinhou — difícil
  }
  resolvePlayerShot(isGoal, opts);
}

/* Chance extra rápida de rebote: um único clique dentro de uma janela curta */
function runReboundQTE(onDone){
  const track = document.getElementById("qteTrack");
  const pointer = document.getElementById("qtePointer");
  const zone = document.getElementById("qteZone");
  const btn = document.getElementById("qteBtn");
  document.getElementById("matchsimHint").textContent = "REBOTE! Aperte rápido!";
  track.classList.remove("hidden");
  btn.classList.remove("hidden");
  btn.disabled = false;
  zone.style.width = "100%";
  zone.style.left = "0%";
  pointer.style.left = "0%";

  let done = false;
  const timeout = setTimeout(()=>{
    if(done) return;
    done = true;
    btn.onclick = null;
    onDone(false);
  }, 900);

  btn.onclick = () => {
    if(done) return;
    done = true;
    clearTimeout(timeout);
    onDone(Math.random() < 0.6);
  };
}

const GOAL_MESSAGES = [
  "GOOOL do seu time! ⚽",
  "Que finalização! Está dentro!",
  "Sem chances para o goleiro — GOL!",
  "Golaço! A torcida vai à loucura!",
  "Bateu com categoria — GOOOL!",
];
const MISS_MESSAGES = [
  "Chance perdida...",
  "Passou perto, mas foi pra fora.",
  "O goleiro defendeu!",
  "Zagueiro tira em cima da linha!",
  "Faltou capricho na hora H.",
];

function pickMsg(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

/* Publica o resultado de um lance NOSSO pro amigo, quando em modo online */
function syncLocalChance(isGoal, message){
  if(_match.cfg.online && typeof _match.cfg.onLocalChance === "function"){
    _match.cfg.onLocalChance(_match.chanceIndex, { isGoal: !!isGoal, message: message || "" });
  }
}

/* Resolve o resultado do lance do jogador, já passando pelos eventos raros */
function resolvePlayerShot(isGoalRaw, opts){
  const evt = rollRareEvent("home", isGoalRaw, opts);

  if(evt.type === "rebote" && !evt.finalGoal){
    runReboundQTE((made)=>{
      const message = made ? "Rebote e... GOOOL! ⚽" : "Rebote, mas a zaga afasta o perigo!";
      if(made) registerGoal("home");
      toast(message, made ? "success" : "");
      syncLocalChance(made, message);
      advanceChance();
    });
    return;
  }

  const isGoal = !!evt.finalGoal;
  const message = evt.message || (isGoal ? pickMsg(GOAL_MESSAGES) : pickMsg(MISS_MESSAGES));
  if(isGoal) registerGoal("home");
  toast(message, isGoal ? "success" : "");
  syncLocalChance(isGoal, message);
  advanceChance();
}

function registerGoal(side){
  if(side === "home"){
    _match.homeGoals++;
    document.getElementById("matchsimHomeGoals").textContent = _match.homeGoals;
  } else {
    _match.awayGoals++;
    document.getElementById("matchsimAwayGoals").textContent = _match.awayGoals;
  }
  registerGoalMomentum(side);
}

function advanceChance(){
  _match.chanceIndex++;
  nextChance();
}

/* =========================================================
   LANCE DO ADVERSÁRIO — resolvido pela força relativa, também
   passa pelos eventos raros (defesa, cartão, gol contra a lógica etc.)
   ========================================================= */
const AWAY_GOAL_MESSAGES = (name)=>[
  `Gol do ${name}...`,
  `${name} não perdoou — gol.`,
  `Bola no fundo da rede do ${name}.`,
];
const AWAY_SAVE_MESSAGES = [
  "Sua defesa segurou!",
  "Grande intervenção da sua zaga!",
  "Seu goleiro faz a defesa!",
  "Aliviou no último instante!",
];

function runOpponentChance(){
  document.getElementById("matchsimDecision").classList.add("hidden");
  document.getElementById("goalGrid").classList.add("hidden");
  document.getElementById("qteTrack").classList.add("hidden");
  document.getElementById("qteBtn").classList.add("hidden");
  document.getElementById("matchsimHint").textContent = `Ataque perigoso do ${_match.cfg.awayTeamName}! Fique atento pra desarmar...`;

  showDefendPrompt((tackleResult)=>{
    const oStr = applyMomentum(_match.cfg.opponentStrength, "away");
    const pStr = applyMomentum(_match.cfg.playerStrength, "home");
    // diferença de força só desloca a chance base em poucos pontos — o reflexo é quem decide de verdade
    let goalChance = clamp(0.30 + (oStr - pStr) * 0.0018, 0.16, 0.46);
    if(tackleResult === "perfect") goalChance *= 0.12;
    else if(tackleResult === "good") goalChance *= 0.42;
    const isGoalRaw = Math.random() < goalChance;

    const evt = rollRareEvent("away", isGoalRaw, {});

    if(evt.type === "rebote" && !evt.finalGoal){
      // rebote perigoso do adversário — resolve com defesa extra (sem QTE, é o lado deles)
      const cleared = Math.random() < 0.55;
      if(cleared){
        toast("Rebote, mas a defesa afasta o perigo!", "success");
      } else {
        toast(`Rebote e gol do ${_match.cfg.awayTeamName}...`, "");
        registerGoal("away");
      }
      advanceChance();
      return;
    }

    if(evt.finalGoal){
      toast(evt.message || pickMsg(AWAY_GOAL_MESSAGES(_match.cfg.awayTeamName)), "");
      registerGoal("away");
    } else {
      const saveMsg = tackleResult === "perfect" ? "DESARME PERFEITO! Você tirou a bola na hora certa!"
        : tackleResult === "good" ? "Bom desarme! Você aliviou o perigo."
        : pickMsg(AWAY_SAVE_MESSAGES);
      toast(evt.message || saveMsg, "success");
      maybeIssueCard();
    }
    advanceChance();
  });
}

/* Janela curta de reflexo: um "DESARMAR!" aparece depois de um atraso
   aleatório. Tocar rápido reduz bastante a chance de gol do CPU;
   tocar tarde (ou não tocar) não muda nada. É 100% habilidade sua. */
function showDefendPrompt(onResolved){
  const btn = document.getElementById("qteBtn");
  btn.classList.remove("hidden");
  btn.classList.remove("qte-btn-flash");
  btn.disabled = true;
  btn.textContent = "Aguarde...";

  const delay = 500 + Math.random() * 1300;
  let resolved = false;

  setTimeout(()=>{
    if(resolved || !_match) return;
    btn.textContent = "DESARMAR!";
    btn.disabled = false;
    btn.classList.add("qte-btn-flash");
    const start = Date.now();

    const timeout = setTimeout(()=>{
      if(resolved) return;
      resolved = true;
      cleanup();
      onResolved("miss");
    }, 650);

    function cleanup(){
      btn.classList.remove("qte-btn-flash");
      btn.classList.add("hidden");
      btn.onclick = null;
    }

    btn.onclick = () => {
      if(resolved) return;
      resolved = true;
      clearTimeout(timeout);
      const reaction = Date.now() - start;
      cleanup();
      let result = "miss";
      if(reaction <= 240) result = "perfect";
      else if(reaction <= 500) result = "good";
      onResolved(result);
    };
  }, delay);
}

/* Ao segurar o ataque adversário, pequena chance de o lance ter sido
   um carrinho/desarme que rende cartão amarelo pra um jogador seu. */
function maybeIssueCard(){
  if(Math.random() >= 0.08) return;
  const lineup = _match.cfg.homeLineup;
  if(!lineup || !lineup.length) return;
  const defenders = lineup.filter(p => ["ZAG","LAT","VOL"].includes(p.pos));
  const pool = defenders.length ? defenders : lineup;
  const player = pool[Math.floor(Math.random()*pool.length)];
  if(!player) return;
  _match.cardEvents.push({ playerId: player.id || null, playerName: player.name });
  toast(`Cartão amarelo para ${player.name} no desarme.`, "");
}

/* =========================================================
   EVENTOS RAROS — pequena camada de imprevisibilidade em cima do
   resultado "cru" de qualquer lance (jogador ou CPU).
   ========================================================= */
function rollRareEvent(side, isGoalRaw, opts){
  // Lesão: rara, independe do resultado do lance, só acontece no ataque do jogador
  if(side === "home" && Math.random() < 0.015){
    const lineup = _match.cfg.homeLineup;
    if(lineup && lineup.length){
      const player = lineup[Math.floor(Math.random()*lineup.length)];
      if(player){
        _match.injuryEvents.push({ playerId: player.id || null, playerName: player.name });
        toast(`${player.name} sentiu a coxa e segue com a condição física abalada.`, "");
      }
    }
  }

  // Escorregão em dia de chuva: ajuda quem está em desvantagem no lance
  if(_match.cfg.weather === "chuva" && Math.random() < 0.06){
    if(side === "home" && !isGoalRaw && Math.random() < 0.4){
      return { finalGoal: true, message: "O zagueiro escorrega na grama molhada e o gol sai livre! GOL!" };
    }
    if(side === "away" && isGoalRaw && Math.random() < 0.4){
      // escorregão evita o gol adversário
      return { finalGoal: false, message: "Escorregão na área, mas a bola sobra pra defesa afastar!" };
    }
  }

  if(isGoalRaw){
    // Bola na trave: podia ser gol, mas bate na trave — 3 desfechos
    if(Math.random() < 0.05){
      const outcome = Math.random();
      if(outcome < 0.4){
        const msg = side === "home"
          ? "Bateu na trave e entrou! GOOOL!"
          : `Bateu na trave e entrou! Gol do ${_match.cfg.awayTeamName}...`;
        return { finalGoal: true, message: msg };
      }
      if(outcome < 0.75) return { type: "rebote", finalGoal: false };
      return { finalGoal: false, message: "Na trave! Quase, mas não foi dessa vez." };
    }
    // Impedimento anula o gol (só em lances de contra-ataque/lançamento)
    if(opts.kind !== "penalti" && Math.random() < 0.04){
      return { finalGoal: false, message: "GOOOL... anulado! Impedimento assinalado." };
    }
    return { finalGoal: true };
  } else {
    // Rebote em cima de uma defesa/chute perdido
    if(Math.random() < 0.10){
      return { type: "rebote", finalGoal: false };
    }
    // Desvio que quase engana o goleiro mas sai
    if(Math.random() < 0.05){
      return { finalGoal: false, message: "Desviou na zaga e quase enganou o goleiro — saiu para escanteio." };
    }
    return { finalGoal: false };
  }
}

function defaultWinCondition(score){
  if(score.home > score.away) return { result: "win" };
  if(score.home < score.away) return { result: "loss" };
  return { result: "draw" };
}

function finishMatch(){
  document.getElementById("matchsimStage").classList.add("hidden");
  const score = { home: _match.homeGoals, away: _match.awayGoals };
  const outcome = _match.cfg.winCondition
    ? _match.cfg.winCondition(score)
    : defaultWinCondition(score);

  document.getElementById("matchsimResultWrap").classList.remove("hidden");
  document.getElementById("matchsimResultScore").textContent = `${score.home} - ${score.away}`;
  const titleEl = document.getElementById("matchsimResultTitle");
  titleEl.textContent = outcome.result === "win" ? "Vitória!" : outcome.result === "draw" ? "Empate" : "Derrota";
  titleEl.className = "matchsim-result-title " + outcome.result;

  _match.pendingResult = {
    homeGoals: score.home,
    awayGoals: score.away,
    result: outcome.result, // "win" | "draw" | "loss"
    cfg: _match.cfg,
    usedHomeIds: Array.from(_match.usedHomeIds),
    cardEvents: _match.cardEvents,
    injuryEvents: _match.injuryEvents,
  };
}

function closeMatch(){
  document.getElementById("matchsimOverlay").classList.add("hidden");
  const result = _match.pendingResult;
  const onComplete = _match.cfg.onComplete;
  _match = null;
  if(typeof onComplete === "function" && result) onComplete(result);
}
