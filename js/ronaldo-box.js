/* =========================================================
   BOX RONALDO — motor separado, NÃO mexe no startBoxOpen normal.
   Só entra em ação quando a box tem "pullCount": 10 no JSON
   (hoje só a box037 / Box Ronaldo tem isso).

   Depende de funções que já existem em js/boxes.js, js/state.js,
   js/data.js: getEffectiveBox, getPlayer, getRemainingIds,
   ownPlayer, addGift, persist, spendCurrency, toast, STATE,
   updateMissionProgress. Se algum desses nomes for diferente no
   seu projeto, é só ajustar as chamadas abaixo (estão marcadas).
   ========================================================= */

const RONALDO_EPIC_RARITIES = ["epico", "bigtime"];
const RONALDO_EPIC_CHANCE_PER_SLOT = 0.022; // ~2.2% por posição -> "poucas chances" de vir 3 num giro de 10
const RONALDO_MAX_EPIC_PER_PULL = 3;

function ronaldoGetRemainingByRarityExt(boxId){
  // Igual ao getRemainingByRarity de boxes.js, mas com os 2 tiers novos
  // (epico/bigtime) além dos 4 originais. Função própria pra não mexer
  // no arquivo compartilhado.
  const ids = getRemainingIds(boxId);
  const out = { preta:[], dourada:[], prata:[], branca:[], epico:[], bigtime:[] };
  ids.map(getPlayer).filter(Boolean).forEach(p=>{
    if(out[p.rarity]) out[p.rarity].push(p);
  });
  return out;
}

function ronaldoWeightedPick(list){
  return list[Math.floor(Math.random()*list.length)];
}

/* Sorteia 1 jogador "comum/normal" (as 4 raridades de base, nunca
   epico/bigtime) — usado pra preencher as posições que não viraram
   épico/bigtime no giro de 10. */
function ronaldoPickNormal(byR){
  const base = ["preta","dourada","prata","branca"];
  const pool = [];
  base.forEach(r=>{ (byR[r]||[]).forEach(()=>pool.push(r)); });
  if(pool.length===0) return null;
  const r = ronaldoWeightedPick(pool);
  const candidates = byR[r];
  return candidates[Math.floor(Math.random()*candidates.length)];
}

function ronaldoPickEpic(byR){
  const pool = [];
  RONALDO_EPIC_RARITIES.forEach(r=>{ (byR[r]||[]).forEach(p=>pool.push(p)); });
  if(pool.length===0) return null;
  return pool[Math.floor(Math.random()*pool.length)];
}

/* ---------------- GIRO PRINCIPAL (10 de uma vez) ---------------- */
function startRonaldoBoxOpen(boxId){
  const box = getEffectiveBox(boxId);
  if(!box){ return; }

  const remainingIds = getRemainingIds(boxId);
  if(remainingIds.length < 10){
    toast("Não sobram jogadores suficientes nessa Box para um giro de 10.", "");
    return;
  }
  if(box.priceCoins > STATE.currency.coins){
    toast("Saldo insuficiente para essa contratação.", "");
    return;
  }
  if(!spendCurrency(0, box.priceCoins)){
    toast("Saldo insuficiente.", "");
    return;
  }

  let byR = ronaldoGetRemainingByRarityExt(boxId);
  const drawn = [];
  const usedIds = new Set();

  for(let slot=0; slot<10; slot++){
    let picked = null;
    const epicSoFar = drawn.filter(p=>RONALDO_EPIC_RARITIES.includes(p.rarity)).length;
    const canEpic = epicSoFar < RONALDO_MAX_EPIC_PER_PULL;

    if(canEpic && Math.random() < RONALDO_EPIC_CHANCE_PER_SLOT){
      picked = ronaldoPickEpic(byR);
    }
    if(!picked){
      picked = ronaldoPickNormal(byR);
    }
    if(!picked){
      // acabou o pool no meio do giro (box quase esgotada) — para aqui
      break;
    }

    // evita repetir o mesmo jogador dentro do mesmo giro de 10
    if(usedIds.has(picked.id)){
      slot--; // tenta essa posição de novo
      continue;
    }
    usedIds.add(picked.id);
    drawn.push(picked);

    // remove esse jogador do pool local pra não repetir nas próximas posições
    const r = picked.rarity;
    byR[r] = byR[r].filter(p=>p.id !== picked.id);
  }

  // entrega os jogadores de verdade (estado, coleção, missões)
  STATE.boxRemoved[boxId] = STATE.boxRemoved[boxId] || [];
  drawn.forEach(p=>{
    STATE.boxRemoved[boxId].push(p.id);
    ownPlayer(p);
    STATE.stats.ballCounts[p.rarity] = (STATE.stats.ballCounts[p.rarity]||0) + 1;
  });
  STATE.stats.boxesOpened += 1;
  persist();

  updateMissionProgress("openBox", null, STATE.stats.boxesOpened);
  updateMissionProgress("collectionTotal", null, STATE.ownedIds.length);

  const epicCount = drawn.filter(p=>RONALDO_EPIC_RARITIES.includes(p.rarity)).length;
  const headline = drawn.slice().sort((a,b)=> (rarityRank(b.rarity) - rarityRank(a.rarity)) || (b.overall-a.overall))[0];

  playRonaldoRevealAnimation(drawn, headline, epicCount);
}

