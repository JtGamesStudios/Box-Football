/* =========================================================
   MODO VÔLEI DE PRAIA — duelo 1x1 em tempo real (canvas), no
   estilo do minigame clássico de vôlei de praia do Pou. Roda em
   paralelo aos outros motores (matchsim.js = QTE, arcade.js =
   embaixadinha, penalty.js = pênaltis, soccer2d.js = Arena 2D) e
   NÃO substitui nenhum deles — é um modo novo, próprio.

   Uso (mesma filosofia de assinatura dos outros motores):

     startBeachVolleyMatch({
       competitionLabel, title, homeTeamName, awayTeamName,
       homeLineup, awayLineup,
       difficulty: "facil"|"normal"|"dificil"|"lendario",
       pointsToWin: 7,
       onComplete(result)
     });

   onComplete recebe: { homeGoals, awayGoals, result, usedHomeIds,
   cardEvents, injuryEvents } — homeGoals/awayGoals aqui representam
   os PONTOS de cada lado (mantém o mesmo formato dos outros motores
   pra quem for consumir o resultado, ex: eventos).

   A IA já nasce com o mesmo "cérebro" com previsão de trajetória
   usado no soccer2d.js (aprendida do problema de IA passiva): ela
   nunca fica esperando parada, sempre se posiciona ANTES da bola
   chegar, e vira praticamente uma parede perto da própria quadra.
   ========================================================= */

const BV_DIFFICULTIES = [
  { id: "facil",    label: "Fácil",    oppStrengthDelta: -16, reaction: 0.55, aimSkill: 0.42, speedMult: 0.92, errorPx: 44, anticipation: 0.35 },
  { id: "normal",   label: "Normal",   oppStrengthDelta: 0,   reaction: 0.78, aimSkill: 0.64, speedMult: 1.00, errorPx: 26, anticipation: 0.58 },
  { id: "dificil",  label: "Difícil",  oppStrengthDelta: 12,  reaction: 0.90, aimSkill: 0.80, speedMult: 1.08, errorPx: 14, anticipation: 0.78 },
  { id: "lendario", label: "Lendário", oppStrengthDelta: 22,  reaction: 0.99, aimSkill: 0.94, speedMult: 1.18, errorPx: 3,  anticipation: 0.96 },
];
function getBVDifficulty(id){ return BV_DIFFICULTIES.find(d => d.id === id) || BV_DIFFICULTIES[1]; }

const BV_TARGETS = [
  { id: "curto",  label: "5 pontos",  points: 5  },
  { id: "medio",  label: "7 pontos",  points: 7  },
  { id: "longo",  label: "11 pontos", points: 11 },
];

const BV_DEFAULTS = {
  competitionLabel: "Vôlei de Praia",
  title: "Vôlei de Praia",
  homeTeamName: "Meu Clube",
  awayTeamName: "COM",
  homeLineup: null,
  awayLineup: null,
  difficulty: "normal",
  pointsToWin: 7,
  onComplete: null,
};

let _bv = null;

/* =========================================================
   ÁUDIO — mesma abordagem sintetizada via Web Audio API já
   usada em soccer2d.js/arcade.js, com nomes próprios.
   ========================================================= */
let _bvAudioCtx = null;
function bvAudioOn(){ return !!(typeof STATE !== "undefined" && STATE.settings && STATE.settings.sound); }
function bvVibrate(pattern){
  if(typeof STATE !== "undefined" && STATE.settings && STATE.settings.vibration && navigator.vibrate){
    try{ navigator.vibrate(pattern); }catch(e){}
  }
}
function bvCtx(){
  if(!bvAudioOn()) return null;
  if(!_bvAudioCtx){
    try{ _bvAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ return null; }
  }
  if(_bvAudioCtx.state === "suspended") _bvAudioCtx.resume();
  return _bvAudioCtx;
}
function bvTone(freq, dur, type, vol, when){
  const ctx = bvCtx(); if(!ctx) return;
  const t0 = ctx.currentTime + (when || 0);
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol ?? 0.14, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}
function bvSfxHit(power){ bvTone(320 + Math.min(power,700)*0.2, 0.08, "sine", 0.15); }
function bvSfxNet(){ bvTone(180, 0.12, "square", 0.12); }
function bvSfxSand(){ bvTone(120, 0.1, "triangle", 0.1); }
function bvSfxPoint(win){ if(win){ bvTone(660,0.12,"triangle",0.2); bvTone(880,0.16,"triangle",0.2,0.1); bvTone(1100,0.2,"triangle",0.22,0.2); } else { bvTone(300,0.18,"sawtooth",0.14); bvTone(220,0.2,"sawtooth",0.12,0.1); } }
function bvSfxWhistle(){ bvTone(1500, 0.35, "square", 0.1); }
let _bvWaveNode = null;
function bvWaveStart(){
  const ctx = bvCtx(); if(!ctx || _bvWaveNode) return;
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * 0.6;
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 340; filter.Q.value = 0.5;
  const gain = ctx.createGain(); gain.gain.value = 0.03;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  _bvWaveNode = { src, gain };
}
function bvWaveStop(){
  if(_bvWaveNode){ try{ _bvWaveNode.src.stop(); }catch(e){} _bvWaveNode = null; }
}

/* =========================================================
   OVERLAY / DOM — mesmo esqueleto visual do soccer2d.js
   (intro → hud+quadra → resultado), com estilo próprio (praia).
   ========================================================= */
