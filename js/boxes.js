/* =========================================================
   BOXES — grid de contratação, animação de abertura, coleção
   ========================================================= */
const RARITY_ORDER = ["preta","dourada","prata","branca"];
const RARITY_LABEL = { preta:"Lendária", dourada:"Ouro", prata:"Prata", branca:"Comum" };
const RARITY_WEIGHT_BASE = { preta:1, dourada:3, prata:8, branca:14 }; // peso "natural" de cada bola quando sorteando visual

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
    priceGP: ov.priceGP ?? raw.priceGP ?? 0,
    priceCoins: ov.priceCoins ?? raw.priceCoins,
    allPlayerIds: ov.playerIds ?? raw.players,
  };
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
function renderContratarGrid(){
  const wrap = document.getElementById("contratarGrid");
  const boxes = GAME_DATA.boxesRaw.map(b=>getEffectiveBox(b.id)).filter(b=>b.active);
  if(boxes.length===0){
    wrap.innerHTML = `<div class="empty-state"><div class="big">📦</div>Nenhuma Box ativa no momento.<br>Ative uma no Painel Admin (Configurações).</div>`;
    return;
  }
  wrap.innerHTML = boxes.map(box=>{
    const remaining = getRemainingIds(box.id).length;
    const total = box.allPlayerIds.length;
    const pct = total ? Math.round(((total-remaining)/total)*100) : 0;
    return `
    <div class="box-card">
      <div class="box-banner" style="background-image: url('${box.banner}'), linear-gradient(150deg,#1B2438,#0A0E17); background-size: cover; background-position: center;">
        <span class="box-badge on">ATIVA</span>
        <span class="box-name">${box.name}</span>
      </div>
      <div class="box-body">
        <div class="box-desc">${box.description}</div>
        <div class="ball-row">${renderBallChips(box.id)}</div>
        <div class="box-progress">
          <span>${remaining}/${total} restantes</span>
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="box-prices">
          <div class="price-pill">◆ ${box.priceCoins.toLocaleString("pt-BR")} Moedas</div>
        </div>
        <div class="box-actions">
          <button class="btn btn-primary btn-block" ${remaining===0?"disabled":""} onclick="startBoxOpen('${box.id}','coins')">Contratar (Moedas)</button>
          <button class="btn btn-sm" onclick="resetBox('${box.id}')" title="Resetar Box">↺ Resetar</button>
        </div>
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
  renderContratarGrid();
  renderBoxesScreen();
}

/* ---------------- ABERTURA (animação) ---------------- */
let _pendingOpen = null;

function startBoxOpen(boxId, method){
  const box = getEffectiveBox(boxId);
  const remaining = getRemainingIds(boxId);
  if(remaining.length===0){ toast("Essa Box já foi completada. Resete para jogar de novo.", ""); return; }

  const price = { gp: 0, coins: box.priceCoins };
  if(price.coins > STATE.currency.coins){
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
  const ITEM_W = 96 + 26; // width + gap
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

  const trackWidth = strip.parentElement.clientWidth;
  const offset = (targetIndex * ITEM_W) + (96/2) - (trackWidth/2);

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

    setTimeout(()=>{
      revealCardWrap.innerHTML = renderPlayerCard(player);
      hint.textContent = "Novo reforço contratado!";
      actions.classList.remove("hidden");
      const remaining = getRemainingIds(_pendingOpen.boxId);
      btnAnother.classList.toggle("hidden", remaining.length===0);
      refreshWalletUI();
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
document.getElementById("btnCloseStage").addEventListener("click", ()=>{
  document.getElementById("stageOverlay").classList.add("hidden");
  document.getElementById("beam1").classList.remove("sweep");
  document.getElementById("beam2").classList.remove("sweep");
  renderContratarGrid();
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
