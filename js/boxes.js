/* =========================================================
   BOXES — grid de contratação, animação de abertura, coleção
   ========================================================= */
const RARITY_ORDER = ["preta","dourada","prata","branca"];
const RARITY_LABEL = { preta:"Lendária", dourada:"Ouro", prata:"Prata", branca:"Comum" };
const RARITY_WEIGHT_BASE = { preta:1, dourada:3, prata:8, branca:14 }; // peso "natural" de cada bola quando sorteando visual

/* ---------------- RAIO (bola preta garantida) ----------------
   Igual ao PES Mobile: só nas Boxes de GP (category:"boxdraw"),
   de vez em quando (não é raro) a roleta inteira vira bola preta
   do nada e garante o jogador Lendário. Só pode acontecer se a
   Box ainda tiver pelo menos 1 jogador de bola preta disponível. */
const LIGHTNING_STRIKE_CHANCE = 0.08; // 8% por abertura

function rollLightningStrike(box, byRarity){
  if(box.category !== "boxdraw") return false;
  if(!byRarity.preta || byRarity.preta.length === 0) return false;
  return Math.random() < LIGHTNING_STRIKE_CHANCE;
}

/* ---------------- CUTSCENES (bola preta: Destaque x Lendário x Iconic) ----------------
   Cada jogador tem um campo "tier" em players.json: "destaque" | "lendario" |
   "iconic" | "normal" (ou qualquer outro tier que vocês criarem no futuro).
   Só disparamos cutscene quando a bola sorteada é "preta" (Lendária) E o
   tier do jogador sorteado tem uma entrada em CUTSCENE_BY_TIER abaixo.
   Pra adicionar um tier novo: (1) marque "tier":"nome-do-tier" nos jogadores
   em players.json, (2) adicione "nome-do-tier": "caminho/do/video.mp4" aqui
   embaixo. Não precisa mexer em mais nada. */
const CUTSCENE_BY_TIER = {
  destaque: "assets/videos/cutscene-destaque.mp4",
  lendario: "assets/videos/cutscene-lendario.mp4",
  iconic: "assets/videos/iconic-Moment-Opening-Animation.mp4",
};

function playCutscene(tier, onDone){
  const src = CUTSCENE_BY_TIER[tier];
  if(!src){ onDone(); return; }

  const overlay = document.getElementById("cutsceneOverlay");
  const video = document.getElementById("cutsceneVideo");
  const skipBtn = document.getElementById("cutsceneSkipBtn");

  let finished = false;
  function finish(){
    if(finished) return;
    finished = true;
    video.pause();
    video.removeAttribute("src");
    video.load();
    overlay.classList.add("hidden");
    video.onended = null;
    skipBtn.onclick = null;
    onDone();
  }

  video.src = src;
  video.currentTime = 0;
  overlay.classList.remove("hidden");
  video.onended = finish;
  skipBtn.onclick = finish;

  // se o arquivo de vídeo não existir/der erro, não trava o fluxo do jogo
  video.onerror = finish;

  const playPromise = video.play();
  if(playPromise && playPromise.catch) playPromise.catch(finish);
}

/* ---------------- POOL VISUAL DA ROLETA ----------------
   Antes, o giro sempre sorteava as 4 cores (preta/dourada/prata/branca)
   em pesos iguais pra "encher" a faixa animada — só que isso é o que
   causa o bug: uma Box que só tem bola preta (ex: as Boxes grátis de
   jogador único) ainda mostrava dourada/prata/branca girando, mesmo
   sem nenhum jogador dessas cores disponível ali dentro. Sempre
   parava certo na bola preta no final, mas a faixa toda mentia sobre
   o que existe na Box.
   Agora o giro só usa as cores que a Box realmente tem restante (byR),
   ponderadas pelo peso "natural" de cada uma (RARITY_WEIGHT_BASE) pra
   manter a preta rara de aparecer quando ela convive com outras cores
   — mas se só sobrar preta, a faixa inteira gira só de preta mesmo. */
