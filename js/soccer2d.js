/* =========================================================
   MODO ARENA 2D — duelo em tempo real (canvas), estilo
   "cabeção"/head-soccer, baseado no protótipo Super Soccer 2D
   Arena. Roda em paralelo aos outros motores (matchsim.js =
   QTE, arcade.js = embaixadinha, penalty.js = pênaltis) e NÃO
   substitui nenhum deles — é um modo novo, próprio.

   FASE 1 deste modo (atual): 100% OFFLINE, contra o CPU.
   A base já foi deixada pronta para a FASE 2 (duelo online via
   Firestore, sincronizando posição/gols) — ver o bloco
   "GANCHOS PRA FASE ONLINE" perto do fim do arquivo.

   Uso (mesma assinatura que startMatch()/startArcadeMatch()):

     startSoccer2DMatch({
       competitionLabel, title, homeTeamName, awayTeamName,
       homeLineup, awayLineup,
       difficulty: "facil"|"normal"|"dificil"|"lendario",
       matchSeconds: 60,
       onComplete(result)
     });

   onComplete recebe o MESMO formato de objeto de sempre:
     { homeGoals, awayGoals, result, usedHomeIds, cardEvents, injuryEvents }
   (cardEvents/injuryEvents sempre vêm vazios aqui — não fazem
   sentido num duelo 1x1 arcade, mas ficam pra manter compatível
   com quem consumir o resultado igual aos outros motores.)

   Atributos dos jogadores (pace/dribble/pass/shot/physical) são
   derivados via deriveArcadeAttributes()/pickArcadeAttacker(),
   já existentes em js/arcade.js — reaproveitados aqui pra não
   duplicar lógica e manter a mesma curva de força em todo o jogo.
   ========================================================= */

const S2D_DIFFICULTIES = [
  { id: "facil",    label: "Fácil",    oppStrengthDelta: -16, reaction: 0.42, jumpSkill: 0.45, aimSkill: 0.35, speedMult: 0.88, errorPx: 60 },
  { id: "normal",   label: "Normal",   oppStrengthDelta: 0,   reaction: 0.62, jumpSkill: 0.62, aimSkill: 0.55, speedMult: 0.97, errorPx: 38 },
  { id: "dificil",  label: "Difícil",  oppStrengthDelta: 12,  reaction: 0.80, jumpSkill: 0.80, aimSkill: 0.74, speedMult: 1.05, errorPx: 20 },
  { id: "lendario", label: "Lendário", oppStrengthDelta: 22,  reaction: 0.94, jumpSkill: 0.93, aimSkill: 0.90, speedMult: 1.12, errorPx: 8  },
];
function getS2DDifficulty(id){ return S2D_DIFFICULTIES.find(d => d.id === id) || S2D_DIFFICULTIES[1]; }

const S2D_DURATIONS = [
  { id: "curta", label: "1 min",     seconds: 60  },
  { id: "media", label: "1min30",    seconds: 90  },
  { id: "longa", label: "2 min",     seconds: 120 },
];

const S2D_DEFAULTS = {
  competitionLabel: "Arena 2D",
  title: "Arena 2D",
  homeTeamName: "Meu Clube",
  awayTeamName: "COM",
  homeLineup: null,
  awayLineup: null,
  difficulty: "normal",
  matchSeconds: 60,
  onComplete: null,
};

let _s2d = null;

/* =========================================================
   ÁUDIO — mesma abordagem sintetizada via Web Audio API já
   usada no resto do jogo (arcade.js), só com nomes próprios
   pra não colidir com nada.
   ========================================================= */
