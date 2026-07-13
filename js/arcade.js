/* =========================================================
   MODO ARCADE — "Embaixadinha Infinita"  (v3)
   Minigame de 1 toque só: mantenha a bola no ar tocando na
   hora certa. Ritmo perfeito = combo sobe. Errou a janela = fim.
   Roda em paralelo aos outros motores (js/matchsim.js) e NÃO
   altera nada fora deste arquivo.

   Uso (mesma assinatura que startMatch()/o arcade antigo usavam,
   pra não quebrar js/events.js):

     startArcadeMatch({
       competitionLabel, title, homeTeamName, awayTeamName,
       homeLineup, opponentStrength, totalChances,
       winCondition(score) => {result:"win"|"draw"|"loss"},
       onComplete(result)
     });

   onComplete recebe o MESMO formato de objeto de sempre:
     { homeGoals, awayGoals, result, usedHomeIds, cardEvents, injuryEvents }

   Como o "placar" funciona aqui: a cada 5 embaixadinhas seguidas
   sem deixar a bola cair, isso conta como 1 "gol" (homeGoals++).
   awayGoals fica sempre 0 — não existe adversário marcando, só
   a sua sequência. Isso mantém compatível com eventos que usam
   mode:"goals" / goalTarget (ex.: data/events.json → evt_artilheiro)
   e com o winCondition padrão (home > away = vitória).

   É JOGO DE 1 VIDA POR TENTATIVA: errou o toque, a sequência acaba
   ali — é o que faz o "só mais uma vez" funcionar (tipo Flappy Bird).
   Cada chamada de startArcadeMatch() = 1 tentativa/1 ticket do evento.

   // Sem sprites novos enviados nesta conversa — personagem e bola
   // seguem desenhados proceduralmente em canvas, no mesmo estilo
   // pixel-art do resto do jogo. Pra trocar por sprite real no futuro,
   // troque o corpo de drawJuggler() por ctx.drawImage(...).
   // Efeitos sonoros seguem sintetizados via Web Audio API.
   ========================================================= */

const ARCADE_DEFAULTS = {
  competitionLabel: "Modo Arcade",
  title: "Embaixadinha Infinita",
  homeTeamName: "Meu Clube",
  awayTeamName: "COM",
  homeLineup: null,
  opponentStrength: 60,
  totalChances: 10, // reaproveitado como "meta" de gols exibida na intro
  winCondition: null,
  onComplete: null,
};

let _arcade = null;

