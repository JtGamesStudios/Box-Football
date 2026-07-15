/* =========================================================
   MODO PÊNALTIS — "Disputa de Pênaltis" (v1)
   Minigame de cobrança de pênaltis melhor-de-5 + morte súbita,
   inspirado no fluxo do "Olha a Batida", mas com mira e mecânica
   de defesa construídas do zero pro Box Clube.

   Roda em paralelo aos outros motores (js/matchsim.js, js/arcade.js)
   e NÃO altera nada fora deste arquivo.

   Uso (mesma assinatura que startMatch()/startArcadeMatch(), pra
   não quebrar js/events.js):

     startPenaltyMatch({
       competitionLabel, title, homeTeamName, awayTeamName,
       homeLineup, awayLineup, opponentStrength,
       winCondition(score) => {result:"win"|"draw"|"loss"},
       onComplete(result)
     });

   onComplete recebe o MESMO formato de objeto de sempre:
     { homeGoals, awayGoals, result, usedHomeIds, cardEvents, injuryEvents }
   homeGoals/awayGoals = nº de cobranças convertidas em gol.
   cardEvents/injuryEvents ficam sempre vazios (não existe cartão
   nem lesão em disputa de pênaltis).

   ---------------------------------------------------------
   COMO FUNCIONA A MIRA (bem diferente do arcade antigo):
   1) O jogador escolhe um ESTILO DE COBRANÇA (Batida Forte,
      Cavadinha, Canto Fechado ou Categoria) — mesmo conceito das
      cartas táticas, só reembalado.
   2) Encosta e ARRASTA dentro do gol pra posicionar a mira (mira
      livre, não presa a uma grade visível pro jogador).
   3) Enquanto segura, uma barra de POTÊNCIA fica oscilando —
      soltar no ponto certo = "categoria"; soltar tarde demais
      arrisca chutar por cima do travessão.
   ---------------------------------------------------------
   COMO FUNCIONA A DEFESA (o "jogo de blefe" dos pênaltis):
   Quando é a vez do adversário (COM) cobrar, você não vê o chute
   antes de decidir — escolhe pra que canto o goleiro vai pular
   ANTES da cobrança ser revelada. Os dois lados decidem "às
   cegas" ao mesmo tempo, exatamente como um pênalti de verdade.
   Isso também deixa o jogo pronto pra duelo online no futuro: não
   precisa de nenhuma rodada extra de sincronização, só alternar
   cobranças.
   ========================================================= */

const PENALTY_DEFAULTS = {
  competitionLabel: "Modo Pênaltis",
  title: "Disputa de Pênaltis",
  homeTeamName: "Meu Clube",
  awayTeamName: "COM",
  homeLineup: null,
  awayLineup: null,
  opponentStrength: 60,
  winCondition: null,
  onComplete: null,
};

const PEN_MAX_ROUNDS = 5;
const PEN_SUDDEN_DEATH_CAP = 10; // rodadas extras de morte súbita antes de forçar um desempate

/* Zonas do gol: Esquerda-Alto/Baixo, Centro, Direita-Alto/Baixo.
   "Centro" representa o goleiro parado no meio (sem pular). */
const PEN_ZONES = ["EA", "EB", "C", "DA", "DB"];
const PEN_ZONE_LABEL = { EA: "Canto esq. alto", EB: "Canto esq. baixo", C: "Meio do gol", DA: "Canto dir. alto", DB: "Canto dir. baixo" };
// posição visual (% dentro do palco do gol) de cada zona, usada pra animar bola/goleiro
const PEN_ZONE_POS = {
  EA: { x: 16, y: 22 }, EB: { x: 16, y: 74 }, C: { x: 50, y: 54 },
  DA: { x: 84, y: 22 }, DB: { x: 84, y: 74 },
};

const PEN_STYLES = {
  categoria: { id: "categoria", label: "Categoria", desc: "Equilibrado e preciso.", powerBias: 0, missMod: -0.05, saveMod: 0, jitterMod: -3 },
  forte:     { id: "forte", label: "Batida Forte", desc: "Mais potência — mais difícil de defender, mais risco de travessão.", powerBias: 16, missMod: 0.05, saveMod: -0.12, jitterMod: 0 },
  fechado:   { id: "fechado", label: "Canto Fechado", desc: "Mira só nos cantos extremos: quase impossível de defender, fácil de travar na trave.", snapCorner: true, missMod: 0.08, saveMod: -0.22, jitterMod: 2 },
  cavadinha: { id: "cavadinha", label: "Cavadinha", desc: "Se o goleiro ficar parado no meio, é defesa fácil. Se ele pular pra qualquer lado, vira vexame.", forceZone: "C", powerBias: -30, missMod: -0.03, saveMod: 0, jitterMod: -2 },
};
const PEN_STYLE_LIST = ["categoria", "forte", "fechado", "cavadinha"];

let _pen = null;

/* =========================================================
   ATRIBUTOS — cobrador e goleiro derivados do overall/posição
   ========================================================= */
const PEN_SHOT_POS_BONUS = { ATA: 14, PON: 8, MEI: 2, VOL: -4, LAT: -6, ZAG: -10, GOL: -20 };
const PEN_REFLEX_POS_BONUS = { GOL: 22, ZAG: -4, LAT: -6, VOL: -6, MEI: -8, PON: -10, ATA: -12 };

function penClamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function derivePenShooterAttrs(player) {
  const ovr = penClamp((player && (player.ovr ?? player.overall)) ?? 66, 40, 99);
  const bonus = PEN_SHOT_POS_BONUS[(player && player.pos) || "ATA"] ?? 0;
  return { shot: penClamp(ovr + bonus, 30, 99) };
}
function derivePenKeeperAttrs(player) {
  const ovr = penClamp((player && (player.ovr ?? player.overall)) ?? 66, 40, 99);
  const bonus = PEN_REFLEX_POS_BONUS[(player && player.pos) || "GOL"] ?? 0;
  return { reflex: penClamp(ovr + bonus, 30, 99) };
}

/* Escolhe até 5 cobradores (do melhor pro pior, ignorando o goleiro),
   pra alternar quem bate cada cobrança — igual escolha real de um técnico. */
function pickPenShooters(lineup) {
  const fallback = [
    { number: 9, name: "Atacante", pos: "ATA", ovr: 68 },
    { number: 10, name: "Meia", pos: "MEI", ovr: 66 },
    { number: 7, name: "Ponta", pos: "PON", ovr: 65 },
    { number: 4, name: "Zagueiro", pos: "ZAG", ovr: 64 },
    { number: 6, name: "Volante", pos: "VOL", ovr: 63 },
  ];
  if (!lineup || !lineup.length) return fallback;
  const outfield = lineup.filter(p => p.pos !== "GOL");
  const pool = (outfield.length ? outfield : lineup).slice();
  pool.sort((a, b) => (b.ovr || 0) - (a.ovr || 0));
  return pool.slice(0, 5).length ? pool.slice(0, 5) : fallback;
}
function pickPenKeeper(lineup) {
  const fallback = { number: 1, name: "Goleiro", pos: "GOL", ovr: 66 };
  if (!lineup || !lineup.length) return fallback;
  const goalies = lineup.filter(p => p.pos === "GOL");
  if (!goalies.length) return fallback;
  return goalies.reduce((a, b) => ((b.ovr || 0) > (a.ovr || 0) ? b : a));
}

/* =========================================================
   ÁUDIO — sintetizado via Web Audio API (mesmo padrão do arcade)
   ========================================================= */