function ensureBVStyles(){
  if(document.getElementById("bvStyles")) return;
  const style = document.createElement("style");
  style.id = "bvStyles";
  style.textContent = `
  .bv-overlay{position:fixed;inset:0;background:#0b1220;z-index:9999;display:flex;flex-direction:column;font-family:var(--font-body);color:#fff;}
  .bv-overlay.hidden{display:none;}
  .bv-intro,.bv-result{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;}
  .bv-comp-label{font-family:var(--font-display);font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);}
  .bv-vs-row{display:flex;align-items:center;gap:14px;font-family:var(--font-display);font-size:19px;flex-wrap:wrap;justify-content:center;}
  .bv-vs-badge{background:var(--brand);border-radius:var(--radius-sm);padding:4px 10px;font-size:12px;}
  .bv-sub{color:#B9C2CE;font-size:13px;max-width:340px;line-height:1.5;}
  .bv-diff-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,201,60,.12);border:1px solid rgba(255,201,60,.4);color:var(--gold);border-radius:999px;padding:5px 12px;font-family:var(--font-display);font-size:12px;letter-spacing:.03em;}
  .bv-btn{border:none;border-radius:var(--radius-md);padding:14px 28px;font-family:var(--font-display);font-size:16px;background:var(--brand);color:#fff;box-shadow:var(--shadow-card);}
  .bv-btn:active{transform:scale(0.97);}
  .bv-result-score{font-family:var(--font-display);font-size:42px;}
  .bv-result-sub{color:#B9C2CE;font-size:13px;}
  .bv-result-title{font-family:var(--font-display);font-size:24px;}
  .bv-result-title.win{color:var(--turf);}
  .bv-result-title.loss{color:var(--crimson);}
  .bv-hud{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#0b1220;border-bottom:1px solid rgba(255,255,255,.08);font-family:var(--font-display);font-size:13px;flex-shrink:0;position:relative;z-index:3;}
  .bv-hud .side{display:flex;align-items:center;gap:6px;min-width:64px;}
  .bv-hud .side .lbl{font-family:var(--font-body);font-size:9.5px;color:#7C8AA0;text-transform:uppercase;display:block;}
  .bv-hud .goals{font-size:20px;}
  .bv-hud .mid{text-align:center;color:#fff;font-family:var(--font-display);font-size:14px;}
  .bv-stage{position:relative;flex:1;overflow:hidden;touch-action:none;background:#2a8fc4;}
  .bv-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;}
  .bv-touch{position:absolute;inset:0;z-index:12;display:none;pointer-events:none;}
  @media (hover:none) and (pointer:coarse){ .bv-touch{display:block;} .bv-hint-desktop{display:none;} }
  @media (hover:hover) and (pointer:fine){ .bv-hint-mobile{display:none;} }
  .bv-joybase{position:absolute;left:18px;bottom:20px;width:104px;height:72px;border-radius:36px;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.4);pointer-events:auto;}
  .bv-joyknob{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(25,140,255,.55);border:2px solid var(--brand);}
  .bv-actbtn{position:absolute;width:64px;height:64px;border-radius:50%;pointer-events:auto;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:var(--font-display);color:#0b1220;border:3px solid rgba(0,0,0,.35);user-select:none;}
  .bv-btn-hit{right:20px;bottom:26px;background:rgba(230,57,80,.85);}
  .bv-btn-jump{right:96px;bottom:64px;background:rgba(25,140,255,.85);}
  .bv-flash{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:2;}
  .bv-flash.point{animation:bvFlashPoint .5s ease;}
  @keyframes bvFlashPoint{ 0%{opacity:.4; background:#fff;} 100%{opacity:0;} }
  .bv-setup-diffgrid,.bv-setup-durgrid{display:flex;gap:8px;flex-wrap:wrap;}
  .bv-chip{flex:1 1 auto;min-width:78px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text);border-radius:var(--radius-sm);padding:9px 10px;font-family:var(--font-display);font-size:12.5px;text-align:center;cursor:pointer;}
  .bv-chip.active{border-color:var(--brand);background:var(--brand-light);color:var(--brand-dim);}
  .bv-lineup-preview{display:flex;align-items:center;gap:10px;background:var(--surface-2);border-radius:var(--radius-sm);padding:10px 12px;margin:10px 0;}
  .bv-lineup-preview .num{font-family:var(--font-display);font-size:18px;color:var(--brand);min-width:26px;text-align:center;}
  `;
  document.head.appendChild(style);
}

function ensureBVOverlay(){
  ensureBVStyles();
  if(document.getElementById("bvOverlay")) return;
  const div = document.createElement("div");
  div.className = "bv-overlay hidden";
  div.id = "bvOverlay";
  div.innerHTML = `
    <div class="bv-intro" id="bvIntro">
      <div class="bv-comp-label" id="bvCompLabel">Vôlei de Praia</div>
      <div class="bv-vs-row">
        <span id="bvHomeName">Meu Clube</span>
        <span class="bv-vs-badge">VS</span>
        <span id="bvAwayName">COM</span>
      </div>
      <div class="bv-diff-badge" id="bvDiffBadge">Normal</div>
      <div class="bv-sub bv-hint-desktop">
        Setas ← → move · ↑ / Espaço pula · X toca na bola<br>Pule perto da bola pra cortar!
      </div>
      <div class="bv-sub bv-hint-mobile">
        Analógico esquerdo move · botões à direita pulam/tocam<br>Pule perto da bola pra cortar!
      </div>
      <button class="bv-btn" id="bvStartBtn">Começar ›</button>
    </div>

    <div class="bv-hud hidden" id="bvHud">
      <div class="side"><span class="lbl" id="bvHomeShort">CASA</span><span class="goals" id="bvHomeGoals">0</span></div>
      <div class="mid" id="bvSetInfo">Sets: 0-0</div>
      <div class="side"><span class="lbl" id="bvAwayShort">FORA</span><span class="goals" id="bvAwayGoals">0</span></div>
    </div>

    <div class="bv-stage hidden" id="bvStage">
      <canvas id="bvCanvas"></canvas>
      <div class="bv-flash" id="bvFlash"></div>
      <div class="bv-touch" id="bvTouch">
        <div class="bv-joybase" id="bvJoyBase"><div class="bv-joyknob" id="bvJoyKnob"></div></div>
        <div class="bv-actbtn bv-btn-jump" id="bvBtnJump">PULO</div>
        <div class="bv-actbtn bv-btn-hit" id="bvBtnHit">TOCAR</div>
      </div>
    </div>

    <div class="bv-result hidden" id="bvResult">
      <div class="bv-result-title" id="bvResultTitle">Vitória!</div>
      <div class="bv-result-score" id="bvResultScore">7 - 4</div>
      <div class="bv-result-sub" id="bvResultSub"></div>
      <button class="bv-btn" id="bvResultBtn">Continuar</button>
    </div>
  `;
  document.body.appendChild(div);
  wireBVInput();
}