function buildVisualPool(byR){
  const pool = [];
  RARITY_ORDER.forEach(r=>{
    if(byR[r] && byR[r].length > 0){
      const weight = RARITY_WEIGHT_BASE[r] || 1;
      for(let i=0;i<weight;i++) pool.push(r);
    }
  });
  return pool.length ? pool : RARITY_ORDER.slice(); // fallback de segurança
}

function getOverride(boxId){ return STATE.adminOverrides[boxId] || {}; }

function getEffectiveBox(boxId){
  const raw = GAME_DATA.boxesRaw.find(b=>b.id===boxId);
  if(!raw) return null;
  const ov = getOverride(boxId);
  return {
    id: raw.id,
    name: ov.name ?? raw.name,
    description: ov.description ?? raw.description,
    banner: ov.banner ?? raw.banner,
    active: ov.active ?? raw.active,
    category: ov.category ?? raw.category ?? "especial", // "boxdraw" | "especial"
    priceGP: ov.priceGP ?? raw.priceGP ?? 0,
    priceCoins: ov.priceCoins ?? raw.priceCoins,
    expiresAt: ov.expiresAt ?? raw.expiresAt ?? null,
    allPlayerIds: ov.playerIds ?? raw.players,
  };
}

/* "13 dias 20 hrs restantes" — funciona só se a box tiver o campo
   opcional "expiresAt" (ISO datetime, ex: "2026-07-23T00:00:00").
   Sem esse campo, o card simplesmente não mostra o prazo. */
