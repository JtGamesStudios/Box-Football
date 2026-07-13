/* =========================================================
   MODO ARCADE — "Ataque vs Defesa"
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
   // proceduralmente em canvas (bonecos "pixel-art" blocados, no espírito
   // da referência NES enviada) em vez de usar assets/arcade/*.png. Para
   // trocar por sprites reais no futuro, basta preencher ARCADE_SPRITES
   // (ver mais abaixo) com Image() carregadas de assets/arcade/ e usar
   // ctx.drawImage(...) dentro de drawCharacter() no lugar do desenho
   // procedural — o resto do motor (física, IA, controles) não muda.

   // TODO/decisão: nenhum arquivo de áudio novo foi enviado. Os efeitos
   // (passo, chute, rede, apito, torcida) são sintetizados via Web Audio
   // API (ver bloco ARCADE ÁUDIO), respeitando STATE.settings.sound.
   // Para trocar por arquivos reais, basta substituir as funções
   // arcSfx* por new Audio('assets/audio/arcade/....mp3').play().
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

/* Sprites reais (opcional/futuro) — ver TODO acima. Vazio = usa desenho
   procedural. Se um dia popular este objeto com Image() carregadas de
   assets/arcade/*.png, drawCharacter() passa a usá-las automaticamente. */
const ARCADE_SPRITES = {};

let _arcade = null; // estado da partida em andamento