/* =========================================================
   TELA DE PREPARAÇÃO (opcional) — escolher dificuldade e
   quantidade de pontos, ver o jogador que vai representar o clube.
   ========================================================= */
let _bvSelectedDifficulty = "normal";
let _bvSelectedTarget = "medio";

function renderBeachVolleyScreen(){
  const diffWrap = document.getElementById("bvSetupDiffGrid");
  const durWrap = document.getElementById("bvSetupDurGrid");
  const preview = document.getElementById("bvSetupPreview");
  if(!diffWrap || !durWrap) return;

  diffWrap.innerHTML = BV_DIFFICULTIES.map(d =>
    `<button type="button" class="bv-chip${d.id===_bvSelectedDifficulty?' active':''}" data-diff="${d.id}">${d.label}</button>`
  ).join("");
  durWrap.innerHTML = BV_TARGETS.map(d =>
    `<button type="button" class="bv-chip${d.id===_bvSelectedTarget?' active':''}" data-dur="${d.id}">${d.label}</button>`
  ).join("");

  diffWrap.querySelectorAll("[data-diff]").forEach(btn=>{
    btn.onclick = ()=>{ _bvSelectedDifficulty = btn.dataset.diff; renderBeachVolleyScreen(); };
  });
  durWrap.querySelectorAll("[data-dur]").forEach(btn=>{
    btn.onclick = ()=>{ _bvSelectedTarget = btn.dataset.dur; renderBeachVolleyScreen(); };
  });

  const homeLineup = typeof buildCampaignHomeLineup === "function" ? buildCampaignHomeLineup() : null;
  const attacker = typeof pickArcadeAttacker === "function" ? pickArcadeAttacker(homeLineup) : null;
  if(preview){
    if(attacker){
      preview.innerHTML = `
        <div class="bv-lineup-preview">
          <span class="num">${attacker.number ?? "-"}</span>
          <div>
            <div style="font-family:var(--font-display);font-size:14px;">${attacker.name}</div>
            <div style="font-size:11.5px;color:var(--text-muted);">${attacker.pos || "ATA"} · OVR ${attacker.ovr ?? "-"} — vai representar o clube no Vôlei de Praia</div>
          </div>
        </div>`;
    } else {
      preview.innerHTML = `<p class="page-sub" style="margin:0;">Você ainda não montou uma escalação — o Vôlei de Praia vai usar um jogador genérico. Monte seu time em Escalação pra jogar com seus craques.</p>`;
    }
  }
}

function launchBeachVolleyFriendly(){
  const homeLineup = typeof buildCampaignHomeLineup === "function" ? buildCampaignHomeLineup() : null;
  const diff = getBVDifficulty(_bvSelectedDifficulty);
  const target = BV_TARGETS.find(d => d.id === _bvSelectedTarget) || BV_TARGETS[1];

  const baseStrength = 60;
  const opponentStrength = Math.min(99, Math.max(30, baseStrength + diff.oppStrengthDelta));
  const awayLineup = typeof generateOpponentLineup === "function" ? generateOpponentLineup(opponentStrength) : null;

  startBeachVolleyMatch({
    competitionLabel: "Vôlei de Praia — Amistoso",
    title: "Vôlei de Praia",
    homeTeamName: "Meu Clube",
    awayTeamName: pickBVOpponentName(),
    homeLineup,
    awayLineup,
    difficulty: diff.id,
    pointsToWin: target.points,
    onComplete: (result)=>{
      const reward = result.result === "win" ? { gp: 120, coins: 0 } : result.result === "draw" ? { gp: 60, coins: 0 } : { gp: 20, coins: 0 };
      grantCurrency(reward.gp, reward.coins);
      const msg = result.result === "win" ? `Vitória no Vôlei de Praia! +${reward.gp} GP`
                : result.result === "draw" ? `Empate no Vôlei de Praia. +${reward.gp} GP`
                : `Derrota no Vôlei de Praia. +${reward.gp} GP de consolação.`;
      toast(msg, result.result === "loss" ? "" : "success");
    }
  });
}

const BV_OPPONENT_NAMES = ["Furacão FC","Atlético Rival","União Norte","Estrela Azul","Leões do Sul","Vitória FC","Real Metropolitano","Grêmio das Águias"];
function pickBVOpponentName(){ return BV_OPPONENT_NAMES[Math.floor(Math.random()*BV_OPPONENT_NAMES.length)]; }

/* =========================================================
   MOTOR — física, IA, desenho
   ========================================================= */
const BV_FIELD_W = 960, BV_FIELD_H = 540;
const BV_GROUND_Y = BV_FIELD_H - 70;
const BV_ARENA_L = 40, BV_ARENA_R = BV_FIELD_W - 40;
const BV_NET_X = BV_FIELD_W / 2;
const BV_NET_TOP_Y = BV_GROUND_Y - 150;
const BV_NET_THICK = 7;
const BV_GRAVITY = 1450;

function bvClamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function bvDist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

function bvHashHue(str){
  let h = 0;
  for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) % 360;
  return Math.abs(h);
}
function bvHsl(h,s,l){ return `hsl(${h}, ${s}%, ${l}%)`; }

