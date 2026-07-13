/* =========================================================
   MODO ARCADE — "Ataque vs Defesa"  (v2)
   Motor de ação em tempo real, em paralelo ao motor de QTE de
   js/matchsim.js. NÃO reaproveita nem altera matchsim.js.

   Uso (mesma assinatura de config que startMatch() usa hoje):

     startArcadeMatch({
       competitionLabel, title, homeTeamName, awayTeamName,
       homeLineup, opponentStrength, totalChances,
       winCondition(score) => {result:"win"|"draw"|"loss"},
       onComplete(result)
     });

   onComplete recebe o MESMO formato de objeto que matchsim.js:
     { homeGoals, awayGoals, result, usedHomeIds, cardEvents, injuryEvents }

   // TODO/decisão: nenhum sprite novo foi enviado nesta conversa (só uma
   // imagem de referência de estilo). Os personagens são desenhados
   // proceduralmente em canvas (pixel-art com torso/mangas/pernas/braços
   // articulados, goleiro com luvas e mergulho). Para trocar por sprites
   // reais no futuro, preencha ARCADE_SPRITES com Image() carregadas de
   // assets/arcade/ e use ctx.drawImage(...) dentro de drawCharacter() —
   // o resto do motor (física, IA, controles) não muda.

   // TODO/decisão: nenhum arquivo de áudio novo foi enviado. Os efeitos
   // são sintetizados via Web Audio API, respeitando STATE.settings.sound.
   ========================================================= */

const ARCADE_DEFAULTS = {
  competitionLabel: "Modo Arcade",
  title: "Ataque vs Defesa",
  homeTeamName: "Meu Clube",
  awayTeamName: "COM",
  homeLineup: null,
  opponentStrength: 60,
  totalChances: 10, // 8–12, configurável
  winCondition: null,
  onComplete: null,
};

const ARCADE_SPRITES = {}; // ver TODO acima

let _arcade = null;

/* =========================================================
   ATRIBUTOS DERIVADOS — ver spec, seção 5.
   ========================================================= */
const ARCADE_POS_PROFILE = {
  GOL: { pace: -10, dribble: -15, pass: -5,  shot: -25, physical: 5   },
  ZAG: { pace: -5,  dribble: -10, pass: -5,  shot: -15, physical: 10  },
  LAT: { pace: 12,  dribble: 2,   pass: 0,   shot: -10, physical: -2  },
  VOL: { pace: -4,  dribble: -4,  pass: 6,   shot: -8,  physical: 8   },
  MEI: { pace: 2,   dribble: 6,   pass: 10,  shot: 0,   physical: -4  },
  PON: { pace: 14,  dribble: 9,   pass: 0,   shot: 4,   physical: -8  },
  ATA: { pace: 6,   dribble: 6,   pass: -5,  shot: 16,  physical: 0   },
};

function arcClamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function arcLerp(a, b, t){ return a + (b - a) * t; }

function deriveArcadeAttributes(player){
  if(!player) player = { pos: "ATA", ovr: 68 };
  if(player.pace != null || player.dribbling != null){
    return {
      pace: player.pace ?? player.speed ?? 60,
      dribble: player.dribbling ?? player.dribble ?? 60,
      pass: player.passing ?? player.pass ?? 60,
      shot: player.shooting ?? player.shot ?? 60,
      physical: player.physical ?? 60,
    };
  }
  const ovr = arcClamp(player.ovr ?? player.overall ?? 68, 40, 99);
  const profile = ARCADE_POS_PROFILE[player.pos] || ARCADE_POS_PROFILE.ATA;
  return {
    pace: arcClamp(ovr + profile.pace, 30, 99),
    dribble: arcClamp(ovr + profile.dribble, 30, 99),
    pass: arcClamp(ovr + profile.pass, 30, 99),
    shot: arcClamp(ovr + profile.shot, 30, 99),
    physical: arcClamp(ovr + profile.physical, 30, 99),
  };
}

function pickArcadeAttacker(lineup){
  const fallback = { number: 9, name: "Atacante", pos: "ATA", ovr: 68 };
  if(!lineup || !lineup.length) return Object.assign({}, fallback, { attrs: deriveArcadeAttributes(fallback) });
  const order = ["ATA", "PON", "MEI", "VOL", "LAT", "ZAG", "GOL"];
  let best = null;
  order.some(bucket=>{
    const pool = lineup.filter(p => p.pos === bucket);
    if(pool.length){
      best = pool.reduce((a,b)=> ((b.ovr||0) > (a.ovr||0) ? b : a));
      return true;
    }
    return false;
  });
  if(!best) best = lineup[0];
  return Object.assign({}, best, { attrs: deriveArcadeAttributes(best) });
}

/* =========================================================
   ÁUDIO — sintetizado via Web Audio API
   ========================================================= */
let _arcAudioCtx = null;
function arcAudioOn(){ return !!(typeof STATE !== "undefined" && STATE.settings && STATE.settings.sound); }
function arcCtx(){
  if(!arcAudioOn()) return null;
  if(!_arcAudioCtx){
    try{ _arcAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ return null; }
  }
  if(_arcAudioCtx.state === "suspended") _arcAudioCtx.resume();
  return _arcAudioCtx;
}
function arcTone(freq, dur, type, vol, when){
  const ctx = arcCtx(); if(!ctx) return;
  const t0 = ctx.currentTime + (when || 0);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol ?? 0.14, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
function arcSweep(freqFrom, freqTo, dur, type, vol){
  const ctx = arcCtx(); if(!ctx) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type || "sawtooth";
  osc.frequency.setValueAtTime(freqFrom, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20,freqTo), t0 + dur);
  gain.gain.setValueAtTime(vol ?? 0.15, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function arcNoise(dur, vol){
  const ctx = arcCtx(); if(!ctx) return;
  const bufferSize = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufferSize);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol ?? 0.18, ctx.currentTime);
  src.connect(gain).connect(ctx.destination);
  src.start();
}
function arcSfxStep(){ if(Math.random()<0.4) arcTone(90+Math.random()*30, 0.045, "square", 0.025); }
function arcSfxKick(power){ arcNoise(0.1, 0.16); arcSweep(240 + power*120, 90, 0.16, "sawtooth", 0.16); }
function arcSfxGoal(){ arcTone(660,0.12,"triangle",0.2); arcTone(880,0.16,"triangle",0.2,0.1); arcTone(1100,0.22,"triangle",0.2,0.2); }
function arcSfxSave(){ arcTone(220,0.1,"square",0.14); arcNoise(0.08,0.12); }
function arcSfxPost(){ arcTone(950,0.1,"square",0.16); arcTone(500,0.08,"square",0.1,0.05); }
function arcSfxWhistle(){ arcTone(1500,0.35,"square",0.1); }
function arcSfxTackle(){ arcNoise(0.15,0.2); arcTone(140,0.12,"square",0.12); }
function arcSfxDive(){ arcNoise(0.1, 0.1); }
let _arcCrowdNode = null;
function arcCrowdStart(){
  const ctx = arcCtx(); if(!ctx || _arcCrowdNode) return;
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass"; filter.frequency.value = 500; filter.Q.value = 0.6;
  const gain = ctx.createGain(); gain.gain.value = 0.035;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  _arcCrowdNode = { src, gain };
}
function arcCrowdStop(){
  if(_arcCrowdNode){ try{ _arcCrowdNode.src.stop(); }catch(e){} _arcCrowdNode = null; }
}