let _s2dAudioCtx = null;
function s2dAudioOn(){ return !!(typeof STATE !== "undefined" && STATE.settings && STATE.settings.sound); }
function s2dVibrate(pattern){
  if(typeof STATE !== "undefined" && STATE.settings && STATE.settings.vibration && navigator.vibrate){
    try{ navigator.vibrate(pattern); }catch(e){}
  }
}
function s2dCtx(){
  if(!s2dAudioOn()) return null;
  if(!_s2dAudioCtx){
    try{ _s2dAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch(e){ return null; }
  }
  if(_s2dAudioCtx.state === "suspended") _s2dAudioCtx.resume();
  return _s2dAudioCtx;
}
function s2dTone(freq, dur, type, vol, when){
  const ctx = s2dCtx(); if(!ctx) return;
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
function s2dNoise(dur, vol){
  const ctx = s2dCtx(); if(!ctx) return;
  const n = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<n;i++) data[i] = (Math.random()*2-1) * (1 - i/n);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain(); gain.gain.setValueAtTime(vol ?? 0.18, ctx.currentTime);
  src.connect(gain).connect(ctx.destination); src.start();
}
function s2dSfxKick(power){ s2dTone(180 + Math.min(power,700)*0.25, 0.09, "square", 0.13); s2dNoise(0.05, 0.08); }
function s2dSfxHeader(){ s2dTone(140, 0.1, "triangle", 0.12); }
function s2dSfxWhistle(){ s2dTone(1500, 0.35, "square", 0.1); }
function s2dSfxGoal(){ s2dTone(660,0.12,"triangle",0.2); s2dTone(880,0.16,"triangle",0.2,0.1); s2dTone(1100,0.22,"triangle",0.22,0.2); s2dTone(1320,0.28,"triangle",0.2,0.32); }
function s2dSfxPost(){ s2dTone(900,0.08,"square",0.12); s2dTone(500,0.1,"square",0.08,0.05); }
let _s2dCrowdNode = null;
function s2dCrowdStart(){
  const ctx = s2dCtx(); if(!ctx || _s2dCrowdNode) return;
  const bufferSize = 2 * ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for(let i=0;i<bufferSize;i++) data[i] = (Math.random()*2-1) * 0.5;
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass"; filter.frequency.value = 480; filter.Q.value = 0.6;
  const gain = ctx.createGain(); gain.gain.value = 0.022;
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start();
  _s2dCrowdNode = { src, gain };
}
function s2dCrowdStop(){
  if(_s2dCrowdNode){ try{ _s2dCrowdNode.src.stop(); }catch(e){} _s2dCrowdNode = null; }
}

/* =========================================================
   OVERLAY / DOM — mesmo esqueleto visual do arcade.js
   (intro → hud+stage → resultado), com estilo próprio.
   ========================================================= */
function ensureS2DStyles(){
  if(document.getElementById("s2dStyles")) return;
  const style = document.createElement("style");
  style.id = "s2dStyles";
  style.textContent = `
  .s2d-overlay{position:fixed;inset:0;background:#0b1220;z-index:9999;display:flex;flex-direction:column;font-family:var(--font-body);color:#fff;}
  .s2d-overlay.hidden{display:none;}
  .s2d-intro,.s2d-result{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;}
  .s2d-comp-label{font-family:var(--font-display);font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);}
  .s2d-vs-row{display:flex;align-items:center;gap:14px;font-family:var(--font-display);font-size:19px;flex-wrap:wrap;justify-content:center;}
  .s2d-vs-badge{background:var(--brand);border-radius:var(--radius-sm);padding:4px 10px;font-size:12px;}
  .s2d-sub{color:#B9C2CE;font-size:13px;max-width:340px;line-height:1.5;}
  .s2d-diff-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(255,201,60,.12);border:1px solid rgba(255,201,60,.4);color:var(--gold);border-radius:999px;padding:5px 12px;font-family:var(--font-display);font-size:12px;letter-spacing:.03em;}
  .s2d-btn{border:none;border-radius:var(--radius-md);padding:14px 28px;font-family:var(--font-display);font-size:16px;background:var(--brand);color:#fff;box-shadow:var(--shadow-card);}
  .s2d-btn:active{transform:scale(0.97);}
  .s2d-result-score{font-family:var(--font-display);font-size:42px;}
  .s2d-result-sub{color:#B9C2CE;font-size:13px;}
  .s2d-result-title{font-family:var(--font-display);font-size:24px;}
  .s2d-result-title.win{color:var(--turf);}
  .s2d-result-title.loss{color:var(--crimson);}
  .s2d-result-title.draw{color:var(--gold);}
  .s2d-hud{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#0b1220;border-bottom:1px solid rgba(255,255,255,.08);font-family:var(--font-display);font-size:13px;flex-shrink:0;position:relative;z-index:3;}
  .s2d-hud .side{display:flex;align-items:center;gap:6px;min-width:64px;}
  .s2d-hud .side .lbl{font-family:var(--font-body);font-size:9.5px;color:#7C8AA0;text-transform:uppercase;display:block;}
  .s2d-hud .goals{font-size:20px;}
  .s2d-hud .mid{text-align:center;color:#fff;font-family:var(--font-display);font-size:14px;}
  .s2d-stage{position:relative;flex:1;overflow:hidden;touch-action:none;background:#173a1d;}
  .s2d-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;image-rendering:pixelated;}
  .s2d-touch{position:absolute;inset:0;z-index:12;display:none;pointer-events:none;}
  @media (hover:none) and (pointer:coarse){ .s2d-touch{display:block;} .s2d-hint-desktop{display:none;} }
  @media (hover:hover) and (pointer:fine){ .s2d-hint-mobile{display:none;} }
  .s2d-joybase{position:absolute;left:18px;bottom:20px;width:104px;height:72px;border-radius:36px;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.4);pointer-events:auto;}
  .s2d-joyknob{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:rgba(25,140,255,.55);border:2px solid var(--brand);}
  .s2d-actbtn{position:absolute;width:64px;height:64px;border-radius:50%;pointer-events:auto;display:flex;align-items:center;justify-content:center;font-size:10px;font-family:var(--font-display);color:#0b1220;border:3px solid rgba(0,0,0,.35);user-select:none;}
  .s2d-btn-kick{right:20px;bottom:26px;background:rgba(230,57,80,.85);}
  .s2d-btn-jump{right:96px;bottom:64px;background:rgba(25,140,255,.85);}
  .s2d-flash{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:2;}
  .s2d-flash.goal{animation:s2dFlashGoal .6s ease;}
  @keyframes s2dFlashGoal{ 0%{opacity:.55; background:#fff;} 100%{opacity:0;} }
  .s2d-shake{animation:s2dShake .32s ease;}
  @keyframes s2dShake{
    0%{transform:translate(0,0);} 20%{transform:translate(-6px,3px);} 40%{transform:translate(5px,-4px);}
    60%{transform:translate(-4px,2px);} 80%{transform:translate(3px,-2px);} 100%{transform:translate(0,0);}
  }
  .s2d-setup-diffgrid,.s2d-setup-durgrid{display:flex;gap:8px;flex-wrap:wrap;}
  .s2d-chip{flex:1 1 auto;min-width:78px;border:1.5px solid var(--border);background:var(--surface-2);color:var(--text);border-radius:var(--radius-sm);padding:9px 10px;font-family:var(--font-display);font-size:12.5px;text-align:center;cursor:pointer;}
  .s2d-chip.active{border-color:var(--brand);background:var(--brand-light);color:var(--brand-dim);}
  .s2d-lineup-preview{display:flex;align-items:center;gap:10px;background:var(--surface-2);border-radius:var(--radius-sm);padding:10px 12px;margin:10px 0;}
  .s2d-lineup-preview .num{font-family:var(--font-display);font-size:18px;color:var(--brand);min-width:26px;text-align:center;}
  `;
  document.head.appendChild(style);
}

function ensureS2DOverlay(){
  ensureS2DStyles();
  if(document.getElementById("s2dOverlay")) return;
  const div = document.createElement("div");
  div.className = "s2d-overlay hidden";
  div.id = "s2dOverlay";
  div.innerHTML = `
    <div class="s2d-intro" id="s2dIntro">
      <div class="s2d-comp-label" id="s2dCompLabel">Arena 2D</div>
      <div class="s2d-vs-row">
        <span id="s2dHomeName">Meu Clube</span>
        <span class="s2d-vs-badge">VS</span>
        <span id="s2dAwayName">COM</span>
      </div>
      <div class="s2d-diff-badge" id="s2dDiffBadge">Normal</div>
      <div class="s2d-sub s2d-hint-desktop">
        Setas ← → move · ↑ / Espaço pula · X chuta<br>Pule na bola pra cabecear!
      </div>
      <div class="s2d-sub s2d-hint-mobile">
        Analógico esquerdo move · botões à direita pulam/chutam<br>Pule na bola pra cabecear!
      </div>
      <button class="s2d-btn" id="s2dStartBtn">Começar ›</button>
    </div>

    <div class="s2d-hud hidden" id="s2dHud">
      <div class="side"><span class="lbl" id="s2dHomeShort">CASA</span><span class="goals" id="s2dHomeGoals">0</span></div>
      <div class="mid" id="s2dClock">1:00</div>
      <div class="side"><span class="lbl" id="s2dAwayShort">FORA</span><span class="goals" id="s2dAwayGoals">0</span></div>
    </div>

    <div class="s2d-stage hidden" id="s2dStage">
      <canvas id="s2dCanvas"></canvas>
      <div class="s2d-flash" id="s2dFlash"></div>
      <div class="s2d-touch" id="s2dTouch">
        <div class="s2d-joybase" id="s2dJoyBase"><div class="s2d-joyknob" id="s2dJoyKnob"></div></div>
        <div class="s2d-actbtn s2d-btn-jump" id="s2dBtnJump">PULO</div>
        <div class="s2d-actbtn s2d-btn-kick" id="s2dBtnKick">CHUTE</div>
      </div>
    </div>

    <div class="s2d-result hidden" id="s2dResult">
      <div class="s2d-result-title" id="s2dResultTitle">Vitória!</div>
      <div class="s2d-result-score" id="s2dResultScore">3 - 1</div>
      <div class="s2d-result-sub" id="s2dResultSub"></div>
      <button class="s2d-btn" id="s2dResultBtn">Continuar</button>
    </div>
  `;
  document.body.appendChild(div);
  wireS2DInput();
}

/* =========================================================
   TELA DE PREPARAÇÃO (screen-arena2d) — escolher dificuldade,
   duração e ver o atacante que vai representar o clube.
   ========================================================= */
let _s2dSelectedDifficulty = "normal";
let _s2dSelectedDuration = "curta";

function renderArena2DScreen(){
  const diffWrap = document.getElementById("s2dSetupDiffGrid");
  const durWrap = document.getElementById("s2dSetupDurGrid");
  const preview = document.getElementById("s2dSetupPreview");
  if(!diffWrap || !durWrap) return;

  diffWrap.innerHTML = S2D_DIFFICULTIES.map(d =>
    `<button type="button" class="s2d-chip${d.id===_s2dSelectedDifficulty?' active':''}" data-diff="${d.id}">${d.label}</button>`
  ).join("");
  durWrap.innerHTML = S2D_DURATIONS.map(d =>
    `<button type="button" class="s2d-chip${d.id===_s2dSelectedDuration?' active':''}" data-dur="${d.id}">${d.label}</button>`
  ).join("");

  diffWrap.querySelectorAll("[data-diff]").forEach(btn=>{
    btn.onclick = ()=>{ _s2dSelectedDifficulty = btn.dataset.diff; renderArena2DScreen(); };
  });
  durWrap.querySelectorAll("[data-dur]").forEach(btn=>{
    btn.onclick = ()=>{ _s2dSelectedDuration = btn.dataset.dur; renderArena2DScreen(); };
  });

  const homeLineup = typeof buildCampaignHomeLineup === "function" ? buildCampaignHomeLineup() : null;
  const attacker = typeof pickArcadeAttacker === "function" ? pickArcadeAttacker(homeLineup) : null;
  if(preview){
    if(attacker){
      preview.innerHTML = `
        <div class="s2d-lineup-preview">
          <span class="num">${attacker.number ?? "-"}</span>
          <div>
            <div style="font-family:var(--font-display);font-size:14px;">${attacker.name}</div>
            <div style="font-size:11.5px;color:var(--text-muted);">${attacker.pos || "ATA"} · OVR ${attacker.ovr ?? "-"} — vai representar o clube na Arena 2D</div>
          </div>
        </div>`;
    } else {
      preview.innerHTML = `<p class="page-sub" style="margin:0;">Você ainda não montou uma escalação — a Arena 2D vai usar um jogador genérico. Monte seu time em Escalação pra jogar com seus craques.</p>`;
    }
  }
}

function launchArena2DFriendly(){
  const homeLineup = typeof buildCampaignHomeLineup === "function" ? buildCampaignHomeLineup() : null;
  const diff = getS2DDifficulty(_s2dSelectedDifficulty);
  const duration = S2D_DURATIONS.find(d => d.id === _s2dSelectedDuration) || S2D_DURATIONS[0];

  const baseStrength = 60;
  const opponentStrength = Math.min(99, Math.max(30, baseStrength + diff.oppStrengthDelta));
  const awayLineup = typeof generateOpponentLineup === "function" ? generateOpponentLineup(opponentStrength) : null;

  startSoccer2DMatch({
    competitionLabel: "Arena 2D — Amistoso",
    title: "Arena 2D",
    homeTeamName: "Meu Clube",
    awayTeamName: pickS2DOpponentName(),
    homeLineup,
    awayLineup,
    difficulty: diff.id,
    matchSeconds: duration.seconds,
    onComplete: (result)=>{
      addMatchPassXP(result.result);
      const reward = result.result === "win" ? { gp: 120, coins: 0 } : result.result === "draw" ? { gp: 60, coins: 0 } : { gp: 20, coins: 0 };
      grantCurrency(reward.gp, reward.coins);
      const msg = result.result === "win" ? `Vitória na Arena 2D! +${reward.gp} GP`
                : result.result === "draw" ? `Empate na Arena 2D. +${reward.gp} GP`
                : `Derrota na Arena 2D. +${reward.gp} GP de consolação.`;
      toast(msg, result.result === "loss" ? "" : "success");
    }
  });
}

const S2D_OPPONENT_NAMES = ["Furacão FC","Atlético Rival","União Norte","Estrela Azul","Leões do Sul","Vitória FC","Real Metropolitano","Grêmio das Águias"];
function pickS2DOpponentName(){ return S2D_OPPONENT_NAMES[Math.floor(Math.random()*S2D_OPPONENT_NAMES.length)]; }

/* =========================================================
   MOTOR — física, IA, desenho
   ========================================================= */
const S2D_FIELD_W = 960, S2D_FIELD_H = 540;
const S2D_GROUND_Y = S2D_FIELD_H - 90;
const S2D_ARENA_L = 46, S2D_ARENA_R = S2D_FIELD_W - 46;
const S2D_GOAL_H = 150;
const S2D_GRAVITY = 1700;

function s2dClamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function s2dDist(x1,y1,x2,y2){ return Math.hypot(x1-x2, y1-y2); }

/* Cor de camisa gerada a partir do nome do time — determinística,
   pra sempre sair a mesma cor pro mesmo adversário. */
function s2dHashHue(str){
  let h = 0;
  for(let i=0;i<str.length;i++) h = (h*31 + str.charCodeAt(i)) % 360;
  return Math.abs(h);
}
function s2dHsl(h,s,l){ return `hsl(${h}, ${s}%, ${l}%)`; }

function buildS2DFighterKit(side, teamName){
  if(side === "home"){
    return { shirt: "#198CFF", shirt2: "#0F6FD1", shorts: "#0E1726", socks: "#198CFF", skin: "#e0a878" };
  }
  const hue = s2dHashHue(teamName || "COM");
  return {
    shirt: s2dHsl(hue, 70, 48),
    shirt2: s2dHsl((hue+40)%360, 60, 30),
    shorts: "#111318",
    socks: s2dHsl(hue, 70, 40),
    skin: ["#e0a878","#c98f5e","#8d5a3b","#f0c9a0"][hue % 4],
  };
}

function makeS2DFighter(side, startX, attrs, teamName, playerName, number){
  const kit = buildS2DFighterKit(side, teamName);
  return {
    side, x:startX, airY:0, vy:0, vx:0, facing: side==="home"?1:-1,
    onGround:true, kickCooldown:0, animT:Math.random()*10,
    headR:19, bodyH:30, legH:20, kit, name: playerName || (side==="home"?"Atacante":"COM"),
    number: number || 9,
    attrs,
    moveSpeed: 215 + (attrs.pace||60) * 0.9,
    jumpV: 555 + (attrs.physical||60) * 0.9,
    kickPow: 540 + (attrs.shot||60) * 1.35,
    reach: 44 + (attrs.dribble||60) * 0.05,
    fatigue: 0,
  };
}

function startSoccer2DMatch(userConfig){
  const cfg = Object.assign({}, S2D_DEFAULTS, userConfig || {});
  const diff = getS2DDifficulty(cfg.difficulty);

  const homeAttacker = typeof pickArcadeAttacker === "function" ? pickArcadeAttacker(cfg.homeLineup) : { name:"Atacante", number:9, attrs:{pace:60,dribble:60,pass:60,shot:60,physical:60} };
  const awayAttacker = typeof pickArcadeAttacker === "function" ? pickArcadeAttacker(cfg.awayLineup) : { name:"COM", number:9, attrs:{pace:60,dribble:60,pass:60,shot:60,physical:60} };
  const homeAttrs = homeAttacker.attrs || (typeof deriveArcadeAttributes === "function" ? deriveArcadeAttributes(homeAttacker) : {pace:60,dribble:60,pass:60,shot:60,physical:60});
  const awayAttrs = awayAttacker.attrs || (typeof deriveArcadeAttributes === "function" ? deriveArcadeAttributes(awayAttacker) : {pace:60,dribble:60,pass:60,shot:60,physical:60});

  const home = makeS2DFighter("home", S2D_FIELD_W*0.28, homeAttrs, cfg.homeTeamName, homeAttacker.name, homeAttacker.number);
  const away = makeS2DFighter("away", S2D_FIELD_W*0.72, awayAttrs, cfg.awayTeamName, awayAttacker.name, awayAttacker.number);
  away.moveSpeed *= diff.speedMult;

  _s2d = {
    cfg, diff, home, away,
    ball: { x:S2D_FIELD_W/2, y:S2D_GROUND_Y-140, vx:0, vy:0, r:13, spin:0 },
    score: { home:0, away:0 },
    matchTime: cfg.matchSeconds,
    totalTime: cfg.matchSeconds,
    paused: true, phase: "intro", flashGoal: 0, shake: 0,
    particles: [],
    usedHomeIds: new Set(homeAttacker.id ? [homeAttacker.id] : []),
    aiTarget: { x: away.x, jumpRoll: 0 },
    canvas: null, ctx: null, running: false,
    keys: {}, touch: { dx:0, active:false, jump:false, kick:false },
  };

  ensureS2DOverlay();
  document.getElementById("s2dCompLabel").textContent = cfg.competitionLabel;
  document.getElementById("s2dHomeName").textContent = cfg.homeTeamName;
  document.getElementById("s2dAwayName").textContent = cfg.awayTeamName;
  document.getElementById("s2dHomeShort").textContent = (cfg.homeTeamName || "CASA").slice(0,3).toUpperCase();
  document.getElementById("s2dAwayShort").textContent = (cfg.awayTeamName || "FORA").slice(0,3).toUpperCase();
  document.getElementById("s2dDiffBadge").textContent = "Dificuldade: " + diff.label;

  document.getElementById("s2dIntro").classList.remove("hidden");
  document.getElementById("s2dHud").classList.add("hidden");
  document.getElementById("s2dStage").classList.add("hidden");
  document.getElementById("s2dResult").classList.add("hidden");
  document.getElementById("s2dOverlay").classList.remove("hidden");

  document.getElementById("s2dStartBtn").onclick = ()=>{
    document.getElementById("s2dIntro").classList.add("hidden");
    document.getElementById("s2dHud").classList.remove("hidden");
    document.getElementById("s2dStage").classList.remove("hidden");
    s2dSfxWhistle();
    s2dCrowdStart();
    setupS2DCanvas();
    s2dResetPositions();
    updateS2DHud();
    _s2d.paused = false; _s2d.phase = "playing";
    _s2d.running = true; _s2d.lastT = performance.now();
    requestAnimationFrame(s2dLoop);
  };
}

function setupS2DCanvas(){
  const canvas = document.getElementById("s2dCanvas");
  const stage = document.getElementById("s2dStage");
  function resize(){
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(2, Math.round(stage.clientWidth * dpr));
    canvas.height = Math.max(2, Math.round(stage.clientHeight * dpr));
  }
  resize();
  window.addEventListener("resize", resize);
  _s2d.canvas = canvas;
  _s2d.ctx = canvas.getContext("2d");
}

function s2dResetPositions(){
  const a = _s2d;
  a.home.x = S2D_FIELD_W*0.28; a.home.airY=0; a.home.vy=0; a.home.vx=0; a.home.onGround=true;
  a.away.x = S2D_FIELD_W*0.72; a.away.airY=0; a.away.vy=0; a.away.vx=0; a.away.onGround=true;
  a.ball.x = S2D_FIELD_W/2; a.ball.y = S2D_GROUND_Y-140; a.ball.vx = (Math.random()-0.5)*90; a.ball.vy = 0;
}

/* ---------- LOOP ---------- */
function s2dLoop(now){
  const a = _s2d;
  if(!a || !a.running) return;
  const dt = Math.min(0.033, (now - a.lastT)/1000);
  a.lastT = now;
  if(!a.paused && a.phase === "playing") s2dUpdate(dt);
  s2dDraw();
  requestAnimationFrame(s2dLoop);
}

function s2dUpdate(dt){
  const a = _s2d;
  a.matchTime -= dt;
  if(a.matchTime <= 0){ a.matchTime = 0; s2dFinishMatch(); return; }

  const fatigueFrac = 1 - (a.matchTime / a.totalTime);
  a.home.fatigue = fatigueFrac * 0.08;
  a.away.fatigue = fatigueFrac * 0.08;

  s2dHandlePlayer(a.home, dt, {
    left: a.keys.ArrowLeft, right: a.keys.ArrowRight,
    jump: a.keys.ArrowUp || a.keys.Space || a.touch.jump,
    kick: a.keys.KeyX || a.touch.kick,
    axis: a.touch.active ? a.touch.dx : 0,
  });
  s2dHandleAI(a.away, dt);

  s2dUpdateBall(dt);
  s2dResolveCollision(a.home);
  s2dResolveCollision(a.away);
  s2dUpdateParticles(dt);

  if(Math.floor(a.matchTime) !== a._lastClockSec){
    a._lastClockSec = Math.floor(a.matchTime);
    updateS2DHud();
  }
}

function s2dHandlePlayer(f, dt, input){
  let dir = 0;
  if(input.left) dir -= 1;
  if(input.right) dir += 1;
  if(input.axis) dir += input.axis;
  dir = s2dClamp(dir, -1, 1);
  const speed = f.moveSpeed * (1 - f.fatigue);
  f.vx = dir*speed;
  f.x += f.vx*dt;
  f.x = s2dClamp(f.x, S2D_ARENA_L+f.headR, S2D_ARENA_R-f.headR);
  if(Math.abs(dir) > 0.05) f.facing = dir>0?1:-1;

  if(input.jump && f.onGround){ f.vy = f.jumpV; f.onGround=false; s2dVibrate(12); }
  s2dPhysicsFighter(f, dt);

  if(f.kickCooldown > 0) f.kickCooldown -= dt;
  if(input.kick && f.kickCooldown <= 0){
    const feetY = S2D_GROUND_Y - f.airY;
    const d = s2dDist(f.x, feetY-f.legH*0.6, _s2d.ball.x, _s2d.ball.y);
    if(d < f.reach + 2){
      s2dKickBall(f, _s2d.ball, 1);
      f.kickCooldown = 0.38;
    }
  }
}

function s2dPhysicsFighter(f, dt){
  if(!f.onGround){
    f.vy -= S2D_GRAVITY*dt;
    f.airY += f.vy*dt;
    if(f.airY <= 0){ f.airY = 0; f.vy = 0; f.onGround = true; }
  }
  const moving = Math.abs(f.vx) > 10;
  f.animT += (moving ? 0.3 : 0.06);
}

function s2dKickBall(f, ball, ownerBoost){
  const power = f.kickPow * (0.92 + Math.random()*0.16);
  ball.vx = f.facing*power + f.vx*0.35;
  ball.vy = -power*0.86;
  s2dSfxKick(power);
  s2dSpawnKickParticles(ball.x, ball.y, f.facing);
}

/* ---------- IA do CPU ---------- */
/* Estima onde a bola vai tocar o chão simulando alguns passos de
   física à frente (mesma gravidade/quicada do updateBall) — dá pra
   IA "ler" cruzamentos e bolas altas em vez de só perseguir o x
   atual da bola, que era a limitação principal da versão anterior. */
function s2dPredictBallLanding(ball){
  let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  const dt = 0.045;
  for(let i=0;i<70;i++){
    vy -= S2D_GRAVITY*dt;
    x += vx*dt;
    y -= vy*dt;
    if(y > S2D_GROUND_Y-13){ return x; }
    if(x < S2D_ARENA_L || x > S2D_ARENA_R) return x;
  }
  return x;
}

function s2dHandleAI(f, dt){
  const a = _s2d, diff = a.diff, ball = a.ball;
  const speed = f.moveSpeed * (1 - f.fatigue);

  const distToBall = Math.abs(ball.x - f.x);
  const ownGoalX = S2D_ARENA_R;                    // gol que o CPU defende
  const inOwnThird = ball.x > S2D_FIELD_W*0.58;     // bola no terço de defesa do CPU = perigo real
  const defendAnchor = ownGoalX - 90;

  // decide alvo X: se a bola está no ar vindo em direção perigosa, tenta
  // prever o pouso; se está no campo de defesa dele OU perto, ele SEMPRE
  // pressiona/marca a bola (antes só reagia quando ela já estava colada
  // na área, deixando o meio-campo inteiro livre pro jogador andar sem
  // ninguém desarmar); só quando ela está bem longe, no ataque, é que ele
  // mantém uma posição de cobertura entre a bola e o próprio gol — sem
  // nunca abandonar de vez a marcação.
  let targetX;
  if(ball.y < S2D_GROUND_Y - 60 && Math.random() < diff.jumpSkill){
    targetX = s2dClamp(s2dPredictBallLanding(ball), S2D_ARENA_L+20, S2D_ARENA_R-20);
  } else if(inOwnThird || distToBall < 300){
    targetX = ball.x;
  } else {
    targetX = s2dClamp((ball.x + defendAnchor)/2, S2D_FIELD_W*0.42, ownGoalX-30);
  }
  // ruído de posicionamento (menor nas dificuldades mais altas)
  targetX += (Math.random()-0.5) * diff.errorPx;

  const toTarget = targetX - f.x;
  const dirSign = Math.sign(toTarget);
  let dir = Math.abs(toTarget) > 14 ? dirSign : 0;
  f.vx = dir*speed*0.94;
  f.x += f.vx*dt;
  f.x = s2dClamp(f.x, S2D_ARENA_L+f.headR, S2D_ARENA_R-f.headR);
  if(Math.abs(dir) > 0.05) f.facing = dir>0?1:-1;

  // perto do próprio gol o CPU quase não erra o desarme/cabeceio — evita
  // o "gol contra" bobo de deixar a bola quicar sozinha dentro da área.
  const reactionNow = inOwnThird ? Math.max(diff.reaction, 0.88) : diff.reaction;

  const feetY = S2D_GROUND_Y - f.airY;
  const ballAbove = ball.y < feetY - f.legH - f.bodyH*0.3;
  const closeX = Math.abs(ball.x - f.x) < 74;
  if(f.onGround && closeX && ballAbove && ball.vy < 260 && Math.random() < reactionNow){
    f.vy = f.jumpV; f.onGround = false;
  }
  s2dPhysicsFighter(f, dt);

  if(f.kickCooldown > 0) f.kickCooldown -= dt;
  const d = s2dDist(f.x, feetY-f.legH*0.6, ball.x, ball.y);
  if(d < f.reach + 4 && f.kickCooldown <= 0 && Math.random() < reactionNow){
    // Perto do PRÓPRIO gol, isso é uma DEFESA — o chute tem que
    // sempre afastar a bola dali (pra longe do gol que o CPU
    // defende), nunca na direção que ele por acaso estava andando
    // (antes usava f.facing puro, que podia apontar pro próprio gol
    // e a "defesa" acabava empurrando a bola pra dentro da rede).
    const clearDir = inOwnThird ? (ownGoalX > f.x ? -1 : 1) : f.facing;
    // mira: quanto maior o aimSkill, mais perto das quinas do gol
    // (mais difícil de defender) em vez de sempre reto pro centro.
    const aimSpread = (1 - diff.aimSkill) * 0.35;
    const aimBias = (Math.random()-0.5) * aimSpread;
    const power = f.kickPow * (0.9 + diff.aimSkill*0.25 + Math.random()*0.1) * (inOwnThird ? 1.15 : 1);
    ball.vx = clearDir*power*(1-Math.abs(aimBias)) + f.vx*0.3;
    ball.vy = -power*(0.82 + aimBias);
    f.kickCooldown = 0.42;
    s2dSfxKick(power);
    s2dSpawnKickParticles(ball.x, ball.y, clearDir);
  }
}

/* ---------- BOLA / COLISÕES ---------- */
function s2dUpdateBall(dt){
  const a = _s2d, ball = a.ball;
  ball.vy -= S2D_GRAVITY*dt;
  ball.x += ball.vx*dt;
  ball.y -= ball.vy*dt;
  ball.spin += ball.vx*dt*0.02;

  if(ball.y > S2D_GROUND_Y - ball.r){
    ball.y = S2D_GROUND_Y - ball.r;
    ball.vy = Math.abs(ball.vy)*0.6;
    ball.vx *= 0.94;
    if(Math.abs(ball.vy) < 50) ball.vy = 0;
  }
  ball.vx *= 0.999;

  if(ball.x - ball.r < S2D_ARENA_L){
    const groundLevelY = S2D_GROUND_Y - ball.y;
    if(groundLevelY < S2D_GOAL_H){ s2dScoreGoal("away"); }
    else { ball.x = S2D_ARENA_L + ball.r; ball.vx = Math.abs(ball.vx)*0.7; s2dSfxPost(); }
  }
  if(ball.x + ball.r > S2D_ARENA_R){
    const groundLevelY = S2D_GROUND_Y - ball.y;
    if(groundLevelY < S2D_GOAL_H){ s2dScoreGoal("home"); }
    else { ball.x = S2D_ARENA_R - ball.r; ball.vx = -Math.abs(ball.vx)*0.7; s2dSfxPost(); }
  }
  if(ball.y < 20){ ball.y = 20; ball.vy = -Math.abs(ball.vy)*0.5; }
}

function s2dResolveCollision(f){
  const a = _s2d, ball = a.ball;
  const feetY = S2D_GROUND_Y - f.airY;
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
    ball.vx = nx*260 + f.vx*0.5;
    ball.vy = -ny*260;
  }
  dx = ball.x-f.x; dy = ball.y-headCY; d = Math.hypot(dx,dy);
  if(d < headR+ball.r && d>0.01){
    const nx=dx/d, ny=dy/d, pen=(headR+ball.r)-d;
    ball.x += nx*pen; ball.y += ny*pen;
    ball.vx = nx*(430 + (f.attrs.physical||60)) + f.vx*0.6;
    ball.vy = -ny*430 + 90;
    if(Math.abs(nx)*460 > 300) s2dSfxHeader();
  }
}