function buildBVFighterKit(side, teamName){
  if(side === "home"){
    return { shirt: "#198CFF", shirt2: "#0F6FD1", shorts: "#0E1726", skin: "#e0a878" };
  }
  const hue = bvHashHue(teamName || "COM");
  return {
    shirt: bvHsl(hue, 70, 48),
    shirt2: bvHsl((hue+40)%360, 60, 30),
    shorts: "#111318",
    skin: ["#e0a878","#c98f5e","#8d5a3b","#f0c9a0"][hue % 4],
  };
}

function makeBVFighter(side, startX, attrs, teamName, playerName, number){
  const kit = buildBVFighterKit(side, teamName);
  return {
    side, x:startX, airY:0, vy:0, vx:0, facing: side==="home"?1:-1,
    onGround:true, hitCooldown:0, animT:Math.random()*10,
    headR:19, bodyH:30, legH:20, kit, name: playerName || (side==="home"?"Jogador":"COM"),
    number: number || 9,
    attrs,
    moveSpeed: 210 + (attrs.pace||60) * 0.85,
    jumpV: 620 + (attrs.physical||60) * 1.0,
    hitPow: 480 + (attrs.shot||60) * 1.2,
    reach: 46 + (attrs.dribble||60) * 0.05,
    fatigue: 0,
  };
}

function startBeachVolleyMatch(userConfig){
  const cfg = Object.assign({}, BV_DEFAULTS, userConfig || {});
  const diff = getBVDifficulty(cfg.difficulty);

  const homeAttacker = typeof pickArcadeAttacker === "function" ? pickArcadeAttacker(cfg.homeLineup) : { name:"Jogador", number:9, attrs:{pace:60,dribble:60,pass:60,shot:60,physical:60} };
  const awayAttacker = typeof pickArcadeAttacker === "function" ? pickArcadeAttacker(cfg.awayLineup) : { name:"COM", number:9, attrs:{pace:60,dribble:60,pass:60,shot:60,physical:60} };
  const homeAttrs = homeAttacker.attrs || (typeof deriveArcadeAttributes === "function" ? deriveArcadeAttributes(homeAttacker) : {pace:60,dribble:60,pass:60,shot:60,physical:60});
  const awayAttrs = awayAttacker.attrs || (typeof deriveArcadeAttributes === "function" ? deriveArcadeAttributes(awayAttacker) : {pace:60,dribble:60,pass:60,shot:60,physical:60});

  const home = makeBVFighter("home", BV_FIELD_W*0.25, homeAttrs, cfg.homeTeamName, homeAttacker.name, homeAttacker.number);
  const away = makeBVFighter("away", BV_FIELD_W*0.75, awayAttrs, cfg.awayTeamName, awayAttacker.name, awayAttacker.number);
  away.moveSpeed *= diff.speedMult;
  away.reach *= (1 + diff.anticipation*0.22);

  _bv = {
    cfg, diff, home, away,
    ball: { x:BV_FIELD_W/2, y:BV_GROUND_Y-260, vx:(Math.random()-0.5)*60, vy:0, r:13, spin:0 },
    score: { home:0, away:0 },
    pointsToWin: cfg.pointsToWin,
    paused: true, phase: "intro", flashPoint: 0,
    particles: [],
    lastTouchSide: null,
    usedHomeIds: new Set(homeAttacker.id ? [homeAttacker.id] : []),
    canvas: null, ctx: null, running: false,
    keys: {}, touch: { dx:0, active:false, jump:false, hit:false },
  };

  ensureBVOverlay();
  document.getElementById("bvCompLabel").textContent = cfg.competitionLabel;
  document.getElementById("bvHomeName").textContent = cfg.homeTeamName;
  document.getElementById("bvAwayName").textContent = cfg.awayTeamName;
  document.getElementById("bvHomeShort").textContent = (cfg.homeTeamName || "CASA").slice(0,3).toUpperCase();
  document.getElementById("bvAwayShort").textContent = (cfg.awayTeamName || "FORA").slice(0,3).toUpperCase();
  document.getElementById("bvDiffBadge").textContent = "Dificuldade: " + diff.label;

  document.getElementById("bvIntro").classList.remove("hidden");
  document.getElementById("bvHud").classList.add("hidden");
  document.getElementById("bvStage").classList.add("hidden");
  document.getElementById("bvResult").classList.add("hidden");
  document.getElementById("bvOverlay").classList.remove("hidden");

  document.getElementById("bvStartBtn").onclick = ()=>{
    document.getElementById("bvIntro").classList.add("hidden");
    document.getElementById("bvHud").classList.remove("hidden");
    document.getElementById("bvStage").classList.remove("hidden");
    bvSfxWhistle();
    bvWaveStart();
    setupBVCanvas();
    bvResetRally(null);
    updateBVHud();
    _bv.paused = false; _bv.phase = "playing";
    _bv.running = true; _bv.lastT = performance.now();
    requestAnimationFrame(bvLoop);
  };
}

function setupBVCanvas(){
  const canvas = document.getElementById("bvCanvas");
  const stage = document.getElementById("bvStage");
  function resize(){
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.round(stage.clientWidth * dpr));
    canvas.height = Math.max(2, Math.round(stage.clientHeight * dpr));
  }
  resize();
  window.addEventListener("resize", resize);
  _bv.canvas = canvas;
  _bv.ctx = canvas.getContext("2d");
}

/* Reseta a bola pro início de uma jogada. `servingSide` (ou null) define
   de que lado ela cai — se null, cai neutra no centro. */