/* =========================================================
   OVERLAY / DOM
   ========================================================= */
function ensureArcadeStyles(){
  if(document.getElementById("arcadeStyles")) return;
  const style = document.createElement("style");
  style.id = "arcadeStyles";
  style.textContent = `
  .arcade-overlay{position:fixed;inset:0;background:#0b1220;z-index:9999;display:flex;flex-direction:column;font-family:var(--font-body);color:#fff;}
  .arcade-overlay.hidden{display:none;}
  .arcade-intro,.arcade-result{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;}
  .arcade-comp-label{font-family:var(--font-display);font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);}
  .arcade-vs-row{display:flex;align-items:center;gap:14px;font-family:var(--font-display);font-size:20px;}
  .arcade-vs-badge{background:var(--brand);border-radius:var(--radius-sm);padding:4px 10px;font-size:13px;}
  .arcade-sub{color:#B9C2CE;font-size:13px;max-width:320px;line-height:1.5;}
  .arcade-btn{border:none;border-radius:var(--radius-md);padding:14px 28px;font-family:var(--font-display);font-size:16px;background:var(--brand);color:#fff;box-shadow:var(--shadow-card);}
  .arcade-btn:active{transform:scale(0.97);}
  .arcade-result-score{font-family:var(--font-display);font-size:42px;}
  .arcade-result-title{font-family:var(--font-display);font-size:24px;}
  .arcade-result-title.win{color:var(--turf);}
  .arcade-result-title.loss{color:var(--crimson);}
  .arcade-result-title.draw{color:var(--gold);}
  .arcade-hud{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#0b1220;border-bottom:1px solid rgba(255,255,255,.08);font-family:var(--font-display);font-size:13px;flex-shrink:0;}
  .arcade-hud .side{display:flex;align-items:center;gap:8px;min-width:70px;}
  .arcade-hud .goals{font-size:20px;}
  .arcade-hud .mid{text-align:center;color:#B9C2CE;font-family:var(--font-body);font-size:11px;}
  .arcade-stage{position:relative;flex:1;overflow:hidden;touch-action:none;background:#173a1d;}
  .arcade-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
  .arcade-toast{position:absolute;top:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);padding:6px 14px;border-radius:999px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none;z-index:5;}
  .arcade-toast.show{opacity:1;}
  .arcade-joy-base{position:absolute;left:20px;bottom:26px;width:110px;height:110px;border-radius:50%;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.25);touch-action:none;}
  .arcade-joy-stick{position:absolute;left:35px;top:35px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.55);pointer-events:none;}
  .arcade-shoot-btn{position:absolute;right:24px;bottom:30px;width:78px;height:78px;border-radius:50%;background:var(--gold);border:3px solid var(--gold-dim);color:#3a2c00;font-family:var(--font-display);font-size:13px;touch-action:none;box-shadow:var(--shadow-card);}
  .arcade-shoot-btn:active{transform:scale(0.94);}
  .arcade-chip-btn{position:absolute;right:24px;bottom:120px;width:52px;height:52px;border-radius:50%;background:var(--surface-2, #eee);border:2px solid var(--brand);color:var(--brand-dim, #0F6FD1);font-family:var(--font-display);font-size:10px;touch-action:none;}
  .arcade-charge-track{position:absolute;right:112px;bottom:34px;width:10px;height:70px;border-radius:6px;background:rgba(255,255,255,.15);overflow:hidden;}
  .arcade-charge-fill{position:absolute;bottom:0;left:0;width:100%;height:0%;background:var(--crimson);}
  .arcade-shake{animation:arcadeShake .32s ease;}
  @keyframes arcadeShake{
    0%{transform:translate(0,0);} 20%{transform:translate(-6px,3px);} 40%{transform:translate(5px,-4px);}
    60%{transform:translate(-4px,2px);} 80%{transform:translate(3px,-2px);} 100%{transform:translate(0,0);}
  }
  `;
  document.head.appendChild(style);
}