/* ---------- GOL ---------- */
function s2dScoreGoal(side){
  const a = _s2d;
  if(a.phase !== "playing") return;
  a.score[side]++;
  if(a.home.attrs && side==="home"){} // (placeholder simétrico, sem efeito extra por ora)
  updateS2DHud();
  a.paused = true; a.phase = "goal"; a.flashGoal = 1;
  s2dSfxGoal(); s2dVibrate([30,40,60]);
  const stage = document.getElementById("s2dStage");
  stage.classList.add("s2d-shake");
  setTimeout(()=> stage.classList.remove("s2d-shake"), 340);
  document.getElementById("s2dFlash").classList.add("goal");
  setTimeout(()=>{
    document.getElementById("s2dFlash").classList.remove("goal");
    s2dResetPositions();
    a.paused = false; a.phase = "playing";
  }, 1100);
}

/* ---------- PARTÍCULAS ---------- */
function s2dSpawnKickParticles(x,y,facing){
  const a = _s2d;
  for(let i=0;i<6;i++){
    a.particles.push({
      x, y, vx: facing*(120+Math.random()*160), vy: (Math.random()-0.6)*160,
      life: 0.35+Math.random()*0.2, maxLife: 0.5, r: 2+Math.random()*2,
      color: "rgba(255,255,255,0.85)",
    });
  }
}
function s2dUpdateParticles(dt){
  const a = _s2d;
  a.particles.forEach(p=>{ p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 500*dt; p.life -= dt; });
  a.particles = a.particles.filter(p=>p.life>0);
}