function bvResetRally(servingSide){
  const a = _bv;
  a.home.x = BV_FIELD_W*0.25; a.home.airY=0; a.home.vy=0; a.home.vx=0; a.home.onGround=true;
  a.away.x = BV_FIELD_W*0.75; a.away.airY=0; a.away.vy=0; a.away.vx=0; a.away.onGround=true;
  a.lastTouchSide = null;
  const dropX = servingSide === "home" ? BV_FIELD_W*0.25 : servingSide === "away" ? BV_FIELD_W*0.75 : BV_FIELD_W*0.5;
  a.ball.x = dropX; a.ball.y = BV_GROUND_Y-280; a.ball.vx = (Math.random()-0.5)*70; a.ball.vy = 0;
}

/* ---------- LOOP ---------- */
function bvLoop(now){
  const a = _bv;
  if(!a || !a.running) return;
  const dt = Math.min(0.033, (now - a.lastT)/1000);
  a.lastT = now;
  if(!a.paused && a.phase === "playing") bvUpdate(dt);
  bvDraw();
  requestAnimationFrame(bvLoop);
}

function bvUpdate(dt){
  const a = _bv;

  bvHandlePlayer(a.home, dt, {
    left: a.keys.ArrowLeft, right: a.keys.ArrowRight,
    jump: a.keys.ArrowUp || a.keys.Space || a.touch.jump,
    hit: a.keys.KeyX || a.touch.hit,
    axis: a.touch.active ? a.touch.dx : 0,
  });
  bvHandleAI(a.away, dt);

  bvUpdateBall(dt);
  bvResolveCollision(a.home);
  bvResolveCollision(a.away);
  bvUpdateParticles(dt);
}

function bvHandlePlayer(f, dt, input){
  let dir = 0;
  if(input.left) dir -= 1;
  if(input.right) dir += 1;
  if(input.axis) dir += input.axis;
  dir = bvClamp(dir, -1, 1);
  const speed = f.moveSpeed * (1 - f.fatigue);
  f.vx = dir*speed;
  f.x += f.vx*dt;
  // cada jogador fica preso ao seu lado da quadra — não pode invadir
  // o campo adversário atravessando a rede.
  if(f.side === "home") f.x = bvClamp(f.x, BV_ARENA_L+f.headR, BV_NET_X-18-f.headR);
  else f.x = bvClamp(f.x, BV_NET_X+18+f.headR, BV_ARENA_R-f.headR);
  if(Math.abs(dir) > 0.05) f.facing = dir>0?1:-1;

  if(input.jump && f.onGround){ f.vy = f.jumpV; f.onGround=false; bvVibrate(12); }
  bvPhysicsFighter(f, dt);

  if(f.hitCooldown > 0) f.hitCooldown -= dt;
  if(input.hit && f.hitCooldown <= 0){
    const feetY = BV_GROUND_Y - f.airY;
    const d = bvDist(f.x, feetY-f.legH*1.1, _bv.ball.x, _bv.ball.y);
    if(d < f.reach + 2){
      bvHitBall(f, _bv.ball);
      f.hitCooldown = 0.32;
    }
  }
}

function bvPhysicsFighter(f, dt){
  if(!f.onGround){
    f.vy -= BV_GRAVITY*dt;
    f.airY += f.vy*dt;
    if(f.airY <= 0){ f.airY = 0; f.vy = 0; f.onGround = true; }
  }
  const moving = Math.abs(f.vx) > 10;
  f.animT += (moving ? 0.3 : 0.06);
}

function bvHitBall(f, ball){
  const power = f.hitPow * (0.92 + Math.random()*0.16);
  ball.vx = f.facing*power*0.62 + f.vx*0.3;
  ball.vy = power*0.9;
  _bv.lastTouchSide = f.side;
  bvSfxHit(power);
  bvSpawnHitParticles(ball.x, ball.y, f.facing);
}

/* ---------- IA do CPU — mesmo "cérebro" com previsão de trajetória
   usado no soccer2d.js: nunca fica esperando parada, se posiciona
   ANTES da bola chegar e vira praticamente uma parede perto da
   própria quadra/rede. ---------- */
function bvPredictBallAt(ball, aheadSec){
  let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  const step = 0.03;
  let t = 0;
  while(t < aheadSec){
    vy -= BV_GRAVITY*step;
    x += vx*step;
    y -= vy*step;
    if(y > BV_GROUND_Y-13){ y = BV_GROUND_Y-13; vy = 0; vx *= 0.9; }
    x = bvClamp(x, BV_ARENA_L+13, BV_ARENA_R-13);
    t += step;
  }
  return { x, y, vx, vy };
}