function rarityRank(r){
  const order = ["branca","prata","dourada","preta","epico","bigtime"];
  return order.indexOf(r);
}

/* ---------------- APRESENTAÇÃO (raios + bug de bolas pretas) ---------------- */
function ronaldoInjectStylesOnce(){
  if(document.getElementById("ronaldoBoxStyles")) return;
  const style = document.createElement("style");
  style.id = "ronaldoBoxStyles";
  style.textContent = `
  .ronaldo-overlay{position:fixed;inset:0;background:rgba(4,6,12,.94);z-index:9999;
    display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:inherit;}
  .ronaldo-bolts{display:flex;gap:10px;margin-bottom:18px;height:60px;align-items:center;justify-content:center;}
  .ronaldo-bolt{width:6px;height:54px;background:linear-gradient(180deg,#fff,#8be9ff);
    clip-path:polygon(50% 0%, 20% 45%, 45% 45%, 10% 100%, 90% 40%, 55% 40%, 80% 0%);
    filter:drop-shadow(0 0 10px #8be9ff);animation:ronaldoBoltFlash .18s infinite alternate;}
  @keyframes ronaldoBoltFlash{ from{opacity:.55;} to{opacity:1;} }
  .ronaldo-balls-row{display:flex;gap:10px;margin-bottom:22px;}
  .ronaldo-ball{width:44px;height:44px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#666,#111);
    border:2px solid rgba(255,255,255,.25);transition:background .25s, box-shadow .25s;}
  .ronaldo-ball.blackout{background:radial-gradient(circle at 35% 30%,#222,#000);
    box-shadow:0 0 18px 4px #8be9ff; border-color:#8be9ff;}
  .ronaldo-headline video, .ronaldo-headline img{max-width:280px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,.6);}
  .ronaldo-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:18px;max-width:360px;}
  .ronaldo-grid img{width:100%;border-radius:8px;}
  .ronaldo-continue{margin-top:20px;background:#ffd23f;color:#111;border:none;padding:12px 30px;
    border-radius:24px;font-weight:700;cursor:pointer;}
  `;
  document.head.appendChild(style);
}

function playRonaldoRevealAnimation(drawn, headline, epicCount){
  ronaldoInjectStylesOnce();
  const overlay = document.createElement("div");
  overlay.className = "ronaldo-overlay";

  // "bug" das bolas: quando vem pelo menos 1 épico/bigtime, a fileira de
  // bolas pisca toda preta antes de abrir — igual o efeito do PES que
  // você mandou. Quantidade de raios em cima = quantidade de épico/bigtime.
  const ballsRow = document.createElement("div");
  ballsRow.className = "ronaldo-balls-row";
  for(let i=0;i<10;i++){
    const b = document.createElement("div");
    b.className = "ronaldo-ball";
    ballsRow.appendChild(b);
  }
  overlay.appendChild(ballsRow);

  const boltsRow = document.createElement("div");
  boltsRow.className = "ronaldo-bolts";
  overlay.appendChild(boltsRow);

  const headlineWrap = document.createElement("div");
  headlineWrap.className = "ronaldo-headline";
  overlay.appendChild(headlineWrap);

  document.body.appendChild(overlay);

  function finishReveal(){
    // some com os raios/bug, mostra a carta de destaque + grade das 10
    boltsRow.innerHTML = "";
    ballsRow.remove();

    const isBigTime = headline.rarity === "bigtime";
    const isEpic = headline.rarity === "epico";
    if(isBigTime || isEpic){
      const vid = document.createElement("video");
      vid.src = isBigTime ? "assets/videos/ronaldobox-bigtime.mp4" : "assets/videos/ronaldobox-epic.mp4";
      vid.autoplay = true; vid.muted = true; vid.playsInline = true;
      headlineWrap.appendChild(vid);
    } else {
      const img = document.createElement("img");
      img.src = headline.image;
      headlineWrap.appendChild(img);
    }

    const grid = document.createElement("div");
    grid.className = "ronaldo-grid";
    drawn.forEach(p=>{
      const img = document.createElement("img");
      img.src = p.image;
      grid.appendChild(img);
    });
    overlay.appendChild(grid);

    const btn = document.createElement("button");
    btn.className = "ronaldo-continue";
    btn.textContent = "Continuar";
    btn.onclick = ()=>{ overlay.remove(); if(typeof renderBoxesScreen==="function") renderBoxesScreen(); };
    overlay.appendChild(btn);
  }

  if(epicCount === 0){
    // giro sem épico/bigtime: sem raio, reveal direto e mais rápido
    setTimeout(finishReveal, 500);
    return;
  }

  // pisca as bolas todas pretas + N raios (N = épico/bigtime que vieram)
  let blinks = 0;
  const blinkInterval = setInterval(()=>{
    blinks++;
    const on = blinks % 2 === 1;
    ballsRow.querySelectorAll(".ronaldo-ball").forEach(b=> b.classList.toggle("blackout", on));
    if(on){
      boltsRow.innerHTML = "";
      for(let i=0;i<epicCount;i++){
        const bolt = document.createElement("div");
        bolt.className = "ronaldo-bolt";
        boltsRow.appendChild(bolt);
      }
    } else {
      boltsRow.innerHTML = "";
    }
    if(blinks >= 6){
      clearInterval(blinkInterval);
      setTimeout(finishReveal, 300);
    }
  }, 220);
}