function ensureArcadeOverlay(){
  ensureArcadeStyles();
  if(document.getElementById("arcadeOverlay")) return;
  const div = document.createElement("div");
  div.className = "arcade-overlay hidden";
  div.id = "arcadeOverlay";
  div.innerHTML = `
    <div class="arcade-intro" id="arcadeIntro">
      <div class="arcade-comp-label" id="arcadeCompLabel">Modo Arcade</div>
      <div class="arcade-vs-row">
        <span id="arcadeHomeName">Meu Clube</span>
        <span class="arcade-vs-badge">VS</span>
        <span id="arcadeAwayName">COM</span>
      </div>
      <div class="arcade-sub" id="arcadeIntroSub"></div>
      <button class="arcade-btn" id="arcadeStartBtn">Entrar em campo ›</button>
    </div>

    <div class="arcade-hud hidden" id="arcadeHud">
      <div class="side"><span class="goals" id="arcadeHomeGoals">0</span></div>
      <div class="mid"><div id="arcadeAttackProgress">Ataque 1/10</div></div>
      <div class="side"><span class="goals" id="arcadeAwayGoals">0</span></div>
    </div>

    <div class="arcade-stage hidden" id="arcadeStage">
      <canvas id="arcadeCanvas"></canvas>
      <div class="arcade-toast" id="arcadeToast"></div>
      <div class="arcade-joy-base" id="arcadeJoyBase"><div class="arcade-joy-stick" id="arcadeJoyStick"></div></div>
      <div class="arcade-charge-track"><div class="arcade-charge-fill" id="arcadeChargeFill"></div></div>
      <button class="arcade-chip-btn" id="arcadeChipBtn">CAVA-<br>DINHA</button>
      <button class="arcade-shoot-btn" id="arcadeShootBtn">CHUTAR</button>
    </div>

    <div class="arcade-result hidden" id="arcadeResult">
      <div class="arcade-result-title" id="arcadeResultTitle">Vitória!</div>
      <div class="arcade-result-score" id="arcadeResultScore">3 - 1</div>
      <button class="arcade-btn" id="arcadeResultBtn">Continuar</button>
    </div>
  `;
  document.body.appendChild(div);
  wireArcadeInput();
}

/* =========================================================
   ENTRADA
   ========================================================= */
let _arcInputWired = false;
function wireArcadeInput(){
  if(_arcInputWired) return;
  _arcInputWired = true;

  const joyBase = document.getElementById("arcadeJoyBase");
  const joyStick = document.getElementById("arcadeJoyStick");
  const shootBtn = document.getElementById("arcadeShootBtn");
  const chipBtn = document.getElementById("arcadeChipBtn");

  const joyRadius = 55;
  let joyActive = false;
  let joyStart = null;
  let lastTapTime = 0, lastTapX = 0, lastTapY = 0;

  function joyVector(clientX, clientY){
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    let dx = clientX - cx, dy = clientY - cy;
    const d = Math.hypot(dx, dy);
    if(d > joyRadius){ dx = dx/d*joyRadius; dy = dy/d*joyRadius; }
    joyStick.style.left = (35 + dx) + "px";
    joyStick.style.top = (35 + dy) + "px";
    return { x: dx/joyRadius, y: dy/joyRadius };
  }

  joyBase.addEventListener("pointerdown", (e)=>{
    joyBase.setPointerCapture(e.pointerId);
    joyActive = true;
    joyStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    if(_arcade) _arcade.input.move = joyVector(e.clientX, e.clientY);
    const now = performance.now();
    if(now - lastTapTime < 320 && Math.hypot(e.clientX-lastTapX, e.clientY-lastTapY) < 40){
      triggerArcadeDribble();
    }
    lastTapTime = now; lastTapX = e.clientX; lastTapY = e.clientY;
  });
  joyBase.addEventListener("pointermove", (e)=>{
    if(!joyActive || !_arcade) return;
    _arcade.input.move = joyVector(e.clientX, e.clientY);
  });
  function joyRelease(e){
    if(!joyActive) return;
    joyActive = false;
    joyStick.style.left = "35px"; joyStick.style.top = "35px";
    if(_arcade) _arcade.input.move = { x:0, y:0 };
    if(joyStart){
      const dt = performance.now() - joyStart.t;
      const dist = Math.hypot(e.clientX - joyStart.x, e.clientY - joyStart.y);
      if(dt < 220 && dist > 46) triggerArcadeDribble();
    }
    joyStart = null;
  }
  joyBase.addEventListener("pointerup", joyRelease);
  joyBase.addEventListener("pointercancel", joyRelease);

  shootBtn.addEventListener("pointerdown", (e)=>{
    shootBtn.setPointerCapture(e.pointerId);
    if(!_arcade || _arcade.phase !== "playing" || !_arcade.player.hasBall) return;
    _arcade.charging = true;
    _arcade._chargeStart = performance.now();
  });
  function releaseShot(){
    if(!_arcade || !_arcade.charging) return;
    _arcade.charging = false;
    const power = arcClamp((performance.now() - _arcade._chargeStart) / 1100, 0.12, 1);
    document.getElementById("arcadeChargeFill").style.height = "0%";
    fireArcadeShot(power, false);
  }
  shootBtn.addEventListener("pointerup", releaseShot);
  shootBtn.addEventListener("pointercancel", releaseShot);

  chipBtn.addEventListener("pointerdown", (e)=>{
    chipBtn.setPointerCapture(e.pointerId);
    if(!_arcade || _arcade.phase !== "playing" || !_arcade.player.hasBall) return;
    _arcade.charging = false;
    document.getElementById("arcadeChargeFill").style.height = "0%";
    fireArcadeShot(0.55, true);
  });
}

function triggerArcadeDribble(){
  if(!_arcade || _arcade.phase !== "playing") return;
  if(performance.now() - (_arcade.lastDribbleAt||0) < 650) return;
  _arcade.lastDribbleAt = performance.now();
  attemptArcadeDribble();
}

/* =========================================================
   INÍCIO DA PARTIDA
   ========================================================= */