/* =========================================================
   ATRIBUTOS DERIVADOS — o controle do time influencia levemente
   a dificuldade (jogador com mais "drible"/controle de bola tem
   uma janela de toque um pouco mais generosa). Sutil, não decide
   o jogo sozinho — quem decide é o timing do jogador.
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
function arcVibrate(pattern){
  if(typeof STATE !== "undefined" && STATE.settings && STATE.settings.vibration && navigator.vibrate){
    try{ navigator.vibrate(pattern); }catch(e){}
  }
}
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
// toque "OK": som simples e curto
function arcSfxHitOk(){ arcTone(320, 0.07, "sine", 0.12); }
// toque "PERFEITO": tom sobe com o combo (efeito tipo Fruit Ninja/Piano Tiles)
function arcSfxHitPerfect(comboLevel){
  const note = 420 + Math.min(comboLevel, 24) * 26;
  arcTone(note, 0.09, "triangle", 0.16);
  arcTone(note*1.5, 0.07, "triangle", 0.08, 0.02);
}
function arcSfxWhiff(){ arcTone(180, 0.04, "square", 0.05); }
function arcSfxMilestone(){ arcTone(660,0.12,"triangle",0.2); arcTone(880,0.16,"triangle",0.2,0.1); arcTone(1100,0.22,"triangle",0.2,0.2); }
function arcSfxDrop(){ arcNoise(0.12, 0.16); arcSweep(260, 60, 0.28, "sawtooth", 0.15); }
function arcSfxWhistle(){ arcTone(1500,0.35,"square",0.1); }
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
  const gain = ctx.createGain(); gain.gain.value = 0.025;
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
  .arcade-result-sub{color:#B9C2CE;font-size:13px;}
  .arcade-result-title{font-family:var(--font-display);font-size:24px;}
  .arcade-result-title.win{color:var(--turf);}
  .arcade-result-title.loss{color:var(--crimson);}
  .arcade-result-title.draw{color:var(--gold);}
  .arcade-hud{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#0b1220;border-bottom:1px solid rgba(255,255,255,.08);font-family:var(--font-display);font-size:13px;flex-shrink:0;position:relative;z-index:3;}
  .arcade-hud .side{display:flex;align-items:center;gap:6px;min-width:70px;}
  .arcade-hud .side .lbl{font-family:var(--font-body);font-size:10px;color:#7C8AA0;text-transform:uppercase;}
  .arcade-hud .goals{font-size:20px;}
  .arcade-hud .mid{text-align:center;color:#B9C2CE;font-family:var(--font-body);font-size:11px;}
  .arcade-stage{position:relative;flex:1;overflow:hidden;touch-action:none;background:#173a1d;}
  .arcade-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;}
  .arcade-combo-wrap{position:absolute;top:14%;left:0;right:0;display:flex;flex-direction:column;align-items:center;pointer-events:none;z-index:4;}
  .arcade-combo-num{font-family:var(--font-display);font-size:64px;font-weight:800;color:#fff;text-shadow:0 3px 10px rgba(0,0,0,.45);transition:transform .08s ease;}
  .arcade-combo-num.pop{animation:arcadeComboPop .22s ease;}
  @keyframes arcadeComboPop{ 0%{transform:scale(1.35);} 100%{transform:scale(1);} }
  .arcade-combo-lbl{font-family:var(--font-body);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#B9C2CE;margin-top:-4px;}
  .arcade-quality-toast{position:absolute;left:50%;top:34%;transform:translate(-50%,0);font-family:var(--font-display);font-size:20px;font-weight:800;opacity:0;pointer-events:none;z-index:5;text-shadow:0 2px 8px rgba(0,0,0,.5);}
  .arcade-quality-toast.show{animation:arcadeQualityFloat .55s ease forwards;}
  @keyframes arcadeQualityFloat{
    0%{opacity:0; transform:translate(-50%,10px) scale(0.8);}
    18%{opacity:1; transform:translate(-50%,0) scale(1.08);}
    70%{opacity:1; transform:translate(-50%,-14px) scale(1);}
    100%{opacity:0; transform:translate(-50%,-26px) scale(0.96);}
  }
  .arcade-hint{position:absolute;left:50%;bottom:8%;transform:translateX(-50%);font-family:var(--font-body);font-size:13px;color:rgba(255,255,255,.75);background:rgba(0,0,0,.35);padding:6px 14px;border-radius:999px;opacity:1;transition:opacity .4s;pointer-events:none;z-index:4;}
  .arcade-hint.hidden-hint{opacity:0;}
  .arcade-flash{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:2;}
  .arcade-flash.hit{animation:arcadeFlashHit .18s ease;}
  .arcade-flash.drop{animation:arcadeFlashDrop .3s ease;}
  @keyframes arcadeFlashHit{ 0%{opacity:.18; background:#fff;} 100%{opacity:0;} }
  @keyframes arcadeFlashDrop{ 0%{opacity:.5; background:var(--crimson);} 100%{opacity:0;} }
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
        <span class="arcade-vs-badge">EMBAIXADINHA</span>
        <span id="arcadeAwayName">COM</span>
      </div>
      <div class="arcade-sub" id="arcadeIntroSub"></div>
      <button class="arcade-btn" id="arcadeStartBtn">Começar ›</button>
    </div>

    <div class="arcade-hud hidden" id="arcadeHud">
      <div class="side"><span class="lbl">Gols</span><span class="goals" id="arcadeHomeGoals">0</span></div>
      <div class="mid"><div id="arcadeAttackProgress">Sequência</div></div>
      <div class="side"><span class="lbl">Recorde</span><span class="goals" id="arcadeBestCombo">0</span></div>
    </div>

    <div class="arcade-stage hidden" id="arcadeStage">
      <canvas id="arcadeCanvas"></canvas>
      <div class="arcade-flash" id="arcadeFlash"></div>
      <div class="arcade-combo-wrap">
        <div class="arcade-combo-num" id="arcadeComboNum">0</div>
        <div class="arcade-combo-lbl">combo</div>
      </div>
      <div class="arcade-quality-toast" id="arcadeQualityToast"></div>
      <div class="arcade-hint" id="arcadeHint">Toque na tela no momento em que a bola descer até a linha</div>
    </div>

    <div class="arcade-result hidden" id="arcadeResult">
      <div class="arcade-result-title" id="arcadeResultTitle">Vitória!</div>
      <div class="arcade-result-score" id="arcadeResultScore">3 - 1</div>
      <div class="arcade-result-sub" id="arcadeResultSub"></div>
      <button class="arcade-btn" id="arcadeResultBtn">Continuar</button>
    </div>
  `;
  document.body.appendChild(div);
  wireArcadeInput();
}

/* =========================================================
   ENTRADA — 1 toque só, em qualquer lugar do palco
   ========================================================= */