function bvHandleAI(f, dt){
  const a = _bv, diff = a.diff, ball = a.ball;
  const speed = f.moveSpeed * (1 - f.fatigue);

  const homeBaseX = BV_FIELD_W*0.75; // posição de cobertura padrão do CPU
  const ballOnMySide = ball.x > BV_NET_X;
  const danger = ballOnMySide && ball.x > BV_NET_X + 40; // bola já cruzou pro lado dele

  const lookAhead = 0.12 + diff.anticipation*0.3;
  const predicted = bvPredictBallAt(ball, lookAhead);
  const trackX = ball.x*(1-diff.anticipation) + predicted.x*diff.anticipation;

  let targetX;
  if(ballOnMySide){
    // bola do lado dele: SEMPRE vai atrás de verdade, nunca fica esperando
    const coverWeight = danger ? 0.95 : 0.8;
    targetX = trackX*coverWeight + homeBaseX*(1-coverWeight);
  } else {
    // bola ainda do lado do jogador: mantém posição de cobertura central,
    // levemente puxada em direção a onde a bola tende a cair (antecipação),
    // pronto pra já estar posicionado quando ela cruzar a rede.
    targetX = homeBaseX*0.55 + bvClamp(predicted.x, BV_NET_X+30, BV_ARENA_R-30)*0.45;
  }
  targetX += (Math.random()-0.5) * diff.errorPx;
  targetX = bvClamp(targetX, BV_NET_X+18+f.headR, BV_ARENA_R-f.headR);

  const toTarget = targetX - f.x;
  const dirSign = Math.sign(toTarget);
  let dir = Math.abs(toTarget) > 5 ? dirSign : 0;
  f.vx = dir*speed*0.97;
  f.x += f.vx*dt;
  f.x = bvClamp(f.x, BV_NET_X+18+f.headR, BV_ARENA_R-f.headR);
  if(Math.abs(dir) > 0.05) f.facing = dir>0?1:-1;

  const reactionNow = danger ? Math.min(1, diff.reaction + 0.2) : diff.reaction;

  const feetY = BV_GROUND_Y - f.airY;
  const ballAbove = ball.y < feetY - f.legH - f.bodyH*0.3;
  const closeX = Math.abs(ball.x - f.x) < 78;
  if(f.onGround && ballOnMySide && closeX && ballAbove && Math.random() < reactionNow){
    f.vy = f.jumpV; f.onGround = false;
  }
  bvPhysicsFighter(f, dt);

  if(f.hitCooldown > 0) f.hitCooldown -= dt;
  const d = bvDist(f.x, feetY-f.legH*1.1, ball.x, ball.y);
  if(ballOnMySide && d < f.reach + 4 && f.hitCooldown <= 0 && Math.random() < reactionNow){
    const aimSpread = (1 - diff.aimSkill) * 0.3;
    const aimBias = (Math.random()-0.5) * aimSpread;
    const power = f.hitPow * (0.9 + diff.aimSkill*0.25 + Math.random()*0.1);
    ball.vx = f.facing*power*0.62*(1-Math.abs(aimBias)) + f.vx*0.3;
    ball.vy = power*(0.85 + aimBias);
    f.hitCooldown = 0.36;
    _bv.lastTouchSide = f.side;
    bvSfxHit(power);
    bvSpawnHitParticles(ball.x, ball.y, f.facing);
  }
}

/* ---------- BOLA / COLISÕES ---------- */
function bvUpdateBall(dt){
  const a = _bv, ball = a.ball;
  ball.vy -= BV_GRAVITY*dt;
  ball.x += ball.vx*dt;
  ball.y -= ball.vy*dt;
  ball.spin += ball.vx*dt*0.02;
  ball.vx *= 0.999;

  // paredes laterais da quadra: bola quica de volta (nunca "sai" pro lado)
  if(ball.x - ball.r < BV_ARENA_L){ ball.x = BV_ARENA_L + ball.r; ball.vx = Math.abs(ball.vx)*0.7; }
  if(ball.x + ball.r > BV_ARENA_R){ ball.x = BV_ARENA_R - ball.r; ball.vx = -Math.abs(ball.vx)*0.7; }

  // rede: se a bola tenta cruzar abaixo do topo da rede, bate e volta
  const crossingNet = (ball.x + ball.r > BV_NET_X - BV_NET_THICK/2) && (ball.x - ball.r < BV_NET_X + BV_NET_THICK/2);
  if(crossingNet && ball.y > BV_NET_TOP_Y - ball.r){
    ball.x = ball.x < BV_NET_X ? BV_NET_X - BV_NET_THICK/2 - ball.r : BV_NET_X + BV_NET_THICK/2 + ball.r;
    ball.vx = -ball.vx*0.6;
    bvSfxNet();
  }

  // chão: quem estiver do lado onde ela tocou perde o ponto
  if(ball.y > BV_GROUND_Y - ball.r){
    ball.y = BV_GROUND_Y - ball.r;
    bvSfxSand();
    const losingSide = ball.x < BV_NET_X ? "home" : "away";
    const winningSide = losingSide === "home" ? "away" : "home";
    bvAwardPoint(winningSide, losingSide);
    return;
  }
  if(ball.y < 20){ ball.y = 20; ball.vy = -Math.abs(ball.vy)*0.5; }
}

function bvResolveCollision(f){
  const a = _bv, ball = a.ball;
  const feetY = BV_GROUND_Y - f.airY;
  const hipY = feetY - f.legH;
  const shoulderY = hipY - f.bodyH;
  const headCY = shoulderY - f.headR*0.6;
  const bodyCY = (hipY+shoulderY)/2;
  const bodyR = f.bodyH*0.55;
  const headR = f.headR+3;

  let dx = ball.x-f.x, dy = ball.y-bodyCY, d = Math.hypot(dx,dy);
  if(d < bodyR+ball.r && d>0.01){
    const nx=dx/d, ny=dy/d, pen=(bodyR+ball.r)-d;
    ball.x += nx*pen; ball.y += ny*pen;
    ball.vx = nx*220 + f.vx*0.5;
    ball.vy = Math.max(ball.vy, 0) + 180;
    a.lastTouchSide = f.side;
  }
  dx = ball.x-f.x; dy = ball.y-headCY; d = Math.hypot(dx,dy);
  if(d < headR+ball.r && d>0.01){
    const nx=dx/d, ny=dy/d, pen=(headR+ball.r)-d;
    ball.x += nx*pen; ball.y += ny*pen;
    ball.vx = nx*(320 + (f.attrs.physical||60)*0.6) + f.vx*0.5;
    ball.vy = Math.max(ball.vy, 0) + 260;
    a.lastTouchSide = f.side;
    if(Math.abs(nx)*400 > 260) bvSfxHit(300);
  }
}

/* ---------- PONTOS ---------- */
function bvAwardPoint(winningSide, losingSide){
  const a = _bv;
  if(a.phase !== "playing") return;
  a.score[winningSide]++;
  updateBVHud();
  a.paused = true; a.phase = "point"; a.flashPoint = 1;
  bvSfxPoint(winningSide === "home");
  bvVibrate(winningSide === "home" ? [20,30] : [40,20,40]);
  document.getElementById("bvFlash").classList.add("point");
  setTimeout(()=>{
    document.getElementById("bvFlash").classList.remove("point");
    if(a.score.home >= a.pointsToWin || a.score.away >= a.pointsToWin){
      bvFinishMatch();
      return;
    }
    // quem venceu o ponto "saca" a próxima jogada
    bvResetRally(winningSide);
    a.paused = false; a.phase = "playing";
  }, 900);
}