/* ---------- HUD ---------- */
function updateS2DHud(){
  const a = _s2d;
  document.getElementById("s2dHomeGoals").textContent = a.score.home;
  document.getElementById("s2dAwayGoals").textContent = a.score.away;
  const mm = Math.floor(a.matchTime/60), ss = Math.floor(a.matchTime%60);
  document.getElementById("s2dClock").textContent = `${mm}:${ss.toString().padStart(2,"0")}`;
}

/* =========================================================
   DESENHO
   ========================================================= */
function s2dDraw(){
  const a = _s2d, canvas = a.canvas, ctx = a.ctx;
  if(!ctx) return;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const scale = Math.min(canvas.width/S2D_FIELD_W, canvas.height/S2D_FIELD_H);
  const offX = (canvas.width - S2D_FIELD_W*scale)/2;
  const offY = (canvas.height - S2D_FIELD_H*scale)/2;
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setTransform(scale,0,0,scale,offX,offY);

  s2dDrawStadium(ctx);
  s2dDrawPitch(ctx);
  s2dDrawGoal(ctx, S2D_ARENA_L, 1);
  s2dDrawGoal(ctx, S2D_ARENA_R, -1);
  s2dDrawFighter(ctx, a.away);
  s2dDrawFighter(ctx, a.home);
  s2dDrawBall(ctx, a.ball);
  s2dDrawParticles(ctx);

  if(a.flashGoal > 0){
    ctx.fillStyle = `rgba(255,255,255,${Math.min(0.55,a.flashGoal)})`;
    ctx.fillRect(0,0,S2D_FIELD_W,S2D_FIELD_H);
    a.flashGoal -= 0.045;
  }
}