function startArcadeMatch(userConfig){
  const cfg = Object.assign({}, ARCADE_DEFAULTS, userConfig || {});
  cfg.totalChances = arcClamp(Math.round(cfg.totalChances || 10), 8, 12);

  const attackerRaw = pickArcadeAttacker(cfg.homeLineup);

  _arcade = {
    cfg,
    attackerInfo: attackerRaw,
    attrs: attackerRaw.attrs || deriveArcadeAttributes(attackerRaw),
    attackIndex: 0,
    homeGoals: 0,
    awayGoals: 0,
    usedHomeIds: new Set(attackerRaw.id ? [attackerRaw.id] : []),
    cardEvents: [],
    injuryEvents: [],
    phase: "intro", // intro | playing | shooting | idle | done
    input: { move: {x:0,y:0} },
    charging: false,
    lastDribbleAt: 0,
    freezeUntil: 0,
    field: { w: 400, h: 900, goalY: 100, startY: 780 },
    running: false,
  };

  ensureArcadeOverlay();
  document.getElementById("arcadeCompLabel").textContent = cfg.competitionLabel;
  document.getElementById("arcadeHomeName").textContent = cfg.homeTeamName;
  document.getElementById("arcadeAwayName").textContent = cfg.awayTeamName;
  document.getElementById("arcadeIntroSub").textContent =
    `Você controla ${attackerRaw.name} em ${cfg.totalChances} ataques seguidos contra a defesa do ${cfg.awayTeamName}. ` +
    `Arraste o analógico pra correr, puxe rápido pro lado (ou toque duas vezes) pra tentar o drible, ` +
    `segure o botão dourado pra carregar o chute e solte pra finalizar. O botão azul manda de cavadinha.`;

  document.getElementById("arcadeIntro").classList.remove("hidden");
  document.getElementById("arcadeHud").classList.add("hidden");
  document.getElementById("arcadeStage").classList.add("hidden");
  document.getElementById("arcadeResult").classList.add("hidden");
  document.getElementById("arcadeOverlay").classList.remove("hidden");

  document.getElementById("arcadeStartBtn").onclick = ()=>{
    document.getElementById("arcadeIntro").classList.add("hidden");
    document.getElementById("arcadeHud").classList.remove("hidden");
    document.getElementById("arcadeStage").classList.remove("hidden");
    arcSfxWhistle();
    arcCrowdStart();
    setupArcadeCanvas();
    _arcade.running = true;
    requestAnimationFrame(arcadeLoop);
    nextArcadeAttack();
  };
}

function setupArcadeCanvas(){
  const canvas = document.getElementById("arcadeCanvas");
  const stage = document.getElementById("arcadeStage");
  function resize(){
    canvas.width = stage.clientWidth * (window.devicePixelRatio || 1);
    canvas.height = stage.clientHeight * (window.devicePixelRatio || 1);
    _arcade.viewW = stage.clientWidth;
    _arcade.viewH = stage.clientHeight;
  }
  resize();
  window.addEventListener("resize", resize);
  _arcade.canvas = canvas;
  _arcade.ctx = canvas.getContext("2d");
}

/* =========================================================
   CONFIGURAÇÃO DE CADA ATAQUE
   ========================================================= */
function arcadeDefenderCount(oStr){
  return arcClamp(Math.round(2 + oStr/40), 2, 4);
}

function nextArcadeAttack(){
  if(!_arcade) return;
  if(_arcade.attackIndex >= _arcade.cfg.totalChances){
    finishArcadeMatch();
    return;
  }
  _arcade.attackIndex++;
  document.getElementById("arcadeAttackProgress").textContent =
    `Ataque ${_arcade.attackIndex}/${_arcade.cfg.totalChances}`;

  const field = _arcade.field;
  const oStr = _arcade.cfg.opponentStrength;

  _arcade.player = {
    x: field.w/2 + (Math.random()*60-30),
    y: field.startY,
    vx: 0, vy: 0,
    facing: 1,
    hasBall: true,
    kicking: 0,
    walkPhase: 0,
    invuln: 0,
  };
  _arcade.ball = {
    x: _arcade.player.x, y: _arcade.player.y - 20, z: 0,
    flying: false, bouncePhase: 0,
  };

  const dCount = arcadeDefenderCount(oStr);
  _arcade.defenders = Array.from({length: dCount}, (_,i)=>{
    const marking = arcClamp(oStr + (Math.random()*14-7), 22, 99);
    const pace = arcClamp(oStr + (Math.random()*14-7), 22, 99);
    return {
      x: field.w/2 + (i - (dCount-1)/2) * 95 + (Math.random()*20-10),
      y: field.goalY + 210 + Math.random()*130,
      slot: i,
      marking, pace,
      role: "cover", // cover | marker
      posture: "run", // run | jockey | lunge | stunned
      stunUntil: 0,
      nextCommitAt: performance.now() + 400 + Math.random()*500,
      lungeUntil: 0,
      facing: 1,
      walkPhase: Math.random()*10,
    };
  });

  _arcade.gk = {
    x: field.w/2,
    y: field.goalY - 4,
    reaction: arcClamp(oStr, 20, 99),
    advanced: false,
    advancedUntil: 0,
    diving: false,
    diveDir: 0,
    diveUntil: 0,
  };

  _arcade.timeLeft = 12;
  _arcade.phase = "playing";
  _arcade.charging = false;
}

/* =========================================================
   LOOP PRINCIPAL
   ========================================================= */
let _arcLastTs = 0;
function arcadeLoop(ts){
  if(!_arcade || !_arcade.running) return;
  const dt = Math.min(0.05, (ts - (_arcLastTs || ts)) / 1000);
  _arcLastTs = ts;
  updateArcade(dt);
  renderArcade();
  requestAnimationFrame(arcadeLoop);
}

function updateArcade(dt){
  const a = _arcade;

  // keeper avançando aleatoriamente da linha (afeta cavadinha)
  const gk = a.gk;
  const now = performance.now();
  if(now > gk.advancedUntil && Math.random() < 0.0035 * (1 + (60-a.cfg.opponentStrength)/60)){
    gk.advanced = true;
    gk.advancedUntil = now + 850;
  }
  if(now > gk.advancedUntil) gk.advanced = false;

  // hit-stop: pausa física por um instante em impactos, sem travar o render
  if(now < a.freezeUntil) return;

  if(a.phase !== "playing"){ return; }

  a.timeLeft -= dt;
  if(a.timeLeft <= 0){
    endArcadeAttack("out");
    return;
  }

  const p = a.player;
  const attrs = a.attrs;
  const maxSpeed = 115 + attrs.pace * 1.9;
  const accel = 900;

  const mv = a.input.move;
  const mvLen = Math.hypot(mv.x, mv.y);
  const dirX = mvLen > 0.15 ? mv.x/Math.max(mvLen,1) : 0;
  const dirY = mvLen > 0.15 ? mv.y/Math.max(mvLen,1) : 0;

  p.vx += dirX * accel * dt;
  p.vy += dirY * accel * dt;
  const speed = Math.hypot(p.vx, p.vy);
  if(speed > maxSpeed){ p.vx = p.vx/speed*maxSpeed; p.vy = p.vy/speed*maxSpeed; }
  p.vx *= 0.84; p.vy *= 0.84;

  p.x = arcClamp(p.x + p.vx*dt, 26, a.field.w - 26);
  p.y = arcClamp(p.y + p.vy*dt, a.field.goalY + 40, a.field.startY + 40);
  if(Math.abs(p.vx) > 6) p.facing = p.vx > 0 ? 1 : -1;

  if(speed > 8){
    p.walkPhase += dt * (5 + speed/35);
    if(Math.random() < dt*3.2) arcSfxStep();
  }
  if(p.invuln > 0) p.invuln -= dt;

  if(p.hasBall){
    // bola gruda um pouco à frente do movimento, com leve atraso (mais viva)
    const targetBX = p.x + dirX*10;
    const targetBY = p.y - 18 + dirY*6;
    a.ball.x = arcLerp(a.ball.x, targetBX, Math.min(1, dt*14));
    a.ball.y = arcLerp(a.ball.y, targetBY, Math.min(1, dt*14));
    a.ball.bouncePhase = p.walkPhase;
  }

  updateArcadeDefenders(dt);
  updateArcadeGK(dt);
}