/* ---------- PARTÍCULAS ---------- */
function bvSpawnHitParticles(x,y,facing){
  const a = _bv;
  for(let i=0;i<6;i++){
    a.particles.push({
      x, y, vx: facing*(120+Math.random()*160), vy: (Math.random()-0.6)*160,
      life: 0.35+Math.random()*0.2, maxLife: 0.5, r: 2+Math.random()*2,
      color: "rgba(255,255,255,0.85)",
    });
  }
}
function bvUpdateParticles(dt){
  const a = _bv;
  a.particles.forEach(p=>{ p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 500*dt; p.life -= dt; });
  a.particles = a.particles.filter(p=>p.life>0);
}

/* ---------- HUD ---------- */
function updateBVHud(){
  const a = _bv;
  document.getElementById("bvHomeGoals").textContent = a.score.home;
  document.getElementById("bvAwayGoals").textContent = a.score.away;
  document.getElementById("bvSetInfo").textContent = `Pontos p/ vencer: ${a.pointsToWin}`;
}

/* =========================================================
   DESENHO
   ========================================================= */
function bvDraw(){
  const a = _bv;
  if(!a || !a.ctx || !a.canvas) return;
  const ctx = a.ctx, canvas = a.canvas;
  const sx = canvas.width / BV_FIELD_W, sy = canvas.height / BV_FIELD_H;

  ctx.save();
  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.scale(sx, sy);

  // céu
  const skyGrad = ctx.createLinearGradient(0,0,0,BV_GROUND_Y);
  skyGrad.addColorStop(0, "#4fc3f7");
  skyGrad.addColorStop(1, "#bfeaff");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0,0,BV_FIELD_W,BV_GROUND_Y);

  // sol
  ctx.fillStyle = "rgba(255,244,180,0.95)";
  ctx.beginPath(); ctx.arc(BV_FIELD_W-90, 70, 40, 0, Math.PI*2); ctx.fill();

  // areia
  const sandGrad = ctx.createLinearGradient(0,BV_GROUND_Y,0,BV_FIELD_H);
  sandGrad.addColorStop(0, "#f1d29a");
  sandGrad.addColorStop(1, "#dcb471");
  ctx.fillStyle = sandGrad;
  ctx.fillRect(0,BV_GROUND_Y,BV_FIELD_W,BV_FIELD_H-BV_GROUND_Y);

  // linha central de quadra
  ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(BV_ARENA_L, BV_GROUND_Y+6); ctx.lineTo(BV_ARENA_R, BV_GROUND_Y+6); ctx.stroke();

  // rede
  ctx.fillStyle = "#e7ecef";
  ctx.fillRect(BV_NET_X-BV_NET_THICK/2, BV_NET_TOP_Y, BV_NET_THICK, BV_GROUND_Y-BV_NET_TOP_Y);
  ctx.strokeStyle = "rgba(20,30,40,0.35)"; ctx.lineWidth = 1;
  for(let ny=BV_NET_TOP_Y; ny<BV_GROUND_Y; ny+=12){
    ctx.beginPath(); ctx.moveTo(BV_NET_X-BV_NET_THICK/2, ny); ctx.lineTo(BV_NET_X+BV_NET_THICK/2, ny); ctx.stroke();
  }
  ctx.fillStyle = "#c62828";
  ctx.fillRect(BV_NET_X-BV_NET_THICK/2-2, BV_NET_TOP_Y-6, BV_NET_THICK+4, 8);

  bvDrawFighter(ctx, a.home);
  bvDrawFighter(ctx, a.away);
  bvDrawBall(ctx, a.ball);
  bvDrawParticles(ctx);

  ctx.restore();
}