function s2dDrawStadium(ctx){
  const g = ctx.createLinearGradient(0,0,0,S2D_GROUND_Y);
  g.addColorStop(0,"#0e2a4a"); g.addColorStop(0.55,"#194a72"); g.addColorStop(1,"#2c6f96");
  ctx.fillStyle = g; ctx.fillRect(0,0,S2D_FIELD_W,S2D_GROUND_Y);

  // arquibancada (blocos coloridos representando torcida)
  const rows = 3, rowH = 16;
  for(let r=0;r<rows;r++){
    const y = S2D_GROUND_Y-150 + r*rowH;
    for(let i=0;i<40;i++){
      const seed = (i*7+r*13) % 5;
      const colors = ["#7C4DFF33","#E6395033","#FFC93C33","#19c37d33","#ffffff22"];
      ctx.fillStyle = colors[seed];
      ctx.fillRect(i*(S2D_FIELD_W/40), y, S2D_FIELD_W/40-2, rowH-3);
    }
  }
  // holofotes
  ctx.fillStyle = "rgba(255,255,255,0.05)";
  [80, S2D_FIELD_W-80].forEach(x=>{
    ctx.beginPath();
    ctx.moveTo(x,0); ctx.lineTo(x-70,S2D_GROUND_Y-160); ctx.lineTo(x+70,S2D_GROUND_Y-160);
    ctx.closePath(); ctx.fill();
  });
}