let _arcInputWired = false;
function wireArcadeInput(){
  if(_arcInputWired) return;
  _arcInputWired = true;
  const stage = document.getElementById("arcadeStage");
  stage.addEventListener("pointerdown", (e)=>{
    e.preventDefault();
    handleArcadeTap();
  });
}

/* =========================================================
   INÍCIO DA PARTIDA (tela de intro)
   ========================================================= */
function startArcadeMatch(userConfig){
  const cfg = Object.assign({}, ARCADE_DEFAULTS, userConfig || {});
  cfg.totalChances = arcClamp(Math.round(cfg.totalChances || 10), 3, 20);

  const attackerRaw = pickArcadeAttacker(cfg.homeLineup);
  const attrs = attackerRaw.attrs || deriveArcadeAttributes(attackerRaw);

  _arcade = {
    cfg,
    attackerInfo: attackerRaw,
    attrs,
    homeGoals: 0,
    awayGoals: 0,
    usedHomeIds: new Set(attackerRaw.id ? [attackerRaw.id] : []),
    cardEvents: [],
    injuryEvents: [],
    phase: "intro", // intro | playing | dropped | done
    combo: 0,
    bestCombo: 0,
    perfectStreak: 0,
    particles: [],
    freezeUntil: 0,
    running: false,
    // metas do "campo" de jogo (coordenadas locais do canvas, 300x200 lógico)
    field: { w: 300, h: 220, groundY: 190 },
  };

  ensureArcadeOverlay();
  document.getElementById("arcadeCompLabel").textContent = cfg.competitionLabel;
  document.getElementById("arcadeHomeName").textContent = cfg.homeTeamName;
  document.getElementById("arcadeAwayName").textContent = cfg.awayTeamName;
  document.getElementById("arcadeIntroSub").textContent =
    `${attackerRaw.name} vai de embaixadinha! Toque na tela bem na hora em que a bola descer até a linha. ` +
    `Acerte no ritmo pra emendar combos — cada 5 seguidas vira 1 gol. Um toque errado (ou tarde demais) encerra a sequência, então capricha no timing!`;

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
    beginArcadeRun();
    _arcade.running = true;
    requestAnimationFrame(arcadeLoop);
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
   FÍSICA DA BOLA — sobe/desce com gravidade; a dificuldade
   (gravidade + tamanho da janela de toque) escala com o combo,
   até um teto, pra continuar jogável em sequências longas.
   ========================================================= */
function arcadeDifficulty(combo){
  const c = Math.min(combo, 40); // não fica impossível depois de um tempo
  const gravity = 620 + c * 9;               // px/s² (mais rápido com o combo)
  const windowH = arcClamp(30 - c * 0.28, 15, 30); // altura da janela de toque
  return { gravity, windowH };
}

function beginArcadeRun(){
  const a = _arcade;
  a.combo = 0;
  a.perfectStreak = 0;
  a.phase = "playing";
  a.kickPose = 0; // 0..1, decai — pose de chute do boneco
  updateArcadeHud();
  spawnArcadeBall(true);
}

function spawnArcadeBall(firstLaunch){
  const a = _arcade;
  const diff = arcadeDifficulty(a.combo);
  const apexTarget = arcClamp(150 - Math.min(a.combo,40) * 1.8, 70, 150);
  const launch = Math.sqrt(2 * diff.gravity * apexTarget);
  a.ball = {
    h: firstLaunch ? apexTarget * 0.7 : 0,
    vh: firstLaunch ? -launch * 0.1 : -launch, // 1º lançamento sai suave da entrada
    x: a.field.w/2,
    sway: Math.random() * Math.PI * 2,
  };
  a.gravity = diff.gravity;
  a.windowH = diff.windowH + arcClamp((a.attrs.dribble - 60) * 0.1, -3, 5); // toque de controle do jogador
  a.sweetSpotH = a.windowH * 0.45;
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
  const now = performance.now();

  if(a.kickPose > 0) a.kickPose = Math.max(0, a.kickPose - dt*2.6);

  // partículas seguem animando mesmo durante o hit-stop, pra não travar o "juice"
  updateArcadeParticles(dt);

  if(now < a.freezeUntil) return; // hit-stop
  if(a.phase !== "playing") return;

  const ball = a.ball;
  ball.sway += dt;
  ball.vh += a.gravity * dt;
  ball.h -= ball.vh * dt; // vh negativo = subindo

  if(ball.h <= 0 && ball.vh > 0){
    // bola tocou o chão sem toque válido a tempo = queda
    ball.h = 0;
    triggerArcadeDrop();
  }
}

/* =========================================================
   TOQUE DO JOGADOR
   ========================================================= */
function handleArcadeTap(){
  const a = _arcade;
  if(!a || a.phase !== "playing") return;
  const ball = a.ball;

  document.getElementById("arcadeHint").classList.add("hidden-hint");

  // só conta toque quando a bola está descendo (vh>0) dentro da janela
  const inWindow = ball.vh > 0 && ball.h <= a.windowH;
  if(!inWindow){
    arcSfxWhiff();
    return; // toque "no vazio": sem penalidade, só não faz nada
  }

  const err = Math.abs(ball.h - a.sweetSpotH);
  const perfect = err <= a.windowH * 0.32;

  a.combo++;
  a.kickPose = 1;
  if(a.combo > a.bestCombo) a.bestCombo = a.combo;

  if(perfect){
    a.perfectStreak++;
    arcSfxHitPerfect(a.combo);
    spawnArcadeParticles(ball.x, a.field.groundY - ball.h, "#FFC93C", 10, 1.3);
    showArcadeQuality("PERFEITO!", "#FFC93C");
    arcVibrate(12);
  } else {
    a.perfectStreak = 0;
    arcSfxHitOk();
    spawnArcadeParticles(ball.x, a.field.groundY - ball.h, "#198CFF", 5, 0.9);
    showArcadeQuality("OK", "#DDE6F2");
    arcVibrate(8);
  }

  flashArcadeStage("hit");

  if(a.combo % 5 === 0){
    a.homeGoals++;
    updateArcadeHud();
    arcSfxMilestone();
    shakeArcade(180);
    a.freezeUntil = performance.now() + 60;
    showArcadeQuality("GOL! x" + a.combo, "#2FB86B");
  }

  updateArcadeHud();

  // relança a bola: acerto perfeito dá impulso mais consistente/alto (mais
  // fácil de emendar o próximo); acerto "OK" dá um pouco menos de força,
  // recompensando quem acerta o timing fino.
  const diff = arcadeDifficulty(a.combo);
  a.gravity = diff.gravity;
  a.windowH = diff.windowH + arcClamp((a.attrs.dribble - 60) * 0.1, -3, 5);
  a.sweetSpotH = a.windowH * 0.45;
  const apexTarget = arcClamp(150 - Math.min(a.combo,40) * 1.8, 70, 150);
  const powerMul = perfect ? 1 : (0.82 + Math.random()*0.1);
  ball.vh = -Math.sqrt(2 * a.gravity * apexTarget) * powerMul;
  ball.h = Math.max(ball.h, 0.01);
}

function triggerArcadeDrop(){
  const a = _arcade;
  if(!a || a.phase !== "playing") return;
  a.phase = "dropped";
  arcSfxDrop();
  flashArcadeStage("drop");
  shakeArcade(260);
  a.freezeUntil = performance.now() + 120;
  spawnArcadeParticles(a.ball.x, a.field.groundY, "#B9C2CE", 8, 1.1);
  setTimeout(()=> finishArcadeMatch(), 700);
}

/* =========================================================
   FEEDBACK VISUAL (DOM)
   ========================================================= */
function updateArcadeHud(){
  const a = _arcade;
  document.getElementById("arcadeHomeGoals").textContent = a.homeGoals;
  document.getElementById("arcadeBestCombo").textContent = a.bestCombo;
  const numEl = document.getElementById("arcadeComboNum");
  numEl.textContent = a.combo;
  numEl.classList.remove("pop");
  void numEl.offsetWidth;
  numEl.classList.add("pop");
}

let _arcQualityTimer = null;
function showArcadeQuality(text, color){
  const el = document.getElementById("arcadeQualityToast");
  if(!el) return;
  el.textContent = text;
  el.style.color = color || "#fff";
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

function flashArcadeStage(kind){
  const el = document.getElementById("arcadeFlash");
  if(!el) return;
  el.classList.remove("hit","drop");
  void el.offsetWidth;
  el.classList.add(kind);
}

function shakeArcade(ms){
  if(typeof STATE !== "undefined" && STATE.settings && STATE.settings.reducedMotion) return;
  const stage = document.getElementById("arcadeStage");
  stage.classList.remove("arcade-shake");
  void stage.offsetWidth;
  stage.classList.add("arcade-shake");
  setTimeout(()=> stage.classList.remove("arcade-shake"), ms || 300);
}

/* =========================================================
   PARTÍCULAS (canvas)
   ========================================================= */
function spawnArcadeParticles(x, y, color, count, speedMul){
  const a = _arcade;
  for(let i=0;i<count;i++){
    const ang = Math.random() * Math.PI * 2;
    const spd = (40 + Math.random()*70) * (speedMul||1);
    a.particles.push({
      x, y, vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd - 30,
      life: 0.5 + Math.random()*0.25, maxLife: 0.5 + Math.random()*0.25,
      color, r: 1.5 + Math.random()*2,
    });
  }
}
function updateArcadeParticles(dt){
  const a = _arcade;
  if(!a || !a.particles) return;
  for(let i=a.particles.length-1;i>=0;i--){
    const p = a.particles[i];
    p.vy += 220*dt;
    p.x += p.vx*dt; p.y += p.vy*dt;
    p.life -= dt;
    if(p.life <= 0) a.particles.splice(i,1);
  }
}

/* =========================================================
   RENDER — pixel-art procedural
   ========================================================= */
function drawArcadeShadow(ctx, x, y, r, alpha){
  ctx.fillStyle = `rgba(0,0,0,${alpha ?? 0.28})`;
  ctx.beginPath();
  ctx.ellipse(x, y+2, r, r*0.38, 0, 0, Math.PI*2);
  ctx.fill();
}

function drawArcadeBall(ctx, x, y, spin){
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(spin || 0);
  ctx.fillStyle = "#fdfdfd";
  ctx.beginPath(); ctx.arc(0,0,5.5,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = "#2a2a2a";
  ctx.beginPath(); ctx.arc(0,0,2,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(2,0);
  for(let i=0;i<5;i++){
    const ang = (i/5)*Math.PI*2;
    ctx.lineTo(Math.cos(ang)*5, Math.sin(ang)*5);
    ctx.moveTo(2,0);
  }
  ctx.strokeStyle = "#2a2a2a"; ctx.lineWidth = 0.6; ctx.stroke();
  ctx.restore();
}

/* Boneco fazendo embaixadinha: idle balançando, perna de apoio firme e
   perna de chute que sobe/estica no momento do toque (kickPose 0..1). */
function drawJuggler(ctx, x, y, kickPose, breathe){
  const bob = Math.sin(breathe) * 1.4;
  drawArcadeShadow(ctx, x, y, 12, 0.26);
  ctx.save();
  ctx.translate(x, y - 15 - bob);

  const kick = kickPose || 0;
  const legLift = kick * 12;
  const legKickOut = Math.sin(kick*Math.PI) * 7;

  // perna de apoio
  ctx.fillStyle = "#f4f6fa";
  ctx.fillRect(-6, 5, 5, 5);
  ctx.fillStyle = "#12161f";
  ctx.fillRect(-6, 9, 5, 9);
  ctx.fillStyle = "#0a0d13";
  ctx.fillRect(-7, 17, 6, 3);

  // perna de chute (sobe na hora do toque)
  ctx.fillStyle = "#f4f6fa";
  ctx.fillRect(1, 5 - legLift, 5, 5);
  ctx.fillStyle = "#12161f";
  ctx.save();
  ctx.translate(3.5, 9 - legLift);
  ctx.rotate(-kick*0.9);
  ctx.fillRect(-2.5, 0, 5, 9);
  ctx.fillStyle = "#0a0d13";
  ctx.fillRect(-3 + legKickOut*0.3, 8, 6, 3);
  ctx.restore();

  // tronco / camisa
  ctx.fillStyle = "#198CFF";
  ctx.fillRect(-8, -12, 16, 15);
  ctx.fillStyle = "#0F6FD1";
  ctx.fillRect(-8, -12, 3, 7);
  ctx.fillRect(5, -12, 3, 7);
  if(true){
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("9", 0, -2);
  }
  // calção
  ctx.fillStyle = "#fff";
  ctx.fillRect(-7, 1, 14, 6);

  // braços abertos (equilíbrio)
  ctx.fillStyle = "#e8b58a";
  const armSwing = Math.sin(breathe*1.3) * 2;
  ctx.fillRect(-11, -4 + armSwing, 3, 8);
  ctx.fillRect(8, -4 - armSwing, 3, 8);

  // cabeça
  ctx.fillStyle = "#e8b58a";
  ctx.fillRect(-6, -22, 12, 10);
  ctx.fillStyle = "#2a1c12";
  ctx.fillRect(-6, -22, 12, 3);

  ctx.restore();
}

function drawArcadeBackdrop(ctx, field, viewW, viewH){
  // céu/arquibancada estilizados
  const grad = ctx.createLinearGradient(0,0,0,field.groundY);
  grad.addColorStop(0, "#12345c");
  grad.addColorStop(1, "#1c5a3a");
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,field.w, field.groundY);

  // luzes de arquibancada (pontinhos)
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  for(let i=0;i<14;i++){
    const px = (i*23 + 11) % field.w;
    const py = 14 + (i%3)*10;
    ctx.fillRect(px, py, 2, 2);
  }

  // grama
  const stripeH = 22;
  for(let yy = field.groundY - 4; yy < field.h; yy += stripeH){
    ctx.fillStyle = (Math.floor((yy-field.groundY)/stripeH) % 2 === 0) ? "#1f7a34" : "#248a3b";
    ctx.fillRect(0, yy, field.w, stripeH);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, field.groundY);
  ctx.lineTo(field.w, field.groundY);
  ctx.stroke();
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
  const scale = Math.min(viewW/field.w, viewH/field.h);
  const offX = (viewW - field.w*scale)/2;
  const offY = (viewH - field.h*scale)/2;

  ctx.save();
  ctx.translate(offX, offY);
  ctx.scale(scale, scale);

  drawArcadeBackdrop(ctx, field, viewW, viewH);

  // linha da "janela de toque" — ajuda o jogador a calibrar o timing
  if(a.phase === "playing"){
    const winY = field.groundY - a.windowH;
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.setLineDash([4,4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(field.w/2 - 60, winY);
    ctx.lineTo(field.w/2 + 60, winY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const breathe = performance.now()/280;
  drawJuggler(ctx, field.w/2, field.groundY, a.kickPose, breathe);

  if(a.ball && (a.phase === "playing" || a.phase === "dropped")){
    const ballY = field.groundY - a.ball.h;
    const ballX = field.w/2 + Math.sin(a.ball.sway)*3;
    drawArcadeShadow(ctx, ballX, field.groundY, 5, arcClamp(0.3 - a.ball.h*0.002, 0.05, 0.3));
    drawArcadeBall(ctx, ballX, ballY, a.ball.h*0.05);
    a.ball.x = ballX;
  }

  // partículas
  a.particles.forEach(p=>{
    const alpha = arcClamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  ctx.restore();
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
  if(!a || a.phase === "done") return;
  a.phase = "done";
  a.running = false;
  arcCrowdStop();
  arcSfxWhistle();

  document.getElementById("arcadeHud").classList.add("hidden");
  document.getElementById("arcadeStage").classList.add("hidden");

  const score = { home: a.homeGoals, away: a.awayGoals };
  const outcome = a.cfg.winCondition ? a.cfg.winCondition(score) : arcadeDefaultWinCondition(score);

  document.getElementById("arcadeResultScore").textContent = `${score.home} - ${score.away}`;
  document.getElementById("arcadeResultSub").textContent =
    `Sequência: ${a.bestCombo} embaixadinhas seguidas` + (a.homeGoals ? ` · ${a.homeGoals} gol${a.homeGoals>1?"s":""}` : "");
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