let _penAudioCtx = null;
function penAudioOn() { return !!(typeof STATE !== "undefined" && STATE.settings && STATE.settings.sound); }
function penVibrate(pattern) {
  if (typeof STATE !== "undefined" && STATE.settings && STATE.settings.vibration && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch (e) {}
  }
}
function penCtx() {
  if (!penAudioOn()) return null;
  if (!_penAudioCtx) {
    try { _penAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  if (_penAudioCtx.state === "suspended") _penAudioCtx.resume();
  return _penAudioCtx;
}
function penTone(freq, dur, type, vol, when) {
  const ctx = penCtx(); if (!ctx) return;
  const t0 = ctx.currentTime + (when || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol ?? 0.14, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function penNoise(dur, vol) {
  const ctx = penCtx(); if (!ctx) return;
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol ?? 0.18, ctx.currentTime);
  src.connect(gain).connect(ctx.destination);
  src.start();
}
function penSfxGoal() { penTone(520, 0.1, "triangle", 0.16); penTone(780, 0.14, "triangle", 0.16, 0.09); penTone(1040, 0.2, "triangle", 0.18, 0.18); }
function penSfxSave() { penNoise(0.1, 0.14); penTone(180, 0.14, "square", 0.12); }
function penSfxMiss() { penNoise(0.08, 0.1); penTone(140, 0.22, "sawtooth", 0.1); }
function penSfxWhistle() { penTone(1500, 0.3, "square", 0.1); }
function penSfxPick() { penTone(360, 0.05, "sine", 0.1); }
function penSfxTension() { penTone(220, 0.5, "sine", 0.05); }

/* =========================================================
   OVERLAY / DOM
   ========================================================= */
function ensurePenStyles() {
  if (document.getElementById("penStyles")) return;
  const style = document.createElement("style");
  style.id = "penStyles";
  style.textContent = `
  .pen-overlay{position:fixed;inset:0;background:#0b1220;z-index:9999;display:flex;flex-direction:column;font-family:var(--font-body);color:#fff;}
  .pen-overlay.hidden{display:none;}
  .pen-intro,.pen-result{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;}
  .pen-comp-label{font-family:var(--font-display);font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);}
  .pen-vs-row{display:flex;align-items:center;gap:14px;font-family:var(--font-display);font-size:20px;}
  .pen-vs-badge{background:var(--brand);border-radius:var(--radius-sm);padding:4px 10px;font-size:13px;}
  .pen-sub{color:#B9C2CE;font-size:13px;max-width:340px;line-height:1.5;}
  .pen-btn{border:none;border-radius:var(--radius-md);padding:14px 28px;font-family:var(--font-display);font-size:16px;background:var(--brand);color:#fff;box-shadow:var(--shadow-card);}
  .pen-btn:active{transform:scale(0.97);}
  .pen-result-score{font-family:var(--font-display);font-size:42px;}
  .pen-result-sub{color:#B9C2CE;font-size:13px;}
  .pen-result-title{font-family:var(--font-display);font-size:24px;}
  .pen-result-title.win{color:var(--turf);}
  .pen-result-title.loss{color:var(--crimson);}
  .pen-result-title.draw{color:var(--gold);}

  .pen-hud{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#0b1220;border-bottom:1px solid rgba(255,255,255,.08);font-family:var(--font-display);font-size:13px;flex-shrink:0;z-index:3;}
  .pen-hud .side{display:flex;flex-direction:column;align-items:center;min-width:64px;}
  .pen-hud .side .lbl{font-family:var(--font-body);font-size:10px;color:#7C8AA0;text-transform:uppercase;}
  .pen-hud .goals{font-size:22px;}
  .pen-hud .mid{text-align:center;color:#B9C2CE;font-family:var(--font-body);font-size:11px;}
  .pen-dots{display:flex;gap:4px;margin-top:3px;}
  .pen-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.18);}
  .pen-dot.goal{background:var(--turf);}
  .pen-dot.miss{background:var(--crimson);}
  .pen-dot.save{background:var(--gold);}

  .pen-stage{position:relative;flex:1;overflow:hidden;background:linear-gradient(#173a1d,#0f2a15);display:flex;flex-direction:column;}
  .pen-callout{text-align:center;font-family:var(--font-display);font-size:15px;padding:10px 14px 2px;color:#fff;}
  .pen-callout .who{color:var(--gold);}
  .pen-goalwrap{position:relative;flex:1;margin:6px 16px 8px;border-radius:10px;overflow:hidden;background:repeating-linear-gradient(90deg,#1c4a24,#1c4a24 24px,#204f28 24px,#204f28 48px);}
  .pen-goal{position:absolute;left:8%;right:8%;top:10%;bottom:14%;border:6px solid #eef1f5;border-bottom:none;border-radius:4px 4px 0 0;
    background-image:
      repeating-linear-gradient(90deg, rgba(255,255,255,.14) 0 1px, transparent 1px 14px),
      repeating-linear-gradient(0deg, rgba(255,255,255,.14) 0 1px, transparent 1px 14px);
    touch-action:none;}
  .pen-zone-hint{position:absolute;transform:translate(-50%,-50%);width:30%;height:38%;border:1px dashed rgba(255,255,255,.16);border-radius:8px;pointer-events:none;}
  .pen-dive-btn{position:absolute;transform:translate(-50%,-50%);width:26%;height:34%;border-radius:10px;border:2px solid rgba(255,255,255,.4);
    background:rgba(255,255,255,.06);color:#fff;font-family:var(--font-body);font-size:11px;display:flex;align-items:center;justify-content:center;text-align:center;padding:4px;}
  .pen-dive-btn:active{background:rgba(255,255,255,.18);}
  .pen-dive-btn.chosen{border-color:var(--gold);background:rgba(255,201,60,.22);}
  .pen-reticle{position:absolute;width:34px;height:34px;border:2px solid var(--gold);border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;display:none;box-shadow:0 0 12px rgba(255,201,60,.6);}
  .pen-reticle.show{display:block;}
  .pen-edge-warning{position:absolute;inset:0;border:3px solid var(--crimson);border-radius:4px 4px 0 0;opacity:0;pointer-events:none;transition:opacity .15s;}
  .pen-edge-warning.show{opacity:.55;}
  .pen-keeper{position:absolute;width:15%;height:20%;transform:translate(-50%,-50%);background:var(--brand);border-radius:6px 6px 2px 2px;transition:left .35s cubic-bezier(.2,.7,.3,1.2), top .35s cubic-bezier(.2,.7,.3,1.2);box-shadow:0 2px 8px rgba(0,0,0,.4);}
  .pen-keeper::after{content:"🧤";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:14px;}
  .pen-ball{position:absolute;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff,#c9cdd4 60%,#8b909b);transform:translate(-50%,-50%);transition:left .38s ease-out, top .38s ease-out, transform .38s ease-out;box-shadow:0 2px 6px rgba(0,0,0,.4);}

  .pen-power-wrap{margin:0 16px 4px;display:flex;align-items:center;gap:8px;}
  .pen-power-lbl{font-family:var(--font-body);font-size:10px;color:#B9C2CE;text-transform:uppercase;white-space:nowrap;}
  .pen-power-track{flex:1;height:10px;border-radius:6px;background:rgba(255,255,255,.12);overflow:hidden;position:relative;}
  .pen-power-fill{height:100%;border-radius:6px;background:linear-gradient(90deg,var(--turf),var(--gold),var(--crimson));width:0%;}
  .pen-power-sweet{position:absolute;top:0;bottom:0;left:60%;width:22%;border-left:1px dashed rgba(255,255,255,.5);border-right:1px dashed rgba(255,255,255,.5);}

  .pen-styles{display:flex;gap:8px;padding:0 16px 10px;flex-wrap:wrap;}
  .pen-style-btn{flex:1;min-width:120px;border:2px solid rgba(255,255,255,.18);border-radius:var(--radius-md);padding:8px 6px;background:rgba(255,255,255,.05);color:#fff;text-align:center;}
  .pen-style-btn .nm{font-family:var(--font-display);font-size:13px;}
  .pen-style-btn .ds{font-family:var(--font-body);font-size:10px;color:#B9C2CE;line-height:1.3;margin-top:2px;}
  .pen-style-btn.chosen{border-color:var(--gold);background:rgba(255,201,60,.14);}

  .pen-hint{text-align:center;font-family:var(--font-body);font-size:12px;color:rgba(255,255,255,.7);padding:2px 16px 10px;min-height:16px;}
  .pen-flash{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:2;}
  .pen-flash.goal{animation:penFlashGoal .3s ease;}
  .pen-flash.stop{animation:penFlashStop .3s ease;}
  @keyframes penFlashGoal{ 0%{opacity:.3; background:var(--turf);} 100%{opacity:0;} }
  @keyframes penFlashStop{ 0%{opacity:.3; background:var(--crimson);} 100%{opacity:0;} }
  `;
  document.head.appendChild(style);
}

function ensurePenOverlay() {
  ensurePenStyles();
  if (document.getElementById("penOverlay")) return;
  const div = document.createElement("div");
  div.className = "pen-overlay hidden";
  div.id = "penOverlay";
  div.innerHTML = `
    <div class="pen-intro" id="penIntro">
      <div class="pen-comp-label" id="penCompLabel">Modo Pênaltis</div>
      <div class="pen-vs-row">
        <span id="penHomeName">Meu Clube</span>
        <span class="pen-vs-badge">PÊNALTIS</span>
        <span id="penAwayName">COM</span>
      </div>
      <div class="pen-sub" id="penIntroSub">Melhor de 5 cobranças, depois morte súbita. Escolha o estilo, mire e solte a potência na hora certa. Na defesa, escolha o canto do goleiro antes de ver a cobrança.</div>
      <button class="pen-btn" id="penStartBtn">Começar ›</button>
    </div>

    <div class="pen-hud hidden" id="penHud">
      <div class="side">
        <span class="lbl" id="penHomeLbl">Meu Clube</span>
        <span class="goals" id="penHomeGoals">0</span>
        <div class="pen-dots" id="penHomeDots"></div>
      </div>
      <div class="mid" id="penRoundLbl">Rodada 1/5</div>
      <div class="side">
        <span class="lbl" id="penAwayLbl">COM</span>
        <span class="goals" id="penAwayGoals">0</span>
        <div class="pen-dots" id="penAwayDots"></div>
      </div>
    </div>

    <div class="pen-stage hidden" id="penStage">
      <div class="pen-callout" id="penCallout"></div>
      <div class="pen-styles hidden" id="penStyles2"></div>
      <div class="pen-goalwrap">
        <div class="pen-goal" id="penGoal">
          <div class="pen-edge-warning" id="penEdgeWarning"></div>
          <div class="pen-keeper" id="penKeeper" style="left:50%;top:54%;"></div>
          <div class="pen-ball" id="penBall" style="left:50%;top:100%;"></div>
          <div class="pen-reticle" id="penReticle"></div>
          <div id="penDiveButtons"></div>
        </div>
      </div>
      <div class="pen-power-wrap hidden" id="penPowerWrap">
        <span class="pen-power-lbl">Potência</span>
        <div class="pen-power-track"><div class="pen-power-sweet"></div><div class="pen-power-fill" id="penPowerFill"></div></div>
      </div>
      <div class="pen-hint" id="penHint"></div>
    </div>

    <div class="pen-result hidden" id="penResult">
      <div class="pen-result-title" id="penResultTitle">Vitória!</div>
      <div class="pen-result-score" id="penResultScore">3 - 1</div>
      <div class="pen-result-sub" id="penResultSub"></div>
      <button class="pen-btn" id="penResultBtn">Continuar</button>
    </div>
  `;
  document.body.appendChild(div);
}

function penZoneOf(xPct, yPct) {
  if (xPct >= 33 && xPct < 66) return "C";
  const side = xPct < 33 ? "E" : "D";
  const row = yPct < 50 ? "A" : "B";
  return side + row;
}

/* =========================================================
   INÍCIO DA PARTIDA
   ========================================================= */
function startPenaltyMatch(userConfig) {
  const cfg = Object.assign({}, PENALTY_DEFAULTS, userConfig || {});

  const homeShooters = pickPenShooters(cfg.homeLineup);
  const awayShooters = pickPenShooters(cfg.awayLineup);
  const homeKeeper = pickPenKeeper(cfg.homeLineup);
  const awayKeeper = pickPenKeeper(cfg.awayLineup);

  _pen = {
    cfg,
    homeShooters, awayShooters,
    homeKeeperAttrs: derivePenKeeperAttrs(homeKeeper),
    awayKeeperAttrs: derivePenKeeperAttrs(awayKeeper),
    homeKeeperName: homeKeeper.name || "Goleiro",
    awayKeeperName: awayKeeper.name || "Goleiro",
    round: 1,
    homeScore: 0, awayScore: 0,
    homeTaken: 0, awayTaken: 0,
    homeHistory: [], awayHistory: [],
    suddenDeath: false,
    suddenRound: 0,
    usedHomeIds: new Set(),
    finished: false,
  };

  ensurePenOverlay();
  document.getElementById("penCompLabel").textContent = cfg.competitionLabel;
  document.getElementById("penHomeName").textContent = cfg.homeTeamName;
  document.getElementById("penAwayName").textContent = cfg.awayTeamName;
  document.getElementById("penHomeLbl").textContent = cfg.homeTeamName;
  document.getElementById("penAwayLbl").textContent = cfg.awayTeamName;
  document.getElementById("penIntro").classList.remove("hidden");
  document.getElementById("penHud").classList.add("hidden");
  document.getElementById("penStage").classList.add("hidden");
  document.getElementById("penResult").classList.add("hidden");
  document.getElementById("penOverlay").classList.remove("hidden");

  document.getElementById("penStartBtn").onclick = () => {
    document.getElementById("penIntro").classList.add("hidden");
    document.getElementById("penHud").classList.remove("hidden");
    document.getElementById("penStage").classList.remove("hidden");
    penSfxWhistle();
    updatePenHud();
    runNextPenKick();
  };
}

function updatePenHud() {
  document.getElementById("penHomeGoals").textContent = _pen.homeScore;
  document.getElementById("penAwayGoals").textContent = _pen.awayScore;
  document.getElementById("penRoundLbl").textContent = _pen.suddenDeath
    ? `Morte súbita ${_pen.suddenRound}`
    : `Rodada ${_pen.round}/${PEN_MAX_ROUNDS}`;
  const dotsHtml = (hist) => hist.map(r => `<div class="pen-dot ${r}"></div>`).join("");
  document.getElementById("penHomeDots").innerHTML = dotsHtml(_pen.homeHistory);
  document.getElementById("penAwayDots").innerHTML = dotsHtml(_pen.awayHistory);
}

/* checa se o resultado já está matematicamente decidido (só na fase normal) */
function penCheckDecided() {
  if (_pen.suddenDeath) return false;
  const homeRemaining = PEN_MAX_ROUNDS - _pen.homeTaken;
  const awayRemaining = PEN_MAX_ROUNDS - _pen.awayTaken;
  if (_pen.homeScore > _pen.awayScore + awayRemaining) return true;
  if (_pen.awayScore > _pen.homeScore + homeRemaining) return true;
  return false;
}

/* =========================================================
   FLUXO DE COBRANÇAS — alterna Meu Clube / COM
   ========================================================= */
function runNextPenKick() {
  if (_pen.finished) return;

  if (!_pen.suddenDeath) {
    if (_pen.homeTaken < PEN_MAX_ROUNDS && (_pen.homeTaken <= _pen.awayTaken)) {
      return runPenHomeKick();
    }
    if (_pen.awayTaken < PEN_MAX_ROUNDS) {
      return runPenAwayKick();
    }
    // melhor-de-5 completo — se empatado, entra em morte súbita
    if (_pen.homeScore === _pen.awayScore) {
      _pen.suddenDeath = true;
      _pen.suddenRound = 1;
      return runPenHomeKick();
    }
    return finalizePenalty();
  } else {
    // morte súbita: um chute de cada, depois compara
    if (_pen._suddenHomeDoneThisRound !== _pen.suddenRound) {
      return runPenHomeKick();
    }
    if (_pen._suddenAwayDoneThisRound !== _pen.suddenRound) {
      return runPenAwayKick();
    }
    if (_pen.homeScore !== _pen.awayScore) return finalizePenalty();
    if (_pen.suddenRound >= PEN_SUDDEN_DEATH_CAP) {
      // desempate forçado pra não travar o jogo num caso extremamente raro
      if (Math.random() < 0.5) _pen.homeScore += 1; else _pen.awayScore += 1;
      return finalizePenalty();
    }
    _pen.suddenRound += 1;
    updatePenHud();
    return runPenHomeKick();
  }
}

/* ---------- Cobrança do Meu Clube (ataque = mira + potência) ---------- */
function runPenHomeKick() {
  const idx = (_pen.suddenDeath ? (PEN_MAX_ROUNDS + _pen.suddenRound - 1) : _pen.round - 1);
  const shooter = _pen.homeShooters[idx % _pen.homeShooters.length];
  if (shooter.id) _pen.usedHomeIds.add(shooter.id);
  _pen.currentShooterAttrs = derivePenShooterAttrs(shooter);
  _pen.currentShooterName = shooter.name || "Cobrador";
  _pen.currentStyle = null;

  document.getElementById("penCallout").innerHTML =
    `<span class="who">${_pen.currentShooterName}</span> vai cobrar pelo ${_pen.cfg.homeTeamName}`;
  document.getElementById("penHint").textContent = "Escolha o estilo da cobrança:";
  document.getElementById("penPowerWrap").classList.add("hidden");
  document.getElementById("penDiveButtons").innerHTML = "";
  resetPenBallAndKeeper();

  const stylesWrap = document.getElementById("penStyles2");
  stylesWrap.classList.remove("hidden");
  stylesWrap.innerHTML = PEN_STYLE_LIST.map(id => {
    const s = PEN_STYLES[id];
    return `<button class="pen-style-btn" data-style="${id}"><div class="nm">${s.label}</div><div class="ds">${s.desc}</div></button>`;
  }).join("");
  stylesWrap.querySelectorAll(".pen-style-btn").forEach(btn => {
    btn.onclick = () => {
      stylesWrap.querySelectorAll(".pen-style-btn").forEach(b => b.classList.remove("chosen"));
      btn.classList.add("chosen");
      _pen.currentStyle = PEN_STYLES[btn.dataset.style];
      penSfxPick();
      setTimeout(() => {
        stylesWrap.classList.add("hidden");
        beginPenAiming();
      }, 180);
    };
  });
}

function resetPenBallAndKeeper() {
  const ball = document.getElementById("penBall");
  const keeper = document.getElementById("penKeeper");
  ball.style.transition = "none";
  ball.style.left = "50%"; ball.style.top = "102%"; ball.style.transform = "translate(-50%,-50%) scale(1)";
  keeper.style.left = "50%"; keeper.style.top = "54%";
  document.getElementById("penReticle").classList.remove("show");
  document.getElementById("penEdgeWarning").classList.remove("show");
  requestAnimationFrame(() => { ball.style.transition = ""; });
}

let _penAimHandlers = null;
function beginPenAiming() {
  const goal = document.getElementById("penGoal");
  const reticle = document.getElementById("penReticle");
  const powerWrap = document.getElementById("penPowerWrap");
  const powerFill = document.getElementById("penPowerFill");
  const edgeWarn = document.getElementById("penEdgeWarning");

  document.getElementById("penHint").textContent =
    "Arraste dentro do gol pra mirar e solte no momento certo pra controlar a força.";
  powerWrap.classList.remove("hidden");
  powerFill.style.width = "0%";

  let dragging = false;
  let startedAt = 0;
  let lastX = 50, lastY = 50;
  let rafId = null;

  function powerAtNow() {
    const t = (performance.now() - startedAt) / 1000;
    return (Math.sin(t * 3.4) + 1) / 2 * 100;
  }
  function loop() {
    if (!dragging) return;
    const p = powerAtNow();
    powerFill.style.width = p.toFixed(0) + "%";
    rafId = requestAnimationFrame(loop);
  }
  function posFromEvent(e) {
    const rect = goal.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches ? e.touches[0].clientY : e.clientY);
    let xPct = ((cx - rect.left) / rect.width) * 100;
    let yPct = ((cy - rect.top) / rect.height) * 100;
    xPct = penClamp(xPct, 3, 97);
    yPct = penClamp(yPct, 3, 97);
    return { xPct, yPct };
  }
  function updateReticle(xPct, yPct) {
    lastX = xPct; lastY = yPct;
    reticle.style.left = xPct + "%";
    reticle.style.top = yPct + "%";
    reticle.classList.add("show");
    const edgeRisk = penEdgeRisk(xPct, yPct);
    edgeWarn.classList.toggle("show", edgeRisk > 0.45);
  }

  function onDown(e) {
    e.preventDefault();
    dragging = true;
    startedAt = performance.now();
    const { xPct, yPct } = posFromEvent(e);
    updateReticle(xPct, yPct);
    loop();
  }
  function onMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const { xPct, yPct } = posFromEvent(e);
    updateReticle(xPct, yPct);
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false;
    if (rafId) cancelAnimationFrame(rafId);
    const elapsed = performance.now() - startedAt;
    const power = elapsed < 120 ? 45 : powerAtNow();
    goal.removeEventListener("pointerdown", onDown);
    goal.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    reticle.classList.remove("show");
    edgeWarn.classList.remove("show");
    resolvePenHomeKick(lastX, lastY, power);
  }

  goal.addEventListener("pointerdown", onDown);
  goal.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  _penAimHandlers = { goal, onDown, onMove, onUp };
}

function penEdgeRisk(xPct, yPct) {
  const postRisk = penClamp((16 - Math.min(xPct, 100 - xPct)) / 16, 0, 1);
  const barRisk = penClamp((16 - yPct) / 16, 0, 1);
  return penClamp(postRisk * 0.6 + barRisk * 0.6, 0, 1);
}

function resolvePenHomeKick(xPct, yPct, power) {
  const style = _pen.currentStyle || PEN_STYLES.categoria;

  if (style.snapCorner) {
    // Canto Fechado: empurra a mira pro canto extremo mais próximo
    xPct = xPct < 50 ? 6 : 94;
    yPct = yPct < 50 ? 10 : 90;
  }
  power = penClamp(power + (style.powerBias || 0), 0, 100);

  const zone = style.forceZone || penZoneOf(xPct, yPct);
  const edgeRisk = penEdgeRisk(xPct, yPct);
  const shooterAttrs = _pen.currentShooterAttrs;

  let missChance = penClamp(
    0.05 + edgeRisk * 0.30
    + (power > 92 ? (power - 92) / 8 * 0.35 : 0)
    + (power < 20 ? (20 - power) / 20 * 0.15 : 0)
    - shooterAttrs.shot / 1000
    + (style.missMod || 0),
    0.03, 0.55
  );

  const isMiss = Math.random() < missChance;

  // goleiro do time adversário (que está defendendo) escolhe o lado ÀS CEGAS
  const keeperAttrs = _pen.awayKeeperAttrs;
  const keeperZone = penPickCpuKeeperZone(_pen.cfg.opponentStrength, zone);

  let outcome;
  if (isMiss) {
    outcome = "miss";
  } else if (style.forceZone === "C") {
    // CAVADINHA: se o goleiro ficou parado no meio, defende fácil; se pulou, vira gol
    outcome = (keeperZone === "C" && Math.random() < 0.88) ? "save" : "goal";
  } else {
    let saveChance;
    if (keeperZone === zone) {
      const powerQuality = penClamp(1 - Math.abs(power - 72) / 72, 0, 1);
      saveChance = penClamp(0.30 + keeperAttrs.reflex / 260 - powerQuality * 0.35 + (style.saveMod || 0), 0.04, 0.8);
    } else if (keeperZone === "C" || zone === "C") {
      saveChance = penClamp(0.08 + keeperAttrs.reflex / 700 + (style.saveMod || 0) * 0.4, 0.01, 0.3);
    } else {
      saveChance = penClamp(0.02 + (style.saveMod || 0) * 0.2, 0, 0.1);
    }
    outcome = Math.random() < saveChance ? "save" : "goal";
  }

  animatePenKick({ shotZone: zone, keeperZone, outcome, animateKeeper: "away" }, () => {
    finishPenHomeKick(outcome);
  });
}

function penPickCpuKeeperZone(opponentStrength, actualZone) {
  // distribuição genérica de "leitura" do goleiro — não sabe o alvo real,
  // só tem uma chance pequena (ligada à força do adversário) de acertar
  // por pura qualidade de leitura de postura, sem trapaça.
  const readChance = penClamp((opponentStrength || 60) / 340, 0.05, 0.3);
  if (Math.random() < readChance) return actualZone;
  return PEN_ZONES[Math.floor(Math.random() * PEN_ZONES.length)];
}

function finishPenHomeKick(outcome) {
  _pen.homeTaken += 1;
  if (_pen.suddenDeath) _pen._suddenHomeDoneThisRound = _pen.suddenRound;
  else _pen.round = Math.max(_pen.round, _pen.homeTaken);

  if (outcome === "goal") { _pen.homeScore += 1; _pen.homeHistory.push("goal"); penSfxGoal(); penVibrate([30]); }
  else if (outcome === "save") { _pen.homeHistory.push("save"); penSfxSave(); }
  else { _pen.homeHistory.push("miss"); penSfxMiss(); }

  updatePenHud();

  setTimeout(() => {
    if (penCheckDecided()) return finalizePenalty();
    if (!_pen.suddenDeath && _pen.homeTaken >= PEN_MAX_ROUNDS && _pen.awayTaken >= PEN_MAX_ROUNDS) return runNextPenKick();
    runNextPenKick();
  }, 950);
}

/* ---------- Cobrança do COM (defesa = escolher o canto às cegas) ---------- */
function runPenAwayKick() {
  const idx = (_pen.suddenDeath ? (PEN_MAX_ROUNDS + _pen.suddenRound - 1) : _pen.round - 1);
  const shooter = _pen.awayShooters[idx % _pen.awayShooters.length];
  _pen.pendingAwayShooterAttrs = derivePenShooterAttrs(shooter);
  _pen.pendingAwayShooterName = shooter.name || "Cobrador do COM";

  document.getElementById("penCallout").innerHTML =
    `<span class="who">${_pen.pendingAwayShooterName}</span> (${_pen.cfg.awayTeamName}) vai cobrar — escolha o lado do goleiro!`;
  document.getElementById("penHint").textContent = "Toque num canto pra escolher pra onde o goleiro pula — antes de ver a cobrança.";
  document.getElementById("penPowerWrap").classList.add("hidden");
  document.getElementById("penStyles2").classList.add("hidden");
  resetPenBallAndKeeper();

  const wrap = document.getElementById("penDiveButtons");
  wrap.innerHTML = PEN_ZONES.map(z => {
    const p = PEN_ZONE_POS[z];
    return `<button class="pen-dive-btn" data-zone="${z}" style="left:${p.x}%;top:${p.y}%;">${PEN_ZONE_LABEL[z]}</button>`;
  }).join("");
  wrap.querySelectorAll(".pen-dive-btn").forEach(btn => {
    btn.onclick = () => {
      wrap.querySelectorAll(".pen-dive-btn").forEach(b => b.classList.remove("chosen"));
      btn.classList.add("chosen");
      penSfxPick();
      setTimeout(() => resolvePenAwayKick(btn.dataset.zone), 260);
    };
  });
}

function resolvePenAwayKick(keeperZone) {
  const wrap = document.getElementById("penDiveButtons");
  wrap.querySelectorAll(".pen-dive-btn").forEach(b => b.onclick = null);

  // COM escolhe estilo e mira com base na força do adversário — sem
  // nenhuma informação sobre o canto que o jogador já escolheu.
  const strength = _pen.cfg.opponentStrength || 60;
  const styleId = penPickCpuStyle(strength);
  const style = PEN_STYLES[styleId];
  let zone = style.forceZone || PEN_ZONES[Math.floor(Math.random() * PEN_ZONES.length)];
  if (style.snapCorner) {
    const corners = ["EA", "EB", "DA", "DB"];
    zone = corners[Math.floor(Math.random() * corners.length)];
  }
  const power = penClamp(60 + (strength - 60) / 2 + (Math.random() * 24 - 12) + (style.powerBias || 0), 0, 100);
  const shooterAttrs = _pen.pendingAwayShooterAttrs;

  let missChance = penClamp(
    0.06 + (power > 92 ? (power - 92) / 8 * 0.35 : 0) + (power < 20 ? (20 - power) / 20 * 0.15 : 0)
    - shooterAttrs.shot / 1000 + (style.missMod || 0),
    0.03, 0.5
  );
  const isMiss = Math.random() < missChance;
  const keeperAttrs = _pen.homeKeeperAttrs;

  let outcome;
  if (isMiss) {
    outcome = "miss";
  } else if (style.forceZone === "C") {
    outcome = (keeperZone === "C" && Math.random() < 0.88) ? "save" : "goal";
  } else {
    let saveChance;
    if (keeperZone === zone) {
      const powerQuality = penClamp(1 - Math.abs(power - 72) / 72, 0, 1);
      saveChance = penClamp(0.30 + keeperAttrs.reflex / 260 - powerQuality * 0.35 + (style.saveMod || 0), 0.04, 0.8);
    } else if (keeperZone === "C" || zone === "C") {
      saveChance = penClamp(0.08 + keeperAttrs.reflex / 700 + (style.saveMod || 0) * 0.4, 0.01, 0.3);
    } else {
      saveChance = penClamp(0.02 + (style.saveMod || 0) * 0.2, 0, 0.1);
    }
    outcome = Math.random() < saveChance ? "save" : "goal";
  }

  animatePenKick({ shotZone: zone, keeperZone, outcome, animateKeeper: "home" }, () => {
    finishPenAwayKick(outcome);
  });
}

function penPickCpuStyle(strength) {
  // times mais fortes arriscam mais (fechado/cavadinha); mais fracos jogam seguro
  const r = Math.random() * 100;
  if (strength >= 75) return r < 30 ? "fechado" : r < 50 ? "cavadinha" : r < 75 ? "forte" : "categoria";
  if (strength >= 55) return r < 15 ? "fechado" : r < 25 ? "cavadinha" : r < 60 ? "forte" : "categoria";
  return r < 10 ? "cavadinha" : r < 40 ? "forte" : "categoria";
}

function finishPenAwayKick(outcome) {
  _pen.awayTaken += 1;
  if (_pen.suddenDeath) _pen._suddenAwayDoneThisRound = _pen.suddenRound;

  if (outcome === "goal") { _pen.awayScore += 1; _pen.awayHistory.push("goal"); penSfxGoal(); }
  else if (outcome === "save") { _pen.awayHistory.push("save"); penSfxSave(); penVibrate([30]); }
  else { _pen.awayHistory.push("miss"); penSfxMiss(); }

  updatePenHud();

  setTimeout(() => {
    if (penCheckDecided()) return finalizePenalty();
    runNextPenKick();
  }, 950);
}

/* ---------- animação de bola/goleiro na revelação ---------- */
function animatePenKick(data, cb) {
  const ball = document.getElementById("penBall");
  const keeper = document.getElementById("penKeeper");
  const flash = document.getElementById("penGoal");

  const shotPos = PEN_ZONE_POS[data.shotZone];
  const keeperPos = PEN_ZONE_POS[data.keeperZone];

  document.getElementById("penDiveButtons").innerHTML = "";
  penSfxTension();

  requestAnimationFrame(() => {
    keeper.style.left = keeperPos.x + "%";
    keeper.style.top = keeperPos.y + "%";
    ball.style.left = shotPos.x + "%";
    ball.style.top = shotPos.y + "%";
    ball.style.transform = `translate(-50%,-50%) scale(${data.outcome === "miss" ? 0.7 : 0.85})`;
  });

  setTimeout(() => {
    const cls = data.outcome === "goal" ? "goal" : "stop";
    flash.classList.add("pen-flash", cls);
    const label = data.outcome === "goal" ? "GOOOL!" : data.outcome === "save" ? "DEFESA!" : "PRA FORA!";
    document.getElementById("penCallout").innerHTML = `<span class="who">${label}</span>`;
    setTimeout(() => flash.classList.remove("pen-flash", cls), 320);
    cb();
  }, 420);
}

/* =========================================================
   RESULTADO FINAL
   ========================================================= */
function penaltyDefaultWinCondition(score) {
  if (score.home > score.away) return { result: "win" };
  if (score.home < score.away) return { result: "loss" };
  return { result: "draw" };
}

function finalizePenalty() {
  _pen.finished = true;
  const score = { home: _pen.homeScore, away: _pen.awayScore };
  const outcome = _pen.cfg.winCondition ? _pen.cfg.winCondition(score) : penaltyDefaultWinCondition(score);

  const result = {
    homeGoals: score.home,
    awayGoals: score.away,
    result: outcome.result,
    usedHomeIds: Array.from(_pen.usedHomeIds),
    cardEvents: [],
    injuryEvents: [],
  };

  document.getElementById("penHud").classList.add("hidden");
  document.getElementById("penStage").classList.add("hidden");

  document.getElementById("penResultScore").textContent = `${score.home} - ${score.away}`;
  document.getElementById("penResultSub").textContent =
    outcome.result === "win" ? "Sua equipe venceu a disputa de pênaltis!" :
    outcome.result === "loss" ? "O adversário venceu a disputa de pênaltis." :
    "Disputa encerrada.";
  const titleEl = document.getElementById("penResultTitle");
  titleEl.textContent = outcome.result === "win" ? "Vitória nos pênaltis!" : outcome.result === "loss" ? "Derrota nos pênaltis" : "Fim de jogo";
  titleEl.className = `pen-result-title ${outcome.result}`;
  document.getElementById("penResult").classList.remove("hidden");

  if (outcome.result === "win") { penSfxGoal(); penVibrate([20, 40, 20, 60]); }
  else penSfxMiss();

  document.getElementById("penResultBtn").onclick = () => {
    document.getElementById("penOverlay").classList.add("hidden");
    if (typeof _pen.cfg.onComplete === "function") _pen.cfg.onComplete(result);
  };
}