function s2dDrawPitch(ctx){
  ctx.fillStyle = "#2f9a2f"; ctx.fillRect(0,S2D_GROUND_Y,S2D_FIELD_W,S2D_FIELD_H-S2D_GROUND_Y);
  ctx.fillStyle = "#279527";
  for(let i=0;i<12;i++){ if(i%2===0) ctx.fillRect(i*S2D_FIELD_W/12,S2D_GROUND_Y,S2D_FIELD_W/12,S2D_FIELD_H-S2D_GROUND_Y); }
  ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(S2D_FIELD_W/2,S2D_GROUND_Y); ctx.lineTo(S2D_FIELD_W/2,S2D_FIELD_H-10); ctx.stroke();
  ctx.beginPath(); ctx.arc(S2D_FIELD_W/2,S2D_FIELD_H-10,40,Math.PI,0); ctx.stroke();
  // pequenas áreas
  [S2D_ARENA_L, S2D_ARENA_R].forEach((x,i)=>{
    const dir = i===0?1:-1;
    ctx.strokeRect(x + (dir*0) , S2D_GROUND_Y, dir*70, S2D_FIELD_H-S2D_GROUND_Y-6);
  });
}

function s2dDrawGoal(ctx, x, dir){
  ctx.strokeStyle = "#f0f0f0"; ctx.lineWidth = 6; ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, S2D_GROUND_Y); ctx.lineTo(x, S2D_GROUND_Y-S2D_GOAL_H);
  ctx.lineTo(x+dir*46, S2D_GROUND_Y-S2D_GOAL_H); ctx.lineTo(x+dir*46, S2D_GROUND_Y);
  ctx.stroke();
  // rede em xadrez
  ctx.strokeStyle = "rgba(255,255,255,0.32)"; ctx.lineWidth = 1;
  for(let i=1;i<7;i++){
    ctx.beginPath(); ctx.moveTo(x, S2D_GROUND_Y-S2D_GOAL_H*i/7); ctx.lineTo(x+dir*46, S2D_GROUND_Y-S2D_GOAL_H*i/7); ctx.stroke();
  }
  for(let i=1;i<5;i++){
    const gx = x+dir*46*i/5;
    ctx.beginPath(); ctx.moveTo(gx, S2D_GROUND_Y-S2D_GOAL_H); ctx.lineTo(gx, S2D_GROUND_Y); ctx.stroke();
  }
}

