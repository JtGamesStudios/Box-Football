/* =========================================================
   BOXES — grid de contratação, animação de abertura, coleção
   ========================================================= */
const RARITY_ORDER = ["preta","dourada","prata","branca"];
const RARITY_LABEL = { preta:"Lendária", dourada:"Ouro", prata:"Prata", branca:"Comum" };
const RARITY_WEIGHT_BASE = { preta:1, dourada:3, prata:8, branca:14 }; // peso "natural" de cada bola quando sorteando visual

/* ---------------- CUTSCENES (bola preta: Destaque x Lendário x Iconic) ----------------
   Cada jogador tem um campo "tier" em players.json: "destaque" | "lendario" |
   "iconic" | "normal" (ou qualquer outro tier que vocês criarem no futuro).
   Só disparamos cutscene quando a bola sorteada é "preta" (Lendária) E o
   tier do jogador sorteado tem uma entrada em CUTSCENE_BY_TIER abaixo.
   Pra adicionar um tier novo: (1) marque "tier":"nome-do-tier" nos jogadores
   em players.json, (2) adicione "nome-do-tier": "caminho/do/video.mp4" aqui
   embaixo. Não precisa mexer em mais nada. */
const CUTSCENE_BY_TIER = {
  destaque: "assets/video/cutscene-destaque.mp4",
  lendario: "assets/video/cutscene-lendario.mp4",
  iconic: "assets/video/iconic-Moment-Opening-Animation.mp4",
};

// Cria (se ainda não existir) o botão de "ativar som" que fica sobre o vídeo.
// Assim não é preciso mexer no HTML pra essa correção funcionar.
function getCutsceneUnmuteBtn(overlay, video){
  let btn = document.getElementById("cutsceneUnmuteBtn");
  if(btn) return btn;
  btn = document.createElement("button");
  btn.id = "cutsceneUnmuteBtn";
  btn.type = "button";
  btn.textContent = "🔇 Ativar som";
  btn.style.cssText = `
    position:absolute; left:50%; bottom:64px; transform:translateX(-50%);
    z-index:20; padding:10px 18px; border:none; border-radius:999px;
    background:rgba(0,0,0,.65); color:#fff; font-size:14px; font-weight:600;
    cursor:pointer; backdrop-filter:blur(4px); display:none;
  `;
  overlay.appendChild(btn);
  btn.addEventListener("click", ()=>{
    video.muted = false;
    btn.style.display = "none";
  });
  return btn;
}

function playCutscene(tier, onDone){
  const src = CUTSCENE_BY_TIER[tier];
  if(!src){ onDone(); return; }

  const overlay = document.getElementById("cutsceneOverlay");
  const video = document.getElementById("cutsceneVideo");
  const skipBtn = document.getElementById("cutsceneSkipBtn");
  const unmuteBtn = getCutsceneUnmuteBtn(overlay, video);

  let finished = false;
  function finish(){
    if(finished) return;
    finished = true;
    video.pause();
    video.removeAttribute("src");
    video.load();
    overlay.classList.add("hidden");
    unmuteBtn.style.display = "none";
    video.onended = null;
    skipBtn.onclick = null;
    onDone();
  }

  video.src = src;
  video.currentTime = 0;
  video.playsInline = true; // evita fullscreen nativo automático no iOS
  overlay.classList.remove("hidden");
  video.onended = finish;
  skipBtn.onclick = finish;

  // se o arquivo de vídeo não existir/der erro, não trava o fluxo do jogo
  video.onerror = finish;

  // 1ª tentativa: com som (o clique em "Contratar" já foi o gesto do usuário,
  // então às vezes o navegador ainda deixa passar dependendo do timing).
  video.muted = false;
  const playPromise = video.play();

  if(playPromise && playPromise.catch){
    playPromise.catch(()=>{
      // Bloqueado: autoplay com som negado. Autoplay MUDO nunca é bloqueado,
      // então tocamos mudo e mostramos o botão pra o usuário ativar o som
      // quando quiser (isso conta como novo gesto de usuário).
      video.muted = true;
      unmuteBtn.style.display = "block";
      const retryPromise = video.play();
      if(retryPromise && retryPromise.catch){
        // só chega aqui se o problema for outro (arquivo/formato), não autoplay
        retryPromise.catch(finish);
      }
    });
  }
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
                : `<div class="price-pill">◆ ${box.priceCoins.toLocaleString("pt-BR")}</div>`}
            </div>
          </div>
          <button class="btn btn-primary btn-block" ${remaining===0?"disabled":""} onclick="startBoxOpen('${box.id}','${box.category==='boxdraw'?'gp':'coins'}')">Contratar</button>
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
  // sorteio ponderado pela quantidade restante de cada raridade
  const pool = [];
  RARITY_ORDER.forEach(r=>{ for(let i=0;i<byR[r].length;i++) pool.push(r); });
  const chosenRarity = pool[Math.floor(Math.random()*pool.length)];
  const candidates = byR[chosenRarity];
  const chosenPlayer = candidates[Math.floor(Math.random()*candidates.length)];

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
  playOpenAnimation(chosenRarity, chosenPlayer);
}

function playOpenAnimation(rarity, player){
  const overlay = document.getElementById("stageOverlay");
  const spinWrap = document.getElementById("stageSpinWrap");
  const revealWrap = document.getElementById("stageRevealWrap");
  const actions = document.getElementById("stageActions");
  const hint = document.getElementById("stageHint");
  const strip = document.getElementById("ballStrip");
  const revealBall = document.getElementById("revealBall");
  const revealCardWrap = document.getElementById("revealCardWrap");
  const btnAnother = document.getElementById("btnOpenAnother");

  overlay.classList.remove("hidden");
  spinWrap.classList.remove("hidden");
  revealWrap.classList.add("hidden");
  actions.classList.add("hidden");
  hint.textContent = "Abrindo Box...";
  revealCardWrap.innerHTML = "";
  document.getElementById("beam1").classList.add("sweep");
  document.getElementById("beam2").classList.add("sweep");

  // monta sequência de bolas: aleatórias + a vencedora no índice alvo
  const targetIndex = 34;
  const sequence = [];
  for(let i=0;i<40;i++){
    sequence.push(i===targetIndex ? rarity : RARITY_ORDER[Math.floor(Math.random()*RARITY_ORDER.length)]);
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

  const trackWidth = strip.parentElement.clientWidth;
  const offset = (targetIndex * ITEM_W) + (ballW/2) - (trackWidth/2);

  requestAnimationFrame(()=>{
    strip.style.transition = "transform 2.4s cubic-bezier(.11,.79,.16,1)";
    strip.style.transform = `translateX(-${offset}px)`;
  });

  setTimeout(()=>{
    spinWrap.classList.add("hidden");
    revealWrap.classList.remove("hidden");
    revealBall.className = "reveal-ball glow-" + rarity;
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
  }, 2500);
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