/* =========================================================
   ATRIBUTOS DERIVADOS — data/players.json hoje só tem `overall`.
   Enquanto não houver atributos detalhados (velocidade, drible,
   passe, finalização, físico) no JSON, derivamos de forma
   determinística a partir de overall + posição. Se o usuário
   fornecer um players.json com atributos reais (ex: p.pace,
   p.dribbling, p.shooting...), usamos eles direto — basta eles
   existirem no objeto do jogador que esta função já prioriza.
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

function deriveArcadeAttributes(player){
  if(!player) player = { pos: "ATA", ovr: 68 };
  // Se o objeto já trouxer atributos reais (players.json futuro), usa-os.
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
  if(!lineup || !lineup.length) return Object.assign({}, fallback, deriveArcadeAttributes(fallback));
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
   ARCADE ÁUDIO — sintetizado via Web Audio API (ver TODO no topo)
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
function arcSfxStep(){ if(Math.random()<0.5) arcTone(90+Math.random()*30, 0.05, "square", 0.03); }
function arcSfxKick(power){ arcNoise(0.12, 0.18); arcTone(180 - power*60, 0.18, "sawtooth", 0.16); }
function arcSfxGoal(){ arcTone(660,0.12,"triangle",0.2); arcTone(880,0.16,"triangle",0.2,0.1); arcTone(1100,0.22,"triangle",0.2,0.2); }
function arcSfxSave(){ arcTone(220,0.1,"square",0.14); arcNoise(0.08,0.12); }
function arcSfxWhistle(){ arcTone(1500,0.35,"square",0.1); }
function arcSfxTackle(){ arcNoise(0.15,0.2); arcTone(140,0.12,"square",0.12); }
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
      <div class="arcade-sub" id="arcadeIntroSub">Controle o atacante com a bola. Arraste o analógico para se mover, segure o botão dourado para carregar o chute.</div>
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
   ENTRADA — pointer events cobrem touch e mouse ao mesmo tempo
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
  let lastTapTime = 0;
  let lastTapX = 0, lastTapY = 0;

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

    // double-tap rápido no analógico = tentativa de drible
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
    // swipe rápido = também conta como tentativa de drible
    if(joyStart){
      const dt = performance.now() - joyStart.t;
      const dist = Math.hypot(e.clientX - joyStart.x, e.clientY - joyStart.y);
      if(dt < 220 && dist > 46) triggerArcadeDribble();
    }
    joyStart = null;
  }
  joyBase.addEventListener("pointerup", joyRelease);
  joyBase.addEventListener("pointercancel", joyRelease);

  let chargeStart = 0;
  shootBtn.addEventListener("pointerdown", (e)=>{
    shootBtn.setPointerCapture(e.pointerId);
    if(!_arcade || _arcade.phase !== "playing" || !_arcade.player.hasBall) return;
    _arcade.charging = true;
    chargeStart = performance.now();
  });
  function releaseShot(){
    if(!_arcade || !_arcade.charging) return;
    _arcade.charging = false;
    const power = arcClamp((performance.now() - chargeStart) / 1100, 0.12, 1);
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
  if(performance.now() - (_arcade.lastDribbleAt||0) < 700) return; // cooldown
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
    phase: "intro", // intro | playing | resolving | done
    input: { move: {x:0,y:0} },
    charging: false,
    lastDribbleAt: 0,
    shakeUntil: 0,
    field: { w: 400, h: 900, goalY: 60, startY: 780 },
    running: false,
    _raf: null,
  };

  ensureArcadeOverlay();
  document.getElementById("arcadeCompLabel").textContent = cfg.competitionLabel;
  document.getElementById("arcadeHomeName").textContent = cfg.homeTeamName;
  document.getElementById("arcadeAwayName").textContent = cfg.awayTeamName;
  document.getElementById("arcadeIntroSub").textContent =
    `Você controla ${attackerRaw.name} em ${cfg.totalChances} ataques seguidos. ` +
    `Arraste o analógico para correr/driblar, toque duas vezes rápido (ou puxe rápido pro lado) pra tentar passar do defensor, ` +
    `segure o botão dourado pra carregar o chute e solte pra finalizar. O botão azul é a cavadinha.`;

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
    hasBall: true,
    kicking: 0,
    walkPhase: 0,
    invuln: 0, // janela de invencibilidade pós-drible
  };
  _arcade.ball = { x: _arcade.player.x, y: _arcade.player.y - 24 };

  const dCount = arcadeDefenderCount(oStr);
  _arcade.defenders = Array.from({length: dCount}, (_,i)=>{
    const marking = arcClamp(oStr + (Math.random()*14-7), 25, 99);
    const pace = arcClamp(oStr + (Math.random()*14-7), 25, 99);
    return {
      x: field.w/2 + (i - (dCount-1)/2) * 90 + (Math.random()*20-10),
      y: field.goalY + 160 + Math.random()*120,
      marking, pace,
      state: "cover", // cover | press | stunned
      stunUntil: 0,
    };
  });

  _arcade.gk = {
    x: field.w/2,
    y: field.goalY + 8,
    reaction: arcClamp(oStr, 25, 99),
    advanced: false,
    advancedUntil: 0,
  };

  _arcade.timeLeft = 11; // segundos pra resolver o ataque, senão bola sai
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
  // torcida/keeper avançando aleatoriamente da linha (afeta cavadinha)
  const gk = a.gk;
  if(performance.now() > gk.advancedUntil && Math.random() < 0.004){
    gk.advanced = true;
    gk.advancedUntil = performance.now() + 900;
  }
  if(performance.now() > gk.advancedUntil) gk.advanced = false;

  if(a.phase !== "playing"){ return; }

  a.timeLeft -= dt;
  if(a.timeLeft <= 0){
    endArcadeAttack("out");
    return;
  }

  const p = a.player;
  const attrs = a.attrs;
  const maxSpeed = 90 + attrs.pace * 1.7; // px/s lógico
  const accel = 700;

  const mv = a.input.move;
  const mvLen = Math.hypot(mv.x, mv.y);
  const dirX = mvLen > 0.15 ? mv.x/Math.max(mvLen,1) : 0;
  const dirY = mvLen > 0.15 ? mv.y/Math.max(mvLen,1) : 0;

  p.vx += dirX * accel * dt;
  p.vy += dirY * accel * dt;
  const speed = Math.hypot(p.vx, p.vy);
  if(speed > maxSpeed){ p.vx = p.vx/speed*maxSpeed; p.vy = p.vy/speed*maxSpeed; }
  // atrito
  p.vx *= 0.86; p.vy *= 0.86;

  p.x = arcClamp(p.x + p.vx*dt, 26, a.field.w - 26);
  p.y = arcClamp(p.y + p.vy*dt, a.field.goalY + 34, a.field.startY + 40);

  if(speed > 8){
    p.walkPhase += dt * (4 + speed/40);
    if(Math.random() < dt*3) arcSfxStep();
  }
  if(p.invuln > 0) p.invuln -= dt;

  if(p.hasBall){
    const face = mvLen > 0.15 ? Math.atan2(dirY, dirX) : -Math.PI/2;
    a.ball.x = p.x + Math.cos(face)*0;
    a.ball.y = p.y - 20;
    a.ball.x = p.x;
  }

  updateArcadeDefenders(dt);
  updateArcadeGK(dt);

  if(a.charging){
    const chargeMs = arcClamp((performance.now() - a._chargeStart)||0, 0, 1100);
  }
}

function updateArcadeDefenders(dt){
  const a = _arcade;
  const p = a.player;
  const field = a.field;
  a.defenders.forEach(d=>{
    if(d.state === "stunned"){
      if(performance.now() > d.stunUntil) d.state = "cover";
      return;
    }
    const distToPlayer = Math.hypot(d.x - p.x, d.y - p.y);
    // decide estado: cobre espaço entre atacante e gol, ou pressiona se perto
    const pressRadius = 130;
    d.state = distToPlayer < pressRadius ? "press" : "cover";

    let targetX, targetY;
    if(d.state === "press"){
      targetX = p.x; targetY = p.y - 18;
    } else {
      // fica entre o atacante e o centro do gol
      const goalX = field.w/2, goalY = field.goalY;
      targetX = p.x + (goalX - p.x) * 0.55;
      targetY = Math.max(p.y - 130, goalY + 90);
    }
    const dx = targetX - d.x, dy = targetY - d.y;
    const dist = Math.hypot(dx,dy) || 1;
    const dSpeed = (60 + d.pace*1.1) * dt;
    d.x += (dx/dist) * Math.min(dSpeed, dist);
    d.y += (dy/dist) * Math.min(dSpeed, dist);

    // carrinho/desarme quando muito perto e atacante não está invulnerável
    if(d.state === "press" && distToPlayer < 26 && p.hasBall && p.invuln <= 0){
      if(Math.random() < (0.5 + (d.marking - a.attrs.dribble - a.attrs.physical*0.3)/220) * dt * 2.2){
        resolveArcadeTackle(d);
      }
    }
  });
}

function updateArcadeGK(dt){
  const a = _arcade;
  const gk = a.gk;
  const targetX = arcClamp(a.player.x, a.field.w/2 - 70, a.field.w/2 + 70);
  const gkSpeed = (40 + gk.reaction*0.6) * dt;
  const dx = targetX - gk.x;
  gk.x += Math.sign(dx) * Math.min(Math.abs(dx), gkSpeed);
  gk.y = a.field.goalY + (gk.advanced ? 34 : 8);
}

function resolveArcadeTackle(defender){
  const a = _arcade;
  if(a.phase !== "playing") return;
  defender.state = "stunned";
  defender.stunUntil = performance.now() + 600;
  a.player.hasBall = false;
  arcSfxTackle();
  shakeArcade(200);
  arcadeToast("Desarme! A defesa tirou a bola.");
  // cosmético: pequena chance de cartão pro defensor (sem integrar ao
  // sistema de cartões da Campanha ainda — ver spec, seção 2)
  endArcadeAttack("turnover");
}

/* =========================================================
   DRIBLE
   ========================================================= */