/* =========================================================
   IA DOS DEFENSORES — postura, marcação e desarme por decisão,
   não por sorteio a cada frame. Escala com opponentStrength.
   ========================================================= */
function updateArcadeDefenders(dt){
  const a = _arcade;
  const p = a.player;
  const field = a.field;
  const oStr = a.cfg.opponentStrength;
  const now = performance.now();

  // define quem é o marcador (defensor mais perto do atacante)
  let marker = null, markerDist = Infinity;
  a.defenders.forEach(d=>{
    if(d.posture === "stunned") return;
    const dist = Math.hypot(d.x-p.x, d.y-p.y);
    if(dist < markerDist){ markerDist = dist; marker = d; }
  });
  // perto da área, um segundo defensor também pressiona (dobra de marcação)
  const nearGoal = p.y < field.goalY + 240;

  a.defenders.forEach(d=>{
    if(d.posture === "stunned"){
      if(now > d.stunUntil) d.posture = "run";
      return;
    }
    const distToPlayer = Math.hypot(d.x-p.x, d.y-p.y);
    const isMarker = (d === marker) || (nearGoal && distToPlayer < 150);
    d.role = isMarker ? "marker" : "cover";

    let targetX, targetY, speedMul = 1;

    if(d.posture === "lunge"){
      if(now > d.lungeUntil){ d.posture = "jockey"; }
      targetX = p.x; targetY = p.y;
      speedMul = 1.7;
    } else if(d.role === "marker" && distToPlayer < 150){
      d.posture = "jockey";
      // fica a uma distância curta entre o atacante e o gol, acompanhando
      // o vetor de movimento do atacante (leve antecipação)
      const goalX = field.w/2, goalY = field.goalY;
      const toGoalX = goalX - p.x, toGoalY = goalY - p.y;
      const toGoalLen = Math.hypot(toGoalX, toGoalY) || 1;
      const standoff = 30;
      targetX = p.x + (toGoalX/toGoalLen)*standoff + p.vx*0.06;
      targetY = p.y + (toGoalY/toGoalLen)*standoff + p.vy*0.06;

      // decide, em janelas de tempo (não todo frame), se comete o carrinho
      if(now > d.nextCommitAt){
        const commitChance = arcClamp(0.18 + (d.marking - 50)/220, 0.08, 0.55);
        const closeEnough = distToPlayer < 46;
        if(closeEnough && p.hasBall && p.invuln <= 0 && Math.random() < commitChance){
          d.posture = "lunge";
          d.lungeUntil = now + 260;
          d._committed = true;
        }
        d.nextCommitAt = now + arcLerp(900, 380, oStr/99) + Math.random()*300;
      }
    } else {
      d.posture = "run";
      // linha de cobertura: mantém forma defensiva entre a bola e o gol,
      // espalhados pelo campo conforme o "slot" de cada um
      const goalX = field.w/2, goalY = field.goalY;
      const spread = (d.slot - (a.defenders.length-1)/2) * 70;
      targetX = arcClamp(goalX + spread + (p.x-goalX)*0.35, 30, field.w-30);
      targetY = Math.max(p.y - 150, goalY + 90);
    }

    const dx = targetX - d.x, dy = targetY - d.y;
    const dist = Math.hypot(dx,dy) || 1;
    const dSpeed = (55 + d.pace*1.15) * speedMul * dt;
    d.x += (dx/dist) * Math.min(dSpeed, dist);
    d.y += (dy/dist) * Math.min(dSpeed, dist);
    if(Math.abs(dx) > 4) d.facing = dx > 0 ? 1 : -1;
    d.walkPhase += dt * (4 + dSpeed);

    // resolve o carrinho no instante do "lunge" (não fica rolando por frame)
    if(d.posture === "lunge" && d._committed){
      const contactDist = Math.hypot(d.x-p.x, d.y-p.y);
      if(contactDist < 30){
        d._committed = false;
        resolveArcadeTackle(d);
      } else if(now > d.lungeUntil - 20){
        d._committed = false; // errou o carrinho, segue jogo
      }
    }
  });
}

function updateArcadeGK(dt){
  const a = _arcade;
  const gk = a.gk;
  if(gk.diving){
    if(performance.now() > gk.diveUntil) gk.diving = false;
    return;
  }
  // corta o ângulo: quanto mais perto o atacante chega, mais o goleiro
  // se compromete lateralmente em vez de ficar sempre no meio do gol
  const field = a.field;
  const distToGoal = arcClamp((a.player.y - field.goalY) / 500, 0, 1);
  const angleFactor = arcLerp(0.85, 0.32, distToGoal);
  const targetX = arcClamp(field.w/2 + (a.player.x - field.w/2)*angleFactor, field.w/2-46, field.w/2+46);
  const gkSpeed = (46 + gk.reaction*0.55) * dt;
  const dx = targetX - gk.x;
  gk.x += Math.sign(dx) * Math.min(Math.abs(dx), gkSpeed);
  gk.y = field.goalY - 4 + (gk.advanced ? 40 : 0);
}

