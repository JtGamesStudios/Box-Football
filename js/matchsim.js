/* =========================================================
   MATCH ENGINE — motor de simulação de partida (QTE), compartilhado
   entre Campanha, Modo de Evento, Jogo c/ Amigo etc.

   Qualquer tela que quiser "jogar uma partida" só precisa chamar:

     startMatch({
       title, homeTeamName, awayTeamName,
       playerStrength, opponentStrength,   // 0-100
       totalChances,                        // nº de lances da partida
       winCondition(score) => {result:"win"|"draw"|"loss"},  // opcional
       onComplete(result)                   // decide o que fazer com o resultado
     });

   winCondition default = mais gols vence. Um evento pode sobrescrever,
   ex: "marque 10 gols", "não sofra gol", "vença de virada" etc.
   ========================================================= */

/* =========================================================
   MATCH ENGINE — motor de simulação de partida (QTE), compartilhado
   entre Campanha, Modo de Evento, Jogo c/ Amigo etc.

   Qualquer tela que quiser "jogar uma partida" só precisa chamar:

     startMatch({
       competitionLabel,                    // ex: "Campanha — Divisão 1"
       title, homeTeamName, awayTeamName,
       homeLineup, awayLineup,              // opcional: [{number,name,pos}, ...]
       playerStrength, opponentStrength,   // 0-100
       totalChances,                        // nº de lances da partida
       winCondition(score) => {result:"win"|"draw"|"loss"},  // opcional
       onComplete(result)                   // decide o que fazer com o resultado
     });

   Antes da partida em si, mostra uma tela de pré-jogo (banner da
   competição + escalação de cada lado, estilo transmissão de TV).
   Se homeLineup/awayLineup não forem passados, usa um time genérico
   de 11 jogadores como placeholder.

   winCondition default = mais gols vence. Um evento pode sobrescrever,
   ex: "marque 10 gols", "não sofra gol", "vença de virada" etc.
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
  winCondition: null,
  onComplete: null,
};

let _match = null;

function startMatch(userConfig){
  const cfg = Object.assign({}, MATCH_DEFAULTS, userConfig || {});
  _match = {
    cfg,
    chanceIndex: 0,
    homeGoals: 0,
    awayGoals: 0,
    turnQueue: buildTurnQueue(cfg),
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
        </div>
        <div class="matchsim-team away">
          <span class="matchsim-goals" id="matchsimAwayGoals">0</span>
          <span class="matchsim-team-name" id="matchsimAwayName">CPU</span>
        </div>
      </div>

      <div class="matchsim-stage" id="matchsimStage">
        <div class="matchsim-hint" id="matchsimHint">Preparando lance...</div>
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

function nextChance(){
  if(_match.chanceIndex >= _match.turnQueue.length){
    finishMatch();
    return;
  }
  const side = _match.turnQueue[_match.chanceIndex];
  document.getElementById("matchsimProgress").textContent =
    `Lance ${_match.chanceIndex+1}/${_match.turnQueue.length}`;
  document.getElementById("matchsimHint").textContent =
    side === "home" ? "Sua chance! Toque no momento certo." : `Chance do ${_match.cfg.awayTeamName}...`;

  if(side === "home") runPlayerQTE();
  else runOpponentChance();
}

/* --- Lance do jogador: QTE de tempo (clicar quando o ponteiro estiver na zona verde) --- */
function runPlayerQTE(){
  const track = document.getElementById("qteTrack");
  const pointer = document.getElementById("qtePointer");
  const zone = document.getElementById("qteZone");
  const btn = document.getElementById("qteBtn");
  track.classList.remove("hidden");
  btn.classList.remove("hidden");
  btn.disabled = false;

  // zona verde: mais forte = zona maior = lance mais fácil
  const strength = _match.cfg.playerStrength;
  const zoneWidthPct = Math.max(14, Math.min(42, strength * 0.4));
  const zoneLeftPct = Math.random() * (100 - zoneWidthPct);
  zone.style.width = zoneWidthPct + "%";
  zone.style.left = zoneLeftPct + "%";

  let pos = 0, dir = 1;
  const speed = 1.6;
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
    const hit = pos >= zoneLeftPct && pos <= zoneLeftPct + zoneWidthPct;
    const centerDist = Math.abs(pos - (zoneLeftPct + zoneWidthPct/2));
    const isGoal = hit && Math.random() < (0.85 - centerDist*0.005);
    setTimeout(()=>{
      if(isGoal){
        _match.homeGoals++;
        document.getElementById("matchsimHomeGoals").textContent = _match.homeGoals;
        toast("GOOOL do seu time! ⚽", "success");
      } else {
        toast("Chance perdida...", "");
      }
      _match.chanceIndex++;
      nextChance();
    }, 350);
  };
}

/* --- Lance do adversário: resolvido pela força relativa --- */
function runOpponentChance(){
  document.getElementById("qteTrack").classList.add("hidden");
  document.getElementById("qteBtn").classList.add("hidden");
  const oStr = _match.cfg.opponentStrength;
  const isGoal = Math.random() < (0.25 + oStr*0.003);
  setTimeout(()=>{
    if(isGoal){
      _match.awayGoals++;
      document.getElementById("matchsimAwayGoals").textContent = _match.awayGoals;
      toast(`Gol do ${_match.cfg.awayTeamName}...`, "");
    } else {
      toast("Sua defesa segurou!", "success");
    }
    _match.chanceIndex++;
    nextChance();
  }, 700);
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
  };
}

function closeMatch(){
  document.getElementById("matchsimOverlay").classList.add("hidden");
  const result = _match.pendingResult;
  const onComplete = _match.cfg.onComplete;
  _match = null;
  if(typeof onComplete === "function" && result) onComplete(result);
}