function attemptArcadeDribble(){
  const a = _arcade;
  if(!a || a.phase !== "playing" || !a.player.hasBall) return;
  const p = a.player;
  // acha o defensor mais próximo dentro de raio de disputa
  let nearest = null, nearestDist = Infinity;
  a.defenders.forEach(d=>{
    if(d.state === "stunned") return;
    const dist = Math.hypot(d.x-p.x, d.y-p.y);
    if(dist < nearestDist){ nearestDist = dist; nearest = d; }
  });
  if(!nearest || nearestDist > 95){
    // ninguém pra driblar: só um pequeno arranque
    p.vx *= 1.3; p.vy *= 1.3;
    return;
  }
  const successChance = arcClamp(0.5 + (a.attrs.dribble - nearest.marking) / 160, 0.12, 0.92);
  if(Math.random() < successChance){
    p.invuln = 0.55;
    p.vx *= 1.7; p.vy *= 1.7;
    nearest.state = "stunned";
    nearest.stunUntil = performance.now() + 500;
    arcadeToast("Boa! Passou do marcador.");
    arcTone(520, 0.08, "triangle", 0.12);
  } else {
    arcadeToast("Perdeu o domínio no drible!");
    // chance de perda de posse imediata
    if(Math.random() < 0.55){
      resolveArcadeTackle(nearest);
    } else {
      p.vx *= 0.4; p.vy *= 0.4;
    }
  }
}