function formatTimeLeft(expiresAt){
  if(!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  if(diff <= 0) return "Expirada";
  const totalHours = Math.floor(diff / 3600000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return days > 0 ? `${days} dias ${hours} hrs restantes` : `${hours} hrs restantes`;
}

function getRemainingIds(boxId){
  const box = getEffectiveBox(boxId);
  if(!box) return [];
  const removed = (STATE.boxRemoved[boxId] || []).map(id => String(id).toUpperCase());
  return box.allPlayerIds.filter(id => !removed.includes(String(id).toUpperCase()));
}

function getRemainingByRarity(boxId){
  const remaining = getRemainingIds(boxId).map(getPlayer).filter(Boolean);
  const out = { preta:[], dourada:[], prata:[], branca:[] };
  remaining.forEach(p=> out[p.rarity] && out[p.rarity].push(p));
  return out;
}

function renderBallChips(boxId){
  const byR = getRemainingByRarity(boxId);
  return RARITY_ORDER.map(r=>`
    <span class="ball-chip"><span class="ball-dot ${r}"></span>${byR[r].length}</span>
  `).join("");
}

/* ---------------- CONTRATAR GRID ---------------- */
const CONTRATAR_GRID_IDS = { boxdraw: "boxdrawGrid", especial: "especialGrid" };

function renderContratarGrid(category){
  const wrap = document.getElementById(CONTRATAR_GRID_IDS[category] || "contratarGrid");
  if(!wrap) return;
  const boxes = GAME_DATA.boxesRaw.map(b=>getEffectiveBox(b.id)).filter(b=>b.active && b.category===category);
  if(boxes.length===0){
    wrap.innerHTML = `<div class="empty-state"><div class="big">📦</div>Nenhuma Box ativa no momento.<br>Ative uma no Painel Admin (Configurações).</div>`;
    return;
  }
  wrap.innerHTML = boxes.map(box=>{
    const remaining = getRemainingIds(box.id).length;
    const total = box.allPlayerIds.length;
    const timeLeft = formatTimeLeft(box.expiresAt);
    return `
    <div class="box-pair">
      <div class="box-card">
        <div class="box-banner" style="background-image: url('${box.banner}'), linear-gradient(150deg,#1B2438,#0A0E17); background-size: cover; background-position: center;">
          <span class="box-badge on">ATIVA</span>
          ${box.category === "gratis" ? `<span class="box-badge-free">FREE</span>` : ""}
        </div>
        <div class="box-body">
          <div class="box-name-row">
            <span class="box-name-lg">${box.name}</span>
            ${timeLeft ? `<span class="box-timeleft">⏱ ${timeLeft}</span>` : ""}
          </div>
          <div class="box-bottom-row">
            <button class="box-search-btn" onclick="showBoxSearchModal('${box.id}')" title="Ver jogadores disponíveis">🔍</button>
            <div class="box-prices-inline">
              ${box.category === "boxdraw"
                ? `<div class="price-pill">$ ${box.priceGP.toLocaleString("pt-BR")}</div>`
                : box.category === "gratis"
                  ? `<div class="price-pill price-pill-free">GRÁTIS</div><span class="free-left-badge">${remaining} restante${remaining===1?"":"s"}</span>`
                  : `<div class="price-pill">◆ ${box.priceCoins.toLocaleString("pt-BR")}</div>`}
            </div>
          </div>
          <button class="btn btn-primary btn-block ${box.category==='gratis'?'btn-free-spin':''}" ${remaining===0?"disabled":""} onclick="startBoxOpen('${box.id}','${box.category==='boxdraw'?'gp':'coins'}')">${box.category==='gratis' ? '🎁 Girar Grátis' : 'Contratar'}</button>
        </div>
      </div>
      <div class="box-stats-panel">
        <div class="stat-block">
          <div class="stat-label">Jogadores Restantes</div>
          <div class="stat-value">${remaining}</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">Bolas Restantes</div>
          <div class="ball-row-dark">${renderBallChips(box.id)}</div>
        </div>
        <div class="stat-note">Resete para restaurar os jogadores disponíveis às configurações iniciais.</div>
        <button class="btn btn-sm btn-block btn-reset-dark" onclick="resetBox('${box.id}')">↺ Resetar</button>
      </div>
    </div>`;
  }).join("");
}

function resetBox(boxId){
  const box = getEffectiveBox(boxId);
  if(!confirm(`Resetar "${box.name}"? Todos os jogadores voltarão a ficar disponíveis nessa Box.`)) return;
  STATE.boxRemoved[boxId] = [];
  persist();
  toast(`Box "${box.name}" resetada!`, "success");
  renderContratarGrid("boxdraw");
  renderContratarGrid("especial");
  renderBoxesScreen();
}

/* ---------------- ABERTURA (animação) ---------------- */
let _pendingOpen = null;

function startBoxOpen(boxId, method){
  const box = getEffectiveBox(boxId);
  const remaining = getRemainingIds(boxId);
  if(remaining.length===0){ toast("Essa Box já foi completada. Resete para jogar de novo.", ""); return; }

  const price = box.category === "boxdraw"
    ? { gp: box.priceGP, coins: 0 }
    : { gp: 0, coins: box.priceCoins };
  if(price.gp > STATE.currency.gp || price.coins > STATE.currency.coins){
    toast("Saldo insuficiente para essa contratação.", "");
    return;
  }
  if(!spendCurrency(price.gp, price.coins)) { toast("Saldo insuficiente.", ""); return; }

  const byR = getRemainingByRarity(boxId);
  // Chance de "raio": vira a roleta toda bola preta e garante o Lendário
  // (só em Box de GP, e só se sobrar bola preta pra sortear).
  const lightningStrike = rollLightningStrike(box, byR);

  let chosenRarity, chosenPlayer;
  if(lightningStrike){
    chosenRarity = "preta";
    chosenPlayer = byR.preta[Math.floor(Math.random()*byR.preta.length)];
  } else {
    // sorteio ponderado pela quantidade restante de cada raridade
    const pool = [];
    RARITY_ORDER.forEach(r=>{ for(let i=0;i<byR[r].length;i++) pool.push(r); });
    chosenRarity = pool[Math.floor(Math.random()*pool.length)];
    const candidates = byR[chosenRarity];
    chosenPlayer = candidates[Math.floor(Math.random()*candidates.length)];
  }

  // remove da box, entrega ao clube
  STATE.boxRemoved[boxId] = STATE.boxRemoved[boxId] || [];
  STATE.boxRemoved[boxId].push(chosenPlayer.id);
  ownPlayer(chosenPlayer);

  STATE.stats.boxesOpened += 1;
  STATE.stats.ballCounts[chosenRarity] += 1;
  persist();

  updateMissionProgress("openBox", null, STATE.stats.boxesOpened);
  updateMissionProgress("ballCount", chosenRarity, STATE.stats.ballCounts[chosenRarity]);
  updateMissionProgress("spendGP", null, STATE.stats.gpSpent);
  updateMissionProgress("collectionTotal", null, STATE.ownedIds.length);

  const newRemaining = getRemainingIds(boxId);
  if(newRemaining.length===0){
    updateMissionProgress("completeBox", null, (STATE.stats.completedBoxes = (STATE.stats.completedBoxes||0)+1));
    addGift(`Box completa: ${box.name}`, "Você contratou todos os jogadores dessa Box!", 3000, 50);
  }

  _pendingOpen = { boxId, method };
  playOpenAnimation(chosenRarity, chosenPlayer, lightningStrike, byR);
}

function playOpenAnimation(rarity, player, lightningStrike, byR){
  // Cores que a Box realmente tem restante — é isso que a faixa gira,
  // não mais as 4 cores fixas (ver buildVisualPool acima).
  const visualPool = buildVisualPool(byR || {});
  function pickVisualRarity(){ return visualPool[Math.floor(Math.random()*visualPool.length)]; }

  const overlay = document.getElementById("stageOverlay");
  const spinWrap = document.getElementById("stageSpinWrap");
  const revealWrap = document.getElementById("stageRevealWrap");
  const actions = document.getElementById("stageActions");
  const hint = document.getElementById("stageHint");
  const strip = document.getElementById("ballStrip");
  const revealBall = document.getElementById("revealBall");
  const revealCardWrap = document.getElementById("revealCardWrap");
  const btnAnother = document.getElementById("btnOpenAnother");
  const track = strip.parentElement; // .ball-track

  overlay.classList.remove("hidden");
  spinWrap.classList.remove("hidden");
  revealWrap.classList.add("hidden");
  actions.classList.add("hidden");
  hint.classList.remove("lightning-hint");
  hint.textContent = "Toque na tela para parar";
  hint.classList.add("tap-pulse");
  revealCardWrap.innerHTML = "";
  document.getElementById("beam1").classList.add("sweep");
  document.getElementById("beam2").classList.add("sweep");
  pauseMusic(); // música para assim que a roleta começa a girar

  // Sequência inicial: só bolas aleatórias. A bola vencedora (já sorteada
  // lá em cima, em startBoxOpen) só entra na faixa quando o usuário tocar
  // na tela — até lá a roleta gira livre e aleatória, sem parar sozinha.
  const sequence = [];
  for(let i=0;i<24;i++){
    sequence.push(pickVisualRarity());
  }
  strip.innerHTML = sequence.map(r=>`<div class="ball-item ${r}"></div>`).join("");
  strip.style.transition = "none";
  strip.style.transform = "translateX(0px)";
  // força reflow
  void strip.offsetWidth;

  // Lê o tamanho REAL da bola renderizada (em vez de um valor fixo),
  // porque o CSS reduz a bola em telas baixas/paisagem (ex: 78px, 72px).
  // Usando um valor fixo aqui, a conta de onde parar ficava errada
  // nesses breakpoints — o alvo não parava centralizado de verdade.
  const firstBall = strip.querySelector(".ball-item");
  const ballW = firstBall ? firstBall.getBoundingClientRect().width : 96;
  const gap = parseFloat(getComputedStyle(strip).columnGap || getComputedStyle(strip).gap) || 26;
  const ITEM_W = ballW + gap;
  const trackWidth = track.clientWidth;

  // Quantas bolas cabem, no mínimo, da posição atual até a borda direita
  // da tela (+ uma margem de segurança generosa). Como a roleta agora
  // ocupa a tela inteira (bem mais larga que antes), o buffer precisa ser
  // calculado a partir da largura real — e com folga extra, pra nunca
  // faltar bola nem por causa de arredondamento.
  const VISIBLE_AHEAD = Math.ceil(trackWidth / ITEM_W) + 12;

  function fillSequenceTo(minIndex){
    while(sequence.length <= minIndex){
      const r = pickVisualRarity();
      sequence.push(r);
      const div = document.createElement("div");
      div.className = "ball-item " + r;
      strip.appendChild(div);
    }
  }

  // ---------------- GIRO LIVRE (contínuo e aleatório) ----------------
  // Continua girando pra sempre, sempre completando novas bolas aleatórias
  // um pouco à frente da posição visível, pra nunca faltar bola na tela
  // (nunca "sumir" nada). Só para quando o usuário tocar/clicar na tela.
  let posX = 0;
  const SPEED = ITEM_W * 3.2; // px/s do giro livre
  let lastTs = null;
  let spinning = true;
  let rafId = null;

  function ensureBuffer(aheadCount){
    const currentIndex = Math.abs(posX) / ITEM_W;
    const need = Math.max(aheadCount, VISIBLE_AHEAD);
    fillSequenceTo(Math.ceil(currentIndex + need));
  }
  ensureBuffer(VISIBLE_AHEAD);

  function freeSpinFrame(ts){
    if(!spinning) return;
    if(lastTs === null) lastTs = ts;
    const dt = (ts - lastTs) / 1000;
    lastTs = ts;
    posX -= SPEED * dt;
    strip.style.transform = `translateX(${posX}px)`;
    ensureBuffer(VISIBLE_AHEAD);
    rafId = requestAnimationFrame(freeSpinFrame);
  }
  rafId = requestAnimationFrame(freeSpinFrame);

  function stopSpin(){
    if(!spinning) return;
    spinning = false;
    cancelAnimationFrame(rafId);
    overlay.removeEventListener("click", stopSpin);
    overlay.removeEventListener("touchstart", stopSpin);

    if(STATE.settings.vibration && navigator.vibrate) navigator.vibrate(20);
    hint.classList.remove("tap-pulse");
    hint.textContent = "Abrindo Box...";

    // Escolhe o alvo alguns "giros" à frente da posição atual, pra dar
    // tempo de desacelerar até parar exatamente na bola vencedora.
    const currentIndex = Math.abs(posX) / ITEM_W;
    const targetIndex = Math.ceil(currentIndex) + 14 + Math.floor(Math.random()*4);

    ensureBuffer(targetIndex - Math.floor(currentIndex) + VISIBLE_AHEAD);
    // Preenchimento extra além do alvo — cobre a tela inteira à direita
    // do ponto de parada com boa folga, mesmo em telas bem largas.
    fillSequenceTo(targetIndex + VISIBLE_AHEAD + 10);
    sequence[targetIndex] = rarity;
    strip.children[targetIndex].className = "ball-item " + rarity;

    const offset = (targetIndex * ITEM_W) + (ballW/2) - (trackWidth/2);

    strip.style.transition = "none";
    strip.style.transform = `translateX(${posX}px)`;
    void strip.offsetWidth;

    requestAnimationFrame(()=>{
      strip.style.transition = "transform 2.1s cubic-bezier(.11,.79,.16,1)";
      strip.style.transform = `translateX(-${offset}px)`;
    });

    if(lightningStrike){
      setTimeout(()=> triggerLightningStrikeEffect(strip, sequence.length, offset), 700);
    }

    setTimeout(()=>{
      spinWrap.classList.add("hidden");
      revealWrap.classList.remove("hidden");
      revealBall.className = "reveal-ball glow-" + rarity + (lightningStrike ? " lightning" : "");
      hint.classList.remove("lightning-hint");
      hint.textContent = "Revelando jogador...";
      if(STATE.settings.vibration && navigator.vibrate) navigator.vibrate([40,30,60]);

      function showPlayerCard(){
        revealCardWrap.innerHTML = renderPlayerCard(player);
        hint.textContent = "Novo reforço contratado!";
        actions.classList.remove("hidden");
        const remaining = getRemainingIds(_pendingOpen.boxId);
        btnAnother.classList.toggle("hidden", remaining.length===0);
        refreshWalletUI();
      }

      // Bola preta + jogador com tier que tem cutscene cadastrada (destaque,
      // lendario, iconic, ou qualquer tier novo que vocês adicionarem depois
      // em CUTSCENE_BY_TIER) -> toca a cutscene certa antes da carta.
      const wantsCutscene = rarity === "preta" && !!CUTSCENE_BY_TIER[player.tier];

      setTimeout(()=>{
        if(wantsCutscene){
          playCutscene(player.tier, showPlayerCard);
        } else {
          showPlayerCard();
        }
      }, 900);
    }, 2200);
  }

  // Registrado só no próximo "tick": se o clique que chamou essa animação
  // veio de um botão que está dentro do próprio overlay (ex: "Contratar
  // outro"), esse mesmo clique ainda estaria borbulhando pelo overlay —
  // sem esse pequeno atraso, o listener pegava esse clique "de graça" e a
  // roleta já nascia parada, sem girar de verdade.
  setTimeout(()=>{
    overlay.addEventListener("click", stopSpin);
    overlay.addEventListener("touchstart", stopSpin, {passive:true});
  }, 0);
}

/* Congela a roleta na posição atual, dá um flash + tremida na tela
   e troca todas as bolas visíveis por bola preta, retomando o giro
   até o mesmo alvo (que já é preta, garantido pelo sorteio). */
function triggerLightningStrikeEffect(strip, ballCount, offset){
  const computed = getComputedStyle(strip).transform;
  strip.style.transition = "none";
  strip.style.transform = computed;
  void strip.offsetWidth;

  const stageInner = document.querySelector(".stage-inner");
  const flash = document.createElement("div");
  flash.className = "lightning-flash";
  const bolt = document.createElement("div");
  bolt.className = "lightning-bolt";
  bolt.textContent = "⚡";
  document.body.appendChild(flash);
  document.body.appendChild(bolt);
  if(stageInner) stageInner.classList.add("shake");
  if(STATE.settings.vibration && navigator.vibrate) navigator.vibrate([15,40,15,40,150]);
  setTimeout(()=>{
    flash.remove();
    bolt.remove();
    if(stageInner) stageInner.classList.remove("shake");
  }, 650);

  const hint = document.getElementById("stageHint");
  if(hint){
    hint.textContent = "⚡ RAIO! Bola Preta garantida!";
    hint.classList.add("lightning-hint");
  }

  strip.innerHTML = Array.from({length: ballCount}).map(()=>`<div class="ball-item preta"></div>`).join("");

  requestAnimationFrame(()=>{
    strip.style.transition = "transform 1.1s cubic-bezier(.11,.79,.16,1)";
    strip.style.transform = `translateX(-${offset}px)`;
  });
}

function renderPlayerCard(p){
  return `
    <div class="p-card rarity-${p.rarity}">
      <span class="p-rarity-label">${p.rarityLabel}</span>
      <div class="p-photo-frame">
        <img src="${p.image}" alt="${p.name}" class="p-photo" onerror="this.onerror=null; this.src='assets/players/default.png';">
        <div class="p-card-shade"></div>
        <div class="p-corner-info">
          <span class="p-ovr">${p.overall}</span>
          <span class="p-pos-badge">${p.position}</span>
          <span class="p-flag">${p.nationalityFlag}</span>
        </div>
        <div class="p-name-bar">
          <span class="p-name">${p.name}</span>
          <span class="p-meta">${p.club}</span>
        </div>
      </div>
    </div>`;
}
/* ---------------- LUPA: modal "Jogadores Disponíveis" ----------------
   Antes renderizava TODOS os jogadores restantes de uma vez só — com
   Boxes grandes isso sobrecarregava o grid e bugava o layout (cards
   empilhados). Agora carrega só os primeiros 15, e vai soltando mais
   conforme o usuário rola até o fim da lista, até acabar o total. */
const SEARCH_PAGE_SIZE = 15;
let _searchModalPlayers = [];
let _searchModalRendered = 0;

function renderSearchModalBatch(){
  const grid = document.getElementById("searchModalGrid");
  const next = _searchModalPlayers.slice(_searchModalRendered, _searchModalRendered + SEARCH_PAGE_SIZE);
  if(!next.length) return;
  grid.insertAdjacentHTML("beforeend", next.map(p=>renderPlayerCard(p)).join(""));
  _searchModalRendered += next.length;
}

function handleSearchModalScroll(){
  if(_searchModalRendered >= _searchModalPlayers.length) return;
  const el = document.getElementById("searchModalGrid");
  // dispara um pouco antes de chegar no fim de verdade (120px de folga)
  if(el.scrollTop + el.clientHeight >= el.scrollHeight - 120){
    renderSearchModalBatch();
  }
}

function showBoxSearchModal(boxId){
  const box = getEffectiveBox(boxId);
  if(!box) return;
  _searchModalPlayers = getRemainingIds(boxId).map(getPlayer).filter(Boolean);
  _searchModalRendered = 0;

  document.getElementById("searchModalTitle").textContent = `Jogadores Disponíveis — ${box.name}`;
  document.getElementById("searchModalCount").textContent = _searchModalPlayers.length;

  const grid = document.getElementById("searchModalGrid");
  grid.scrollTop = 0;

  if(!_searchModalPlayers.length){
    grid.innerHTML = `<div class="empty-state"><div class="big">🔍</div>Essa Box já foi completada.</div>`;
  } else {
    grid.innerHTML = "";
    renderSearchModalBatch();
  }

  document.getElementById("boxSearchOverlay").classList.remove("hidden");
}

function closeBoxSearchModal(){
  document.getElementById("boxSearchOverlay").classList.add("hidden");
}

document.getElementById("btnCloseSearch").addEventListener("click", closeBoxSearchModal);
document.getElementById("boxSearchOverlay").addEventListener("click", (e)=>{
  if(e.target.id === "boxSearchOverlay") closeBoxSearchModal();
});
document.getElementById("searchModalGrid").addEventListener("scroll", handleSearchModalScroll);

/* ---------------- Carrossel: setas de navegação ---------------- */
function scrollBoxCarousel(dir, gridId){
  const grid = document.getElementById(gridId || "contratarGrid");
  if(!grid) return;
  const card = grid.querySelector(".box-pair");
  const step = card ? card.getBoundingClientRect().width + 24 : grid.clientWidth * 0.8;
  grid.scrollBy({ left: dir * step, behavior: "smooth" });
}
document.getElementById("btnBoxDrawPrev").addEventListener("click", ()=>scrollBoxCarousel(-1,"boxdrawGrid"));
document.getElementById("btnBoxDrawNext").addEventListener("click", ()=>scrollBoxCarousel(1,"boxdrawGrid"));
document.getElementById("btnEspecialPrev").addEventListener("click", ()=>scrollBoxCarousel(-1,"especialGrid"));
document.getElementById("btnEspecialNext").addEventListener("click", ()=>scrollBoxCarousel(1,"especialGrid"));

document.getElementById("btnCloseStage").addEventListener("click", ()=>{
  document.getElementById("stageOverlay").classList.add("hidden");
  document.getElementById("beam1").classList.remove("sweep");
  document.getElementById("beam2").classList.remove("sweep");
  renderContratarGrid("boxdraw");
  renderContratarGrid("especial");
  renderHome();
  resumeMusicWithNextTrack(); // sai da Box -> toca outra faixa da playlist
});
document.getElementById("btnOpenAnother").addEventListener("click", ()=>{
  if(_pendingOpen) startBoxOpen(_pendingOpen.boxId, _pendingOpen.method);
});

/* ---------------- TELA BOXES (coleção por box) ---------------- */
let _activeBoxDetail = null;

function renderBoxesScreen(){
  const listWrap = document.getElementById("boxesListWrap");
  const boxes = GAME_DATA.boxesRaw.map(b=>getEffectiveBox(b.id));
  listWrap.innerHTML = `<div class="box-grid">` + boxes.map(box=>{
    const remaining = getRemainingIds(box.id).length;
    const total = box.allPlayerIds.length;
    const pct = total? Math.round(((total-remaining)/total)*100):0;
    return `
    <div class="box-card">
      <div class="box-banner ${box.banner}">
        <span class="box-badge ${box.active?"on":"off"}">${box.active?"ATIVA":"INATIVA"}</span>
        <span class="box-name">${box.name}</span>
      </div>
      <div class="box-body">
        <div class="box-progress">
          <span>${total-remaining}/${total} obtidos (${pct}%)</span>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <button class="btn btn-sm btn-block" onclick="showBoxDetail('${box.id}')">Ver coleção</button>
      </div>
    </div>`;
  }).join("") + `</div>`;

  if(_activeBoxDetail) showBoxDetail(_activeBoxDetail);
  else document.getElementById("boxDetailWrap").innerHTML = "";
}

function showBoxDetail(boxId){
  _activeBoxDetail = boxId;
  const box = getEffectiveBox(boxId);
  const removed = STATE.boxRemoved[boxId] || [];
  const players = box.allPlayerIds.map(getPlayer).filter(Boolean);
  const wrap = document.getElementById("boxDetailWrap");
  wrap.innerHTML = `
    <div class="card" style="margin-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <h3 style="margin:0;font-family:var(--font-display);font-size:20px;">${box.name} — Coleção</h3>
        <button class="btn btn-sm btn-danger" onclick="resetBox('${box.id}')">↺ Resetar Box</button>
      </div>
      <p class="page-sub">${removed.length} obtidos de ${players.length} totais (${players.length? Math.round(removed.length/players.length*100):0}% da coleção)</p>
      <div class="club-grid" style="margin-top:14px;">
        ${players.map(p=>{
          const owned = removed.includes(p.id);
          const initials = p.name.split(" ").map(w=>w[0]).slice(0,2).join("");
          return `<div class="p-card rarity-${p.rarity} ${owned?'':'p-locked'}">
            <span class="p-rarity-label">${p.rarityLabel}</span>
            <div class="p-photo-frame">
              ${owned
                ? `<img src="${p.image}" alt="${p.name}" class="p-photo" onerror="this.onerror=null; this.src='assets/players/default.png';">`
                : `<div class="p-avatar">${initials}</div>`}
              <div class="p-card-shade"></div>
              <div class="p-corner-info">
                <span class="p-ovr">${owned? p.overall : "??"}</span>
                <span class="p-pos-badge">${p.position}</span>
                <span class="p-flag">${owned? p.nationalityFlag : "🔒"}</span>
              </div>
              <div class="p-name-bar">
                <span class="p-name">${owned? p.name : "Bloqueado"}</span>
                <span class="p-meta">${owned? p.club : "Ainda não contratado"}</span>
              </div>
            </div>
          </div>`;
        }).join("")}
      </div>
    </div>
  `;
}