function resolveArcadeTackle(defender){
  const a = _arcade;
  if(a.phase !== "playing") return;
  defender.posture = "stunned";
  defender.stunUntil = performance.now() + 550;
  a.player.hasBall = false;
  arcSfxTackle();
  shakeArcade(200);
  a.freezeUntil = performance.now() + 80; // hit-stop
  arcadeToast("Desarme! A defesa tirou a bola.");
  endArcadeAttack("turnover");
}

/* =========================================================
   DRIBLE
   ========================================================= */
function attemptArcadeDribble(){
  const a = _arcade;
  if(!a || a.phase !== "playing" || !a.player.hasBall) return;
  const p = a.player;
  let nearest = null, nearestDist = Infinity;
  a.defenders.forEach(d=>{
    if(d.posture === "stunned") return;
    const dist = Math.hypot(d.x-p.x, d.y-p.y);
    if(dist < nearestDist){ nearestDist = dist; nearest = d; }
  });
  if(!nearest || nearestDist > 95){
    p.vx *= 1.3; p.vy *= 1.3;
    return;
  }
  const successChance = arcClamp(0.5 + (a.attrs.dribble - nearest.marking) / 160, 0.12, 0.92);
  if(Math.random() < successChance){
    p.invuln = 0.55;
    p.vx *= 1.8; p.vy *= 1.8;
    nearest.posture = "stunned";
    nearest.stunUntil = performance.now() + 480;
    arcadeToast("Boa! Passou do marcador.");
    arcTone(520, 0.08, "triangle", 0.12);
  } else {
    arcadeToast("Perdeu o domínio no drible!");
    if(Math.random() < 0.55){
      resolveArcadeTackle(nearest);
    } else {
      p.vx *= 0.4; p.vy *= 0.4;
    }
  }
}

/* =========================================================
   CHUTE — agora com voo de bola de verdade (não só sorteio instantâneo)
   ========================================================= */
function fireArcadeShot(power, isChip){
  const a = _arcade;
  if(!a || a.phase !== "playing" || !a.player.hasBall) return;
  a.phase = "shooting";
  a.player.hasBall = false;
  a.player.kicking = 0.3;
  arcSfxKick(power);
  a.freezeUntil = performance.now() + 40;

  const field = a.field;
  const goalX = field.w/2;
  const p = a.player;

  const accuracy = a.attrs.shot / 99;
  const wobble = (1 - accuracy) * 55 * (isChip ? 0.55 : 1);
  const lateralBias = arcClamp((p.x - goalX) * -0.22, -38, 38);
  const targetOffset = arcClamp(lateralBias + (Math.random()*2-1)*wobble, -55, 55);
  const targetX = goalX + targetOffset;
  const targetY = field.goalY - 10;

  let saveChance;
  if(isChip){
    saveChance = a.gk.advanced ? 0.1 : 0.42;
    saveChance -= accuracy * 0.1;
  } else {
    const gkSkill = a.gk.reaction/99;
    const placementFactor = Math.abs(targetOffset)/55;
    saveChance = arcClamp(0.3 + gkSkill*0.45 - power*0.22 - placementFactor*0.25, 0.05, 0.85);
  }
  const blocker = a.defenders.some(d => d.posture!=="stunned" && Math.hypot(d.x-p.x, d.y-p.y) < 42);
  if(blocker) saveChance += 0.1;

  const postChance = 0.05;
  const roll = Math.random();
  const isPost = roll < postChance;
  const isSave = !isPost && roll < postChance + saveChance;

  // duração do voo: chutes fortes chegam mais rápido; cavadinha demora mais
  const dist = Math.hypot(targetX-p.x, targetY-p.y);
  const flightMs = isChip
    ? arcLerp(650, 520, power) + dist*0.4
    : arcLerp(560, 260, power) + dist*0.25;
  const apexHeight = isChip ? 46 : 14 + power*8;

  a.gk._pendingDiveDelay = arcLerp(360, 120, a.gk.reaction/99);

  a.ball.flying = true;
  a.ball.from = { x: p.x, y: p.y - 18 };
  a.ball.to = { x: targetX, y: targetY };
  a.ball.startTime = performance.now();
  a.ball.duration = flightMs;
  a.ball.apex = apexHeight;
  a.ball.outcome = isPost ? "post" : (isSave ? "save" : "goal");
  a.ball.gkDiveDir = Math.sign(targetX - a.gk.x) || 1;

  setTimeout(()=>{
    const gk = a.gk;
    gk.diving = true;
    gk.diveDir = a.ball.gkDiveDir;
    gk.diveUntil = performance.now() + 500;
    if(a.ball.outcome === "save") arcSfxDive();
  }, Math.max(0, flightMs - a.gk._pendingDiveDelay));

  setTimeout(()=> resolveArcadeShotOutcome(a.ball.outcome), flightMs);
}

function resolveArcadeShotOutcome(outcome){
  const a = _arcade;
  if(!a) return;
  a.ball.flying = false;
  if(outcome === "post"){
    arcSfxPost();
    shakeArcade(140);
    a.freezeUntil = performance.now() + 60;
    arcadeToast("Na trave! Quase!");
    endArcadeAttack("post");
  } else if(outcome === "save"){
    arcSfxSave();
    shakeArcade(150);
    a.freezeUntil = performance.now() + 70;
    arcadeToast("Defesaaa do goleiro!");
    endArcadeAttack("save");
  } else {
    a.homeGoals++;
    document.getElementById("arcadeHomeGoals").textContent = a.homeGoals;
    arcSfxGoal();
    shakeArcade(280);
    a.freezeUntil = performance.now() + 120;
    arcadeToast("GOOOOL!");
    endArcadeAttack("goal");
  }
}

function endArcadeAttack(reason){
  const a = _arcade;
  if(!a) return;
  a.phase = "idle";
  setTimeout(()=>{
    if(!a || a.phase === "done") return;
    nextArcadeAttack();
  }, 950);
}

/* =========================================================
   FEEDBACK VISUAL
   ========================================================= */
function shakeArcade(ms){
  const stage = document.getElementById("arcadeStage");
  stage.classList.remove("arcade-shake");
  void stage.offsetWidth;
  stage.classList.add("arcade-shake");
  setTimeout(()=> stage.classList.remove("arcade-shake"), ms || 300);
}