/* =========================================================
   CHUTE
   ========================================================= */
function fireArcadeShot(power, isChip){
  const a = _arcade;
  if(!a || a.phase !== "playing" || !a.player.hasBall) return;
  a.phase = "resolving";
  a.player.hasBall = false;
  a.player.kicking = 0.25;
  arcSfxKick(power);
  shakeArcade(90);

  const field = a.field;
  const goalX = field.w/2;
  const p = a.player;

  // mira: baseada na posição lateral do jogador + um pouco de aleatoriedade
  // reduzida pelo atributo de finalização (shot)
  const accuracy = a.attrs.shot / 99; // 0..1
  const wobble = (1 - accuracy) * 60 * (isChip ? 0.5 : 1);
  const lateralBias = arcClamp((p.x - goalX) * -0.25, -40, 40);
  const targetOffset = arcClamp(lateralBias + (Math.random()*2-1)*wobble, -55, 55);

  let saveChance;
  if(isChip){
    // cavadinha: ótima se o goleiro estiver adiantado, senão mediana
    saveChance = a.gk.advanced ? 0.12 : 0.45;
    saveChance -= a.attrs.shot/99 * 0.1;
  } else {
    const gkSkill = a.gk.reaction/99;
    const powerFactor = power; // mais força = mais difícil de defender, porém menos preciso (já embutido no wobble)
    const placementFactor = Math.abs(targetOffset)/55;
    saveChance = arcClamp(0.32 + gkSkill*0.45 - powerFactor*0.25 - placementFactor*0.25, 0.05, 0.85);
  }

  // defensor bem próximo na linha de passe pode bloquear o chute
  const blocker = a.defenders.some(d => d.state!=="stunned" && Math.hypot(d.x-p.x, d.y-p.y) < 40);
  if(blocker) saveChance += 0.12;

  const isSave = Math.random() < saveChance;

  setTimeout(()=>{
    if(isSave){
      arcSfxSave();
      shakeArcade(140);
      arcadeToast(isChip ? "O goleiro se recupera e defende a cavadinha!" : "Defesaaa do goleiro!");
      endArcadeAttack("save");
    } else {
      a.homeGoals++;
      document.getElementById("arcadeHomeGoals").textContent = a.homeGoals;
      arcSfxGoal();
      shakeArcade(260);
      arcadeToast(isChip ? "Cavadinha na medida! GOOOL!" : "GOOOOL!");
      endArcadeAttack("goal");
    }
  }, 260);
}

function endArcadeAttack(reason){
  const a = _arcade;
  if(!a) return;
  a.phase = "idle";
  setTimeout(()=>{
    if(!a || a.phase === "done") return;
    nextArcadeAttack();
  }, 900);
}

/* =========================================================
   FEEDBACK VISUAL
   ========================================================= */
function shakeArcade(ms){
  const stage = document.getElementById("arcadeStage");
  stage.classList.remove("arcade-shake");
  void stage.offsetWidth; // reflow pra reiniciar a animação
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
   RENDER (pixel-art procedural — ver TODO no topo do arquivo)
   ========================================================= */
function drawArcadeShadow(ctx, x, y, r){
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y+6, r, r*0.4, 0, 0, Math.PI*2);
  ctx.fill();
}

function drawCharacter(ctx, x, y, opts){
  // opts: { color, walkPhase, kicking, isGK, label }
  const bob = opts.walkPhase != null ? Math.sin(opts.walkPhase)*2 : 0;
  const legOffset = opts.walkPhase != null ? Math.sin(opts.walkPhase)*4 : 0;
  drawArcadeShadow(ctx, x, y, 12);
  ctx.save();
  ctx.translate(x, y - 16 + bob*0.3);
  // pernas
  ctx.fillStyle = "#1c2230";
  ctx.fillRect(-6 + legOffset, 10, 5, 10);
  ctx.fillRect(1 - legOffset, 10, 5, 10);
  // tronco
  ctx.fillStyle = opts.color;
  if(opts.kicking > 0){
    ctx.save();
    ctx.translate(0, 4);
    ctx.rotate(-0.12);
    ctx.fillRect(-8, -6, 16, 16);
    ctx.restore();
  } else {
    ctx.fillRect(-8, -2, 16, 16);
  }
  // cabeça
  ctx.fillStyle = "#f2c49b";
  ctx.fillRect(-6, -14, 12, 10);
  // "cabelo"
  ctx.fillStyle = "#2a1c12";
  ctx.fillRect(-6, -14, 12, 3);
  ctx.restore();
}