function bvDrawFighter(ctx, f){
  const feetY = BV_GROUND_Y - f.airY;
  const hipY = feetY - f.legH;
  const shoulderY = hipY - f.bodyH;
  const headCY = shoulderY - f.headR*0.6;

  // sombra
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  const shrink = Math.max(0.35, 1-(f.airY/260));
  ctx.beginPath(); ctx.ellipse(f.x, BV_GROUND_Y+4, 22*shrink, 7*shrink, 0,0,Math.PI*2); ctx.fill();

  const legSwing = Math.sin(f.animT) * (Math.abs(f.vx) > 10 ? 10 : 2);

  // pernas
  ctx.strokeStyle = f.kit.skin; ctx.lineWidth = 7; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(f.x-6, hipY); ctx.lineTo(f.x-6+legSwing, feetY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(f.x+6, hipY); ctx.lineTo(f.x+6-legSwing, feetY); ctx.stroke();

  // corpo (camisa)
  ctx.fillStyle = f.kit.shirt;
  ctx.beginPath();
  ctx.moveTo(f.x-14, hipY);
  ctx.lineTo(f.x-16, shoulderY);
  ctx.quadraticCurveTo(f.x, shoulderY-8, f.x+16, shoulderY);
  ctx.lineTo(f.x+14, hipY);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = f.kit.shirt2;
  ctx.fillRect(f.x-14, hipY-8, 28, 8);

  // braços (animação de "toque" quando bate na bola)
  const armLift = f.hitCooldown > 0.18 ? -22 : 0;
  ctx.strokeStyle = f.kit.skin; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(f.x-14, shoulderY+2); ctx.lineTo(f.x-22*f.facing*-1, shoulderY-14+armLift); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(f.x+14, shoulderY+2); ctx.lineTo(f.x+22*f.facing, shoulderY-14+armLift); ctx.stroke();

  // shorts
  ctx.fillStyle = f.kit.shorts;
  ctx.fillRect(f.x-14, hipY-6, 28, 10);

  // cabeça
  ctx.fillStyle = f.kit.skin;
  ctx.beginPath(); ctx.arc(f.x, headCY, f.headR, 0, Math.PI*2); ctx.fill();

  // faixa na cabeça (estilo praia)
  ctx.fillStyle = f.kit.shirt2;
  ctx.fillRect(f.x-f.headR, headCY-3, f.headR*2, 5);

  // número na camisa
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 10px var(--font-display, sans-serif)";
  ctx.textAlign = "center";
  ctx.fillText(String(f.number), f.x, hipY-10);
}

function bvDrawBall(ctx, ball){
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  const shrink = Math.max(0.3, 1-(BV_GROUND_Y-ball.y)/300);
  ctx.beginPath(); ctx.ellipse(ball.x, BV_GROUND_Y+2, ball.r*1.3*shrink, ball.r*0.5*shrink,0,0,Math.PI*2); ctx.fill();

  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.spin % (Math.PI*2));
  ctx.fillStyle = "#fff9e8";
  ctx.beginPath(); ctx.arc(0,0, ball.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#e0a83d"; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.arc(0,0,ball.r,-0.5,1.2); ctx.stroke();
  ctx.beginPath(); ctx.arc(0,0,ball.r,2.2,3.9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-ball.r,0); ctx.lineTo(ball.r,0); ctx.stroke();
  ctx.restore();
}

function bvDrawParticles(ctx){
  _bv.particles.forEach(p=>{
    const alpha = bvClamp(p.life/p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/* =========================================================
   FIM DE PARTIDA
   ========================================================= */
function bvFinishMatch(){
  const a = _bv;
  if(!a || a.phase === "done") return;
  a.phase = "done"; a.paused = true; a.running = false;
  bvWaveStop(); bvSfxWhistle();

  document.getElementById("bvHud").classList.add("hidden");
  document.getElementById("bvStage").classList.add("hidden");

  const score = a.score;
  const outcome = score.home > score.away ? "win" : score.home < score.away ? "loss" : "draw";

  document.getElementById("bvResultScore").textContent = `${score.home} - ${score.away}`;
  document.getElementById("bvResultSub").textContent = `${a.cfg.homeTeamName} ${score.home} x ${score.away} ${a.cfg.awayTeamName} · Dificuldade: ${a.diff.label}`;
  const titleEl = document.getElementById("bvResultTitle");
  titleEl.textContent = outcome === "win" ? "Vitória!" : outcome === "draw" ? "Empate" : "Derrota";
  titleEl.className = "bv-result-title " + outcome;
  document.getElementById("bvResult").classList.remove("hidden");

  const result = {
    homeGoals: score.home, awayGoals: score.away, result: outcome,
    cfg: a.cfg,
    usedHomeIds: Array.from(a.usedHomeIds),
    cardEvents: [], injuryEvents: [],
  };

  document.getElementById("bvResultBtn").onclick = ()=>{
    document.getElementById("bvOverlay").classList.add("hidden");
    const onComplete = a.cfg.onComplete;
    _bv = null;
    if(typeof onComplete === "function") onComplete(result);
  };
}

/* =========================================================
   ENTRADA — teclado + toque (joystick + botões)
   ========================================================= */
let _bvInputWired = false;
function wireBVInput(){
  if(_bvInputWired) return;
  _bvInputWired = true;

  window.addEventListener("keydown", e=>{
    if(!_bv || _bv.phase !== "playing") return;
    _bv.keys[e.code] = true;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","KeyX"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", e=>{ if(_bv) _bv.keys[e.code] = false; });

  const joyBase = document.getElementById("bvJoyBase");
  const joyKnob = document.getElementById("bvJoyKnob");
  let joyId = null, joyCx = 0;
  const JOY_R = 44;
  function joyStart(e){
    if(!_bv) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    if(joyId !== null) return;
    joyId = t.identifier===undefined?"mouse":t.identifier;
    const r = joyBase.getBoundingClientRect();
    joyCx = r.left + r.width/2;
    _bv.touch.active = true; joyMove(e); e.preventDefault();
  }
  function joyMove(e){
    if(joyId===null || !_bv) return;
    const touches = e.changedTouches ? Array.from(e.changedTouches) : [e];
    const t = touches.find(tt=>(tt.identifier===undefined?"mouse":tt.identifier)===joyId);
    if(!t) return;
    let dx = t.clientX - joyCx;
    dx = bvClamp(dx, -JOY_R, JOY_R);
    joyKnob.style.left = `calc(50% + ${dx}px)`;
    _bv.touch.dx = Math.abs(dx)>8 ? dx/JOY_R : 0;
    e.preventDefault();
  }
  function joyEnd(){
    joyId = null;
    if(_bv){ _bv.touch.active = false; _bv.touch.dx = 0; }
    joyKnob.style.left = "50%";
  }
  joyBase.addEventListener("touchstart", joyStart, {passive:false});
  joyBase.addEventListener("touchmove", joyMove, {passive:false});
  joyBase.addEventListener("touchend", joyEnd);
  joyBase.addEventListener("touchcancel", joyEnd);
  joyBase.addEventListener("mousedown", joyStart);
  window.addEventListener("mousemove", joyMove);
  window.addEventListener("mouseup", joyEnd);

  function bindHold(id, prop){
    const el = document.getElementById(id);
    const on = e=>{ if(_bv) _bv.touch[prop]=true; e.preventDefault(); };
    const off = ()=>{ if(_bv) _bv.touch[prop]=false; };
    el.addEventListener("touchstart", on, {passive:false});
    el.addEventListener("touchend", off);
    el.addEventListener("touchcancel", off);
    el.addEventListener("mousedown", on);
    el.addEventListener("mouseup", off);
    el.addEventListener("mouseleave", off);
  }
  bindHold("bvBtnJump", "jump");
  bindHold("bvBtnHit", "hit");
}