let _arcToastTimer = null;
function arcadeToast(msg){
  const el = document.getElementById("arcadeToast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_arcToastTimer);
  _arcToastTimer = setTimeout(()=> el.classList.remove("show"), 1400);
}

/* =========================================================
   RENDER — pixel-art procedural (ver TODO no topo do arquivo)
   ========================================================= */
function drawArcadeShadow(ctx, x, y, r, alpha){
  ctx.fillStyle = `rgba(0,0,0,${alpha ?? 0.28})`;
  ctx.beginPath();
  ctx.ellipse(x, y+4, r, r*0.38, 0, 0, Math.PI*2);
  ctx.fill();
}

/* Boneco articulado: cabeça, tronco com mangas, calção, pernas em passada
   e braços contrários às pernas. Espelha conforme a direção (facing). */
function drawCharacter(ctx, x, y, opts){
  const facing = opts.facing || 1;
  const walk = opts.walkPhase || 0;
  const isGK = !!opts.isGK;
  const diveDir = opts.diveDir || 0;
  const kick = opts.kicking || 0;
  const stride = opts.moving ? Math.sin(walk) : 0;
  const bob = opts.moving ? Math.abs(Math.sin(walk))*1.6 : 0;

  drawArcadeShadow(ctx, x, y, isGK ? 13 : 11, opts.shadowAlpha);

  ctx.save();
  ctx.translate(x, y - 15 - bob);
  ctx.scale(facing, 1);

  if(diveDir !== 0){
    // goleiro mergulhando: corpo esticado na horizontal
    ctx.rotate(diveDir === facing ? 1.15 : -1.15);
  }

  // perna de trás
  ctx.fillStyle = opts.shortsColor || "#f4f6fa";
  ctx.fillRect(-2, 6, 6, 5);
  ctx.fillStyle = "#12161f";
  ctx.fillRect(-3 - stride*5, 10, 5, 9 - kick*3);
  ctx.fillStyle = "#0a0d13";
  ctx.fillRect(-4 - stride*5, 18 - kick*3, 6, 3);

  // perna da frente (a que chuta)
  ctx.fillStyle = "#12161f";
  const kickExt = kick > 0 ? 8 : 0;
  ctx.save();
  if(kick > 0) ctx.rotate(-0.9);
  ctx.fillRect(0 + stride*5, 10, 5, 9 + kickExt);
  ctx.fillStyle = "#0a0d13";
  ctx.fillRect(-1 + stride*5, 18 + kickExt, 6, 3);
  ctx.restore();

  // braço de trás
  ctx.fillStyle = opts.skinColor || "#e8b58a";
  ctx.fillRect(-9 - stride*3, -4, 3, 8);
  // tronco / camisa
  ctx.fillStyle = opts.color;
  ctx.fillRect(-8, -12, 16, 15);
  // mangas
  ctx.fillStyle = opts.sleeveColor || opts.color;
  ctx.fillRect(-8, -12, 3, 7);
  ctx.fillRect(5, -12, 3, 7);
  // número
  if(opts.number){
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.save(); ctx.scale(facing,1);
    ctx.fillText(String(opts.number), 0, -2);
    ctx.restore();
  }
  // calção
  ctx.fillStyle = opts.shortsColor || "#f4f6fa";
  ctx.fillRect(-7, 1, 14, 6);
  // braço da frente
  ctx.fillStyle = opts.skinColor || "#e8b58a";
  ctx.fillRect(6 + stride*3, -4, 3, 8);
  if(isGK){
    ctx.fillStyle = "#fff";
    ctx.fillRect(7 + stride*3, 2, 4, 4); // luva
    ctx.fillRect(-11 - stride*3, 2, 4, 4);
  }
  // cabeça
  ctx.fillStyle = opts.skinColor || "#e8b58a";
  ctx.fillRect(-6, -22, 12, 10);
  ctx.fillStyle = opts.hairColor || "#2a1c12";
  ctx.fillRect(-6, -22, 12, 3);

  ctx.restore();
}

function drawArcadeBall(ctx, x, y, z, spin){
  const r = 5 + Math.max(0, z)*0.04;
  const drawY = y - z;
  ctx.save();
  ctx.translate(x, drawY);
  ctx.rotate(spin || 0);
  ctx.fillStyle = "#fdfdfd";
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath(); ctx.arc(0,0,r*0.35,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(r*0.35,0);
  for(let i=0;i<5;i++){
    const ang = (i/5)*Math.PI*2;
    ctx.lineTo(Math.cos(ang)*r*0.9, Math.sin(ang)*r*0.9);
    ctx.moveTo(r*0.35,0);
  }
  ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.restore();
}

function drawArcadeField(ctx, field){
  ctx.save();

  // arquibancada / fundo do estádio, atrás do gol
  const standH = 90;
  for(let sy = field.goalY - standH; sy < field.goalY; sy += 8){
    for(let sx = 0; sx < field.w; sx += 10){
      const on = ((Math.floor(sx/10) + Math.floor((sy-(field.goalY-standH))/8)) % 2) === 0;
      ctx.fillStyle = on ? "#1c3a63" : "#d97b3f";
      ctx.fillRect(sx, sy, 10, 8);
    }
  }
  ctx.fillStyle = "#0d1420";
  ctx.fillRect(0, field.goalY - 22, field.w, 22);

  // placas de publicidade genéricas (sem marcas reais)
  const boardColors = ["#198CFF", "#2FB86B", "#FFC93C", "#E63950"];
  for(let bx=0, i=0; bx < field.w; bx += 66, i++){
    ctx.fillStyle = boardColors[i % boardColors.length];
    ctx.fillRect(bx+2, field.goalY - 20, 60, 16);
  }

  // gramado
  const stripeH = 55;
  for(let y = field.goalY; y < field.h; y += stripeH){
    ctx.fillStyle = (Math.floor((y-field.goalY)/stripeH) % 2 === 0) ? "#1f7a34" : "#248a3b";
    ctx.fillRect(0, y, field.w, stripeH);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, field.goalY, field.w-12, field.h - field.goalY - 6);
  ctx.strokeRect(field.w/2 - 110, field.goalY, 220, 190);
  ctx.strokeRect(field.w/2 - 55, field.goalY, 110, 80);
  ctx.beginPath();
  ctx.arc(field.w/2, field.goalY + 130, 42, 0.15*Math.PI, 0.85*Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(field.w/2, field.goalY + 130, 2.5, 0, Math.PI*2);
  ctx.fill();

  // gol com leve efeito de profundidade (trapézio)
  const gx0 = field.w/2 - 44, gx1 = field.w/2 + 44;
  const backInset = 8, backUp = 22;
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.moveTo(gx0, field.goalY);
  ctx.lineTo(gx0+backInset, field.goalY-backUp);
  ctx.lineTo(gx1-backInset, field.goalY-backUp);
  ctx.lineTo(gx1, field.goalY);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(gx0, field.goalY); ctx.lineTo(gx0, field.goalY-2); ctx.lineTo(gx0+backInset, field.goalY-backUp);
  ctx.lineTo(gx1-backInset, field.goalY-backUp); ctx.lineTo(gx1, field.goalY-2); ctx.lineTo(gx1, field.goalY);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1;
  for(let gx = gx0; gx <= gx1; gx += 9){
    ctx.beginPath(); ctx.moveTo(gx, field.goalY); ctx.lineTo(arcLerp(gx0+backInset, gx1-backInset, (gx-gx0)/(gx1-gx0)), field.goalY-backUp); ctx.stroke();
  }
  for(let t=0;t<=1;t+=0.34){
    ctx.beginPath(); ctx.moveTo(gx0, field.goalY - backUp*t); ctx.lineTo(gx1, field.goalY - backUp*t); ctx.stroke();
  }

  ctx.restore();
}

function renderArcade(){
  const a = _arcade;
  if(!a || !a.ctx) return;
  const ctx = a.ctx;
  const dpr = window.devicePixelRatio || 1;
  const viewW = a.viewW, viewH = a.viewH;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,viewW,viewH);

  const field = a.field;
  const scale = viewW / field.w;
  const camY = a.player ? arcClamp((a.player.y*scale) - viewH*0.62, 0, Math.max(0, field.h*scale - viewH)) : 0;

  ctx.save();
  if(a.charging){
    ctx.translate(viewW/2, viewH/2);
    ctx.scale(1.02, 1.02);
    ctx.translate(-viewW/2, -viewH/2);
  }
  ctx.scale(scale, scale);
  ctx.translate(0, -camY/scale);

  drawArcadeField(ctx, field);

  if(a.defenders){
    a.defenders.forEach(d=>{
      drawCharacter(ctx, d.x, d.y, {
        color: "#c62b40", sleeveColor: "#8f1c2c", shortsColor:"#111",
        facing: d.facing, walkPhase: d.walkPhase, moving: d.posture!=="stunned",
        kicking: 0,
      });
    });
  }
  if(a.gk){
    drawCharacter(ctx, a.gk.x, a.gk.y, {
      color: "#FFC93C", sleeveColor: "#c89a1f", shortsColor:"#1c2230",
      facing: 1, isGK: true, diveDir: a.gk.diving ? a.gk.diveDir : 0,
      moving: false,
    });
  }
  if(a.player){
    const moving = Math.hypot(a.player.vx, a.player.vy) > 8;
    drawCharacter(ctx, a.player.x, a.player.y, {
      color: "#198CFF", sleeveColor: "#0F6FD1", shortsColor:"#fff",
      facing: a.player.facing, walkPhase: a.player.walkPhase, moving,
      kicking: a.player.kicking, number: a.attackerInfo.number || 9,
    });
    if(a.player.kicking > 0) a.player.kicking -= 0.06;
  }

  if(a.ball){
    if(a.ball.flying){
      const t = arcClamp((performance.now() - a.ball.startTime) / a.ball.duration, 0, 1);
      const bx = arcLerp(a.ball.from.x, a.ball.to.x, t);
      const by = arcLerp(a.ball.from.y, a.ball.to.y, t);
      const bz = Math.sin(t*Math.PI) * a.ball.apex;
      drawArcadeShadow(ctx, bx, by, 5, 0.22*(1-t*0.3));
      drawArcadeBall(ctx, bx, by, bz, t*14);
    } else {
      const hop = Math.abs(Math.sin(a.ball.bouncePhase||0)) * 2.4;
      drawArcadeBall(ctx, a.ball.x, a.ball.y, hop, 0);
    }
  }

  ctx.restore();

  if(a.charging){
    const pct = arcClamp((performance.now() - (a._chargeStart||performance.now()))/1100, 0, 1);
    document.getElementById("arcadeChargeFill").style.height = (pct*100) + "%";
  }
}

/* =========================================================
   FIM DE PARTIDA
   ========================================================= */
function arcadeDefaultWinCondition(score){
  if(score.home > score.away) return { result: "win" };
  if(score.home < score.away) return { result: "loss" };
  return { result: "draw" };
}

function finishArcadeMatch(){
  const a = _arcade;
  a.phase = "done";
  a.running = false;
  arcCrowdStop();
  arcSfxWhistle();

  document.getElementById("arcadeHud").classList.add("hidden");
  document.getElementById("arcadeStage").classList.add("hidden");

  const score = { home: a.homeGoals, away: a.awayGoals };
  const outcome = a.cfg.winCondition ? a.cfg.winCondition(score) : arcadeDefaultWinCondition(score);

  document.getElementById("arcadeResultScore").textContent = `${score.home} - ${score.away}`;
  const titleEl = document.getElementById("arcadeResultTitle");
  titleEl.textContent = outcome.result === "win" ? "Vitória!" : outcome.result === "draw" ? "Empate" : "Derrota";
  titleEl.className = "arcade-result-title " + outcome.result;
  document.getElementById("arcadeResult").classList.remove("hidden");

  const result = {
    homeGoals: score.home,
    awayGoals: score.away,
    result: outcome.result,
    cfg: a.cfg,
    usedHomeIds: Array.from(a.usedHomeIds),
    cardEvents: a.cardEvents,
    injuryEvents: a.injuryEvents,
  };

  document.getElementById("arcadeResultBtn").onclick = ()=>{
    document.getElementById("arcadeOverlay").classList.add("hidden");
    const onComplete = a.cfg.onComplete;
    _arcade = null;
    if(typeof onComplete === "function") onComplete(result);
  };
}