function drawArcadeField(ctx, viewW, viewH, camY){
  const field = _arcade.field;
  ctx.save();
  ctx.translate(0, -camY);

  // listras de grama
  const stripeH = 60;
  for(let y = 0; y < field.h; y += stripeH){
    ctx.fillStyle = (Math.floor(y/stripeH) % 2 === 0) ? "#1f7a34" : "#248a3b";
    ctx.fillRect(0, y, field.w, stripeH);
  }

  // linhas laterais
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;
  ctx.strokeRect(6, field.goalY, field.w-12, field.h - field.goalY - 6);

  // grande área
  ctx.strokeRect(field.w/2 - 110, field.goalY, 220, 190);
  // pequena área
  ctx.strokeRect(field.w/2 - 55, field.goalY, 110, 80);
  // marca do pênalti
  ctx.beginPath();
  ctx.arc(field.w/2, field.goalY + 130, 3, 0, Math.PI*2);
  ctx.fill();

  // gol
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.strokeRect(field.w/2 - 46, field.goalY - 26, 92, 26);
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  for(let gx = field.w/2-46; gx <= field.w/2+46; gx += 10){
    ctx.beginPath(); ctx.moveTo(gx, field.goalY-26); ctx.lineTo(gx, field.goalY); ctx.stroke();
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

  // câmera: acompanha o atacante verticalmente
  const field = a.field;
  const scale = viewW / field.w;
  const camY = a.player ? arcClamp((a.player.y*scale) - viewH*0.62, 0, Math.max(0, field.h*scale - viewH)) : 0;

  ctx.save();
  // leve zoom durante a carga do chute
  if(a.charging){
    ctx.translate(viewW/2, viewH/2);
    ctx.scale(1.02, 1.02);
    ctx.translate(-viewW/2, -viewH/2);
  }
  ctx.scale(scale, scale);
  drawArcadeField(ctx, field.w, field.h/scale, camY/scale);

  ctx.save();
  ctx.translate(0, -camY/scale);

  if(a.defenders){
    a.defenders.forEach(d=>{
      drawCharacter(ctx, d.x, d.y, { color: "#E63950", walkPhase: null, kicking: 0 });
    });
  }
  if(a.gk){
    drawCharacter(ctx, a.gk.x, a.gk.y, { color: "#FFC93C", walkPhase: null, kicking: 0 });
  }
  if(a.player){
    drawCharacter(ctx, a.player.x, a.player.y, {
      color: "#198CFF",
      walkPhase: a.player.walkPhase,
      kicking: a.player.kicking,
    });
    if(a.player.kicking > 0) a.player.kicking -= 0.05;
  }
  if(a.ball){
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(a.ball.x, a.ball.y - 20, 5, 0, Math.PI*2);
    ctx.fill();
    ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();

  // barra de força do chute
  if(a.charging){
    const pct = arcClamp((performance.now() - (a._chargeStart||performance.now()))/1100, 0, 1);
    document.getElementById("arcadeChargeFill").style.height = (pct*100) + "%";
  }
}

// registra o instante em que começou a carregar (usado pela barra visual)
document.addEventListener("pointerdown", (e)=>{
  if(e.target && e.target.id === "arcadeShootBtn" && _arcade){
    _arcade._chargeStart = performance.now();
  }
});

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
    cardEvents: a.cardEvents,     // vazio por enquanto — ver spec, seção 2
    injuryEvents: a.injuryEvents, // vazio por enquanto
  };

  document.getElementById("arcadeResultBtn").onclick = ()=>{
    document.getElementById("arcadeOverlay").classList.add("hidden");
    const onComplete = a.cfg.onComplete;
    _arcade = null;
    if(typeof onComplete === "function") onComplete(result);
  };
}