function s2dRoundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function s2dDrawFighter(ctx, f){
  const feetY = S2D_GROUND_Y - f.airY;
  const hipY = feetY - f.legH;
  const shoulderY = hipY - f.bodyH;
  const headCY = shoulderY - f.headR*0.6;
  const stride = Math.sin(f.animT) * (Math.abs(f.vx)>10?1:0.1);

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath(); ctx.ellipse(f.x, S2D_GROUND_Y+4, 22*(1-f.airY/260), 6*(1-f.airY/260), 0,0,Math.PI*2); ctx.fill();

  ctx.lineCap = "round";
  // pernas + meiões
  [1,-1].forEach(side=>{
    const swing = stride*side*10;
    const footX = f.x + swing*f.facing*0.4;
    ctx.strokeStyle = f.kit.skin; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(f.x+side*4,hipY); ctx.lineTo(footX, feetY-6); ctx.stroke();
    ctx.strokeStyle = f.kit.socks; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(f.x+side*4,hipY+f.legH*0.55); ctx.lineTo(footX, feetY-4); ctx.stroke();
    ctx.fillStyle = "#151515";
    ctx.beginPath(); ctx.ellipse(footX+f.facing*3, feetY, 7,4,0,0,Math.PI*2); ctx.fill();
  });

  // shorts
  ctx.fillStyle = f.kit.shorts;
  s2dRoundRect(ctx, f.x-14, hipY-8, 28, 14, 4); ctx.fill();

  // camisa
  ctx.fillStyle = f.kit.shirt;
  s2dRoundRect(ctx, f.x-15, shoulderY, 30, f.bodyH, 10); ctx.fill();
  ctx.fillStyle = f.kit.shirt2;
  ctx.fillRect(f.x-4, shoulderY+4, 8, f.bodyH-8);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "8px var(--font-display), sans-serif"; ctx.textAlign = "center";
  ctx.fillText(String(f.number||""), f.x, shoulderY+f.bodyH*0.62);
  ctx.textAlign = "left";

  // braços
  ctx.strokeStyle = f.kit.skin; ctx.lineWidth = 6;
  [1,-1].forEach(side=>{
    ctx.beginPath();
    ctx.moveTo(f.x+side*13, shoulderY+6);
    ctx.lineTo(f.x+side*20 - stride*side*4, shoulderY+f.bodyH*0.7);
    ctx.stroke();
  });

  // cabeça
  ctx.fillStyle = f.kit.skin;
  ctx.beginPath(); ctx.arc(f.x, headCY, f.headR, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = f._hair || (f._hair = ["#2a1a10","#1a1a1a","#4a2c14","#0e0e0e"][Math.abs(s2dHashHue(f.name||"x"))%4]);
  ctx.beginPath(); ctx.arc(f.x, headCY-f.headR*0.25, f.headR*1.02, Math.PI,0); ctx.fill();
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.arc(f.x+f.facing*6, headCY+2, 2.4,0,Math.PI*2); ctx.fill();
}

function s2dDrawBall(ctx, ball){
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  const shrink = Math.max(0.3, 1-(S2D_GROUND_Y-ball.y)/300);
  ctx.beginPath(); ctx.ellipse(ball.x, S2D_GROUND_Y+2, ball.r*1.3*shrink, ball.r*0.5*shrink,0,0,Math.PI*2); ctx.fill();

  // rastro leve quando rápida
  const speed = Math.hypot(ball.vx, ball.vy);
  if(speed > 260){
    ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = ball.r*1.1;
    const bx = ball.x - (ball.vx/speed)*speed*0.02, by = ball.y + (ball.vy/speed)*speed*0.02;
    ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(ball.x,ball.y); ctx.stroke();
  }

  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.spin % (Math.PI*2));
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(0,0, ball.r, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = "#333"; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(-ball.r,0); ctx.lineTo(ball.r,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0,-ball.r); ctx.lineTo(0,ball.r); ctx.stroke();
  ctx.fillStyle = "#333";
  ctx.beginPath(); ctx.moveTo(0,-ball.r*0.42); ctx.lineTo(ball.r*0.36,0); ctx.lineTo(0,ball.r*0.42); ctx.lineTo(-ball.r*0.36,0); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function s2dDrawParticles(ctx){
  _s2d.particles.forEach(p=>{
    const alpha = s2dClamp(p.life/p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  });
}

/* =========================================================
   FIM DE PARTIDA
   ========================================================= */
function s2dFinishMatch(){
  const a = _s2d;
  if(!a || a.phase === "done") return;
  a.phase = "done"; a.paused = true; a.running = false;
  s2dCrowdStop(); s2dSfxWhistle();

  document.getElementById("s2dHud").classList.add("hidden");
  document.getElementById("s2dStage").classList.add("hidden");

  const score = a.score;
  const outcome = score.home > score.away ? "win" : score.home < score.away ? "loss" : "draw";

  document.getElementById("s2dResultScore").textContent = `${score.home} - ${score.away}`;
  document.getElementById("s2dResultSub").textContent = `${a.cfg.homeTeamName} ${score.home} x ${score.away} ${a.cfg.awayTeamName} · Dificuldade: ${a.diff.label}`;
  const titleEl = document.getElementById("s2dResultTitle");
  titleEl.textContent = outcome === "win" ? "Vitória!" : outcome === "draw" ? "Empate" : "Derrota";
  titleEl.className = "s2d-result-title " + outcome;
  document.getElementById("s2dResult").classList.remove("hidden");

  const result = {
    homeGoals: score.home, awayGoals: score.away, result: outcome,
    cfg: a.cfg,
    usedHomeIds: Array.from(a.usedHomeIds),
    cardEvents: [], injuryEvents: [],
  };

  document.getElementById("s2dResultBtn").onclick = ()=>{
    document.getElementById("s2dOverlay").classList.add("hidden");
    const onComplete = a.cfg.onComplete;
    _s2d = null;
    if(typeof onComplete === "function") onComplete(result);
  };
}

/* =========================================================
   ENTRADA — teclado + toque (joystick + botões)
   ========================================================= */
let _s2dInputWired = false;
function wireS2DInput(){
  if(_s2dInputWired) return;
  _s2dInputWired = true;

  window.addEventListener("keydown", e=>{
    if(!_s2d || _s2d.phase !== "playing") return;
    _s2d.keys[e.code] = true;
    if(["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","KeyX"].includes(e.code)) e.preventDefault();
  });
  window.addEventListener("keyup", e=>{ if(_s2d) _s2d.keys[e.code] = false; });

  const joyBase = document.getElementById("s2dJoyBase");
  const joyKnob = document.getElementById("s2dJoyKnob");
  let joyId = null, joyCx = 0;
  const JOY_R = 44;
  function joyStart(e){
    if(!_s2d) return;
    const t = e.changedTouches ? e.changedTouches[0] : e;
    if(joyId !== null) return;
    joyId = t.identifier===undefined?"mouse":t.identifier;
    const r = joyBase.getBoundingClientRect();
    joyCx = r.left + r.width/2;
    _s2d.touch.active = true; joyMove(e); e.preventDefault();
  }
  function joyMove(e){
    if(joyId===null || !_s2d) return;
    const touches = e.changedTouches ? Array.from(e.changedTouches) : [e];
    const t = touches.find(tt=>(tt.identifier===undefined?"mouse":tt.identifier)===joyId);
    if(!t) return;
    let dx = t.clientX - joyCx;
    dx = s2dClamp(dx, -JOY_R, JOY_R);
    joyKnob.style.left = `calc(50% + ${dx}px)`;
    _s2d.touch.dx = Math.abs(dx)>8 ? dx/JOY_R : 0;
    e.preventDefault();
  }
  function joyEnd(){
    joyId = null;
    if(_s2d){ _s2d.touch.active = false; _s2d.touch.dx = 0; }
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
    const on = e=>{ if(_s2d) _s2d.touch[prop]=true; e.preventDefault(); };
    const off = ()=>{ if(_s2d) _s2d.touch[prop]=false; };
    el.addEventListener("touchstart", on, {passive:false});
    el.addEventListener("touchend", off);
    el.addEventListener("touchcancel", off);
    el.addEventListener("mousedown", on);
    el.addEventListener("mouseup", off);
    el.addEventListener("mouseleave", off);
  }
  bindHold("s2dBtnJump", "jump");
  bindHold("s2dBtnKick", "kick");
}

/* =========================================================
   GANCHOS PRA FASE ONLINE (ainda não usados nesta fase)
   ------------------------------------------------------------
   Quando entrarmos na Fase 2 (duelo 2D online via Firestore,
   sincronizando posição), a ideia é: em vez de s2dHandleAI()
   controlar o `away`, um listener do Firestore atualiza
   periodicamente `_s2d.away.x/airY/vy` com a posição recebida
   do adversário (e o próprio cliente publica a posição do
   `home` a cada poucos ms via um documento/campo dedicado da
   sala já usada em js/online.js). Os pontos de entrada ficam
   isolados aqui de propósito:
     - S2DOnlineHooks.onLocalStateTick(home, ball) -> chamar a
       cada frame (ou a cada N ms) pra publicar o estado local.
     - S2DOnlineHooks.applyRemoteState(away, payload) -> aplicar
       o estado recebido do adversário no fighter `away`.
   Isso evita reescrever o motor inteiro quando o online entrar;
   só troca s2dHandleAI() por essas duas funções quando o cfg
   trouxer um `onlineRoomId`.
   ========================================================= */
const S2DOnlineHooks = {
  onLocalStateTick: null,
  applyRemoteState: null,
};
