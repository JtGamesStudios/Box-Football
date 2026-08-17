/* =========================================================
   TRADES — dois sistemas de troca de jogadores:

   1) TROCA DO SISTEMA — você oferece 1+ jogadores (só Destaque/
      Lendário) e o PRÓPRIO JOGO monta as opções de quem você pode
      receber em troca, com base no valor somado do que você ofereceu.
      100% local, sem depender de outro jogador.

   2) TROCA COM AMIGOS — você negocia livremente (qualquer jogador
      do seu elenco) com alguém da sua lista de amigos (a mesma lista
      do "Jogo c/ amigo", ver js/online.js), com um chat dentro da
      sala de troca. Usa o mesmo Firestore já usado pelo PvP (ver
      ensurePvpDb() em js/online.js) como "servidor" — sem backend
      próprio. Coleções novas:

        playerTrades/{code} -> {
          code, fromId, fromName, toId, toName,
          offerFrom: [{id,name,overall,tier,image,rarity}, ...],
          offerTo:   [...],
          confirmedFrom, confirmedTo,
          status: "open" | "completed" | "cancelled",
          chat: [{from, name, text, ts}, ...],
        }
        tradeInvites/{playerId} -> { pending: {code, fromId, fromName, createdAt} | null }
        (mesmo padrão de pvpInvites em js/online.js)

   Ambos os cards ficam dentro da tela "Trades" (aba Contract), com
   duas abas internas (Sistema / Amigos) — ver #tradeTabs no index.html.
   ========================================================= */

/* ---------- valor de troca de um jogador ---------- */
const TRADE_TIER_MULT = { normal: 1, destaque: 1.6, lendario: 3.2, iconic: 6 };
const TRADE_ELIGIBLE_TIERS = ["destaque", "lendario"]; // só esses entram na Troca do Sistema
const TRADE_VALUE_BAND = 0.15;   // ±15% de faixa de valor pros candidatos
const TRADE_FEE_PCT = 0.12;      // taxa em GP sobre o valor do jogador recebido
const TRADE_SEASON_LIMIT = 2;    // trocas do sistema permitidas por temporada do Match Pass
const TRADE_MAX_OFFER = 5;       // máximo de jogadores oferecidos de uma vez

function tradeValue(p){
  if(!p) return 0;
  return Math.round((p.overall || 0) * (TRADE_TIER_MULT[p.tier] || 1));
}

function tradeTierLabel(tier){
  return tier === "lendario" ? "Lendário" : tier === "iconic" ? "Icônico" : tier === "destaque" ? "Destaque" : "Comum";
}

/* ---------- estado local (temporada / limites) ---------- */
function ensureTradeState(){
  if(!STATE.trades) STATE.trades = { systemSeasonId: null, systemUsed: 0, appliedCodes: [] };
  if(!Array.isArray(STATE.trades.appliedCodes)) STATE.trades.appliedCodes = [];
  const season = (typeof GAME_DATA !== "undefined") ? GAME_DATA.matchPassSeason : null;
  const seasonId = season ? season.id : "no-season";
  if(STATE.trades.systemSeasonId !== seasonId){
    STATE.trades.systemSeasonId = seasonId;
    STATE.trades.systemUsed = 0;
    persist();
  }
  return STATE.trades;
}

function systemTradesLeft(){
  ensureTradeState();
  return Math.max(0, TRADE_SEASON_LIMIT - STATE.trades.systemUsed);
}

/* =========================================================
   TELA "TRADES" — hub com as duas abas
   ========================================================= */
let _tradesActiveTab = "system";

function renderTradesScreen(){
  document.querySelectorAll("#tradeTabs .trade-tab-btn").forEach(btn=>{
    btn.classList.toggle("active", btn.dataset.tsub === _tradesActiveTab);
    btn.onclick = ()=> tdSwitchTab(btn.dataset.tsub);
  });
  if(_tradesActiveTab === "system") renderSystemTrade();
  else renderFriendTrade();
}

function tdSwitchTab(tab){
  _tradesActiveTab = tab;
  // sair de uma eventual sala de troca com amigo aberta ao trocar de aba
  ftCloseRoom(true);
  renderTradesScreen();
}

/* =========================================================
   1) TROCA DO SISTEMA
   ========================================================= */
let _sysOffered = [];       // [player, ...] jogadores oferecidos (únicos por id)
let _sysCandidates = [];    // [player, ...] opções que o sistema encontrou
let _sysSelectedTarget = null;

function sysEligiblePlayers(){
  const seen = new Set();
  return (STATE.ownedPlayers || []).filter(p=>{
    if(!TRADE_ELIGIBLE_TIERS.includes(p.tier)) return false;
    if(seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
}

function sysToggleOffer(playerId){
  const idx = _sysOffered.findIndex(p=>p.id === playerId);
  if(idx >= 0){
    _sysOffered.splice(idx, 1);
  }else{
    if(_sysOffered.length >= TRADE_MAX_OFFER){ toast(`Máximo de ${TRADE_MAX_OFFER} jogadores por troca.`, ""); return; }
    const p = sysEligiblePlayers().find(x=>x.id === playerId);
    if(p) _sysOffered.push(p);
  }
  _sysCandidates = [];
  _sysSelectedTarget = null;
  renderSystemTrade();
}

function sysFindCandidates(){
  if(systemTradesLeft() <= 0){ toast("Você já usou suas trocas do sistema nessa temporada.", ""); return; }
  if(!_sysOffered.length){ toast("Selecione ao menos 1 jogador para oferecer.", ""); return; }

  const totalValue = _sysOffered.reduce((s,p)=>s + tradeValue(p), 0);
  const hasLendario = _sysOffered.some(p=>p.tier === "lendario");
  const allowedTiers = hasLendario ? ["lendario"] : ["destaque","lendario"];
  const offeredIds = new Set(_sysOffered.map(p=>p.id));

  const pool = (GAME_DATA.players || []).filter(p=>
    allowedTiers.includes(p.tier) &&
    !offeredIds.has(p.id) &&
    !isOwned(p.id) &&
    Math.abs(tradeValue(p) - totalValue) <= totalValue * TRADE_VALUE_BAND
  );
  pool.sort((a,b)=> Math.abs(tradeValue(a)-totalValue) - Math.abs(tradeValue(b)-totalValue));
  _sysCandidates = pool.slice(0, 6);
  _sysSelectedTarget = null;

  if(!_sysCandidates.length){
    toast("Nenhum jogador disponível nessa faixa de valor agora. Tente outra combinação.", "");
  }
  renderSystemTrade();
}

function sysSelectTarget(playerId){
  _sysSelectedTarget = _sysCandidates.find(p=>p.id === playerId) || null;
  renderSystemTrade();
}

function sysConfirmTrade(){
  if(!_sysSelectedTarget || !_sysOffered.length) return;
  if(systemTradesLeft() <= 0){ toast("Você já usou suas trocas do sistema nessa temporada.", ""); return; }

  const target = _sysSelectedTarget;
  const fee = Math.max(1, Math.round(tradeValue(target) * TRADE_FEE_PCT));
  if(!spendCurrency(fee, 0)){ toast(`GP insuficiente para a taxa da troca (◆ ${fee}).`, ""); return; }

  _sysOffered.forEach(p=>{
    const idIdx = STATE.ownedIds.indexOf(p.id);
    if(idIdx >= 0) STATE.ownedIds.splice(idIdx, 1);
    const pIdx = STATE.ownedPlayers.findIndex(x=>x.id === p.id);
    if(pIdx >= 0) STATE.ownedPlayers.splice(pIdx, 1);
  });
  ownPlayer(target);

  ensureTradeState();
  STATE.trades.systemUsed += 1;
  persist();

  toast(`🔁 Troca concluída! Você recebeu ${target.name}.`, "success");
  _sysOffered = []; _sysCandidates = []; _sysSelectedTarget = null;
  renderTradesScreen();
  syncTopBadges();
}

function renderSystemTrade(){
  const root = document.getElementById("tradesRoot");
  if(!root || _tradesActiveTab !== "system") return;

  const eligible = sysEligiblePlayers();
  const totalValue = _sysOffered.reduce((s,p)=>s + tradeValue(p), 0);
  const left = systemTradesLeft();

  root.innerHTML = `
    <div class="trade-card">
      <p class="page-sub" style="margin-top:0;">
        Ofereça até ${TRADE_MAX_OFFER} jogadores <strong>Destaque</strong> ou <strong>Lendário</strong> e o sistema
        mostra opções de troca com valor parecido. Trocas restam nessa temporada:
        <strong>${left}/${TRADE_SEASON_LIMIT}</strong>.
      </p>

      <div class="trade-offer-row">
        <div class="trade-offer-box">
          <div class="trade-offer-title">Sua oferta <span class="trade-offer-value">Valor: ${totalValue}</span></div>
          <div class="trade-offer-grid" id="sysOfferGrid">
            ${_sysOffered.map(p=>`
              <div class="trade-mini-card" onclick="sysToggleOffer('${p.id}')" title="Remover ${p.name}">
                <img src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='assets/players/default.png';">
                <span class="trade-mini-ovr">${p.overall}</span>
                <span class="trade-mini-remove">✕</span>
              </div>`).join("")}
            ${_sysOffered.length < TRADE_MAX_OFFER ? `<button class="trade-add-btn" id="btnSysAddPlayer">+</button>` : ""}
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-block" style="margin-top:12px;" id="btnSysFindCandidates" ${!_sysOffered.length ? "disabled" : ""}>
        🔍 Buscar jogadores disponíveis
      </button>

      ${_sysCandidates.length ? `
        <div class="trade-candidates">
          <div class="trade-offer-title" style="margin-top:16px;">Opções encontradas</div>
          <div class="trade-offer-grid">
            ${_sysCandidates.map(p=>`
              <div class="trade-mini-card ${_sysSelectedTarget && _sysSelectedTarget.id===p.id ? "selected" : ""}" onclick="sysSelectTarget('${p.id}')" title="${p.name} — Valor ${tradeValue(p)}">
                <img src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='assets/players/default.png';">
                <span class="trade-mini-ovr">${p.overall}</span>
              </div>`).join("")}
          </div>
        </div>` : ""}

      ${_sysSelectedTarget ? `
        <div class="trade-confirm-panel">
          <div class="trade-confirm-row">
            <div class="trade-confirm-side">
              ${_sysOffered.map(p=>renderPlayerCard(p)).join("")}
            </div>
            <div class="trade-confirm-arrow">⇄</div>
            <div class="trade-confirm-side">
              ${renderPlayerCard(_sysSelectedTarget)}
            </div>
          </div>
          <p class="page-sub" style="text-align:center;">Taxa da troca: ◆ ${Math.max(1, Math.round(tradeValue(_sysSelectedTarget) * TRADE_FEE_PCT))} GP</p>
          <button class="btn btn-gold btn-block" onclick="sysConfirmTrade()">🔁 Confirmar troca</button>
        </div>` : ""}
    </div>
  `;

  const addBtn = document.getElementById("btnSysAddPlayer");
  if(addBtn) addBtn.onclick = ()=> tdOpenPicker({
    title: "Oferecer jogador (Destaque / Lendário)",
    players: eligible.filter(p=>!_sysOffered.some(o=>o.id===p.id)),
    multi: true,
    onConfirm: (picked)=>{
      picked.forEach(p=>{
        if(_sysOffered.length < TRADE_MAX_OFFER && !_sysOffered.some(o=>o.id===p.id)) _sysOffered.push(p);
      });
      _sysCandidates = []; _sysSelectedTarget = null;
      renderSystemTrade();
    }
  });

  const findBtn = document.getElementById("btnSysFindCandidates");
  if(findBtn) findBtn.onclick = sysFindCandidates;
}

/* =========================================================
   SELETOR DE JOGADORES (modal reaproveitado pelos dois sistemas)
   ========================================================= */
let _pickerMulti = false;
let _pickerSelected = [];
let _pickerConfirm = null;

function tdOpenPicker({ title, players, multi, onConfirm }){
  _pickerMulti = !!multi;
  _pickerSelected = [];
  _pickerConfirm = onConfirm;

  document.getElementById("tradePickerTitle").textContent = title || "Selecionar jogadores";
  const grid = document.getElementById("tradePickerGrid");
  grid.innerHTML = (players || []).map(p=>`
    <div class="p-card selectable rarity-${p.rarity}" data-pid="${p.id}" onclick="tdPickerToggle('${p.id}')">
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
    </div>`).join("") || `<p class="page-sub">Nenhum jogador disponível.</p>`;

  document.getElementById("tradePickerCount").textContent = "0";
  document.getElementById("tradePickerOverlay").classList.remove("hidden");
}

function tdPickerToggle(playerId){
  const el = document.querySelector(`#tradePickerGrid .p-card[data-pid="${playerId}"]`);
  if(!el) return;
  const idx = _pickerSelected.indexOf(playerId);
  if(idx >= 0){
    _pickerSelected.splice(idx, 1);
    el.classList.remove("selected");
  }else{
    if(!_pickerMulti){
      _pickerSelected = [];
      document.querySelectorAll("#tradePickerGrid .p-card.selected").forEach(e=>e.classList.remove("selected"));
    }
    _pickerSelected.push(playerId);
    el.classList.add("selected");
  }
  document.getElementById("tradePickerCount").textContent = _pickerSelected.length;
}

function tdClosePicker(){
  document.getElementById("tradePickerOverlay").classList.add("hidden");
  _pickerConfirm = null;
}

document.getElementById("btnCloseTradePicker").onclick = tdClosePicker;
document.getElementById("btnConfirmTradePicker").onclick = ()=>{
  if(_pickerConfirm){
    const all = [...sysEligiblePlayers(), ...(STATE.ownedPlayers||[])];
    const picked = _pickerSelected.map(id => all.find(p=>p.id===id)).filter(Boolean);
    _pickerConfirm(picked);
  }
  tdClosePicker();
};

/* =========================================================
   2) TROCA COM AMIGOS (Firestore + chat)
   ========================================================= */
let _ftRoomCode = null;
let _ftRoomData = null;
let _ftRoomUnsub = null;
let _ftIncomingInvite = null;

async function renderFriendTrade(){
  const root = document.getElementById("tradesRoot");
  if(!root || _tradesActiveTab !== "friend") return;

  if(_ftRoomCode){ renderFtRoom(_ftRoomCode, _ftRoomData); return; }

  ensureLocalPvpState();
  root.innerHTML = `<p class="page-sub" style="margin-top:0;">Carregando...</p>`;

  _ftIncomingInvite = await ftCheckIncomingInvite();
  const myTrades = await ftListMyOpenTrades();

  root.innerHTML = `
    <div class="trade-card">
      <p class="page-sub" style="margin-top:0;">
        Escolha QUALQUER jogador do seu elenco para negociar diretamente com um amigo da sua lista
        (mesma lista do "Jogo c/ amigo"). Combine tudo pelo chat da sala de troca.
      </p>

      ${_ftIncomingInvite ? `
        <div class="pvp-invite-text" style="margin-bottom:12px;">
          ${_ftIncomingInvite.fromName} quer trocar jogadores com você.
          <div style="display:flex; gap:8px; margin-top:8px;">
            <button class="btn btn-primary btn-sm" id="btnFtAcceptInvite">Aceitar</button>
            <button class="btn btn-ghost btn-sm" id="btnFtDeclineInvite">Recusar</button>
          </div>
        </div>` : ""}

      ${myTrades.length ? `
        <div class="trade-offer-title">Trocas em andamento</div>
        <div class="ft-ongoing-list">
          ${myTrades.map(t=>`
            <button class="ft-ongoing-item" onclick="ftOpenRoom('${t.code}')">
              <span>${t.fromId === getPlayerId() ? t.toName : t.fromName}</span>
              <span class="ft-ongoing-arrow">Abrir ›</span>
            </button>`).join("")}
        </div>` : ""}

      <div class="trade-offer-title" style="margin-top:16px;">Seus amigos</div>
      <div id="ftFriendList"></div>
    </div>
  `;

  if(_ftIncomingInvite){
    document.getElementById("btnFtAcceptInvite").onclick = ()=> ftAcceptInvite(_ftIncomingInvite);
    document.getElementById("btnFtDeclineInvite").onclick = ftDeclineInvite;
  }

  const listEl = document.getElementById("ftFriendList");
  if(!STATE.pvp.friends.length){
    listEl.innerHTML = `<p class="page-sub" style="margin:0;">Você ainda não tem amigos adicionados. Adicione em "Jogo c/ amigo" primeiro.</p>`;
  }else{
    listEl.innerHTML = STATE.pvp.friends.map(f=>`
      <div class="pvp-friend-row">
        <div class="pvp-friend-info">
          <span class="pvp-friend-name">${f.nickname}</span>
          <span class="pvp-friend-id">${f.id}</span>
        </div>
        <div class="pvp-friend-actions">
          <button class="btn btn-primary btn-sm" data-trade-friend="${f.id}">Nova troca</button>
        </div>
      </div>`).join("");
    listEl.querySelectorAll("[data-trade-friend]").forEach(btn=>{
      btn.onclick = ()=>{
        const friend = STATE.pvp.friends.find(f=>f.id === btn.dataset.tradeFriend);
        if(friend) ftStartTrade(friend);
      };
    });
  }
}

async function ftListMyOpenTrades(){
  const db = await ensurePvpDb();
  if(!db) return [];
  try{
    const me = getPlayerId();
    const [asFrom, asTo] = await Promise.all([
      db.collection("playerTrades").where("fromId", "==", me).where("status", "==", "open").get(),
      db.collection("playerTrades").where("toId", "==", me).where("status", "==", "open").get(),
    ]);
    const out = [];
    asFrom.forEach(d=> out.push(d.data()));
    asTo.forEach(d=> out.push(d.data()));
    return out;
  }catch(e){ return []; }
}

async function ftCheckIncomingInvite(){
  const db = await ensurePvpDb();
  if(!db) return null;
  try{
    const doc = await db.collection("tradeInvites").doc(getPlayerId()).get();
    const data = doc.exists ? doc.data() : null;
    return (data && data.pending) ? data.pending : null;
  }catch(e){ return null; }
}

async function ftClearIncomingInvite(){
  const db = await ensurePvpDb();
  if(!db) return;
  try{ await db.collection("tradeInvites").doc(getPlayerId()).set({ pending: null }, { merge: true }); }
  catch(e){ /* silencioso */ }
}

async function ftAcceptInvite(invite){
  await ftClearIncomingInvite();
  ftOpenRoom(invite.code);
}

async function ftDeclineInvite(){
  await ftClearIncomingInvite();
  renderFriendTrade();
}

async function ftStartTrade(friend){
  const db = await ensurePvpDb();
  if(!db){ toast("Sem conexão com o servidor agora. Tente de novo.", ""); return; }
  const code = pvpGenerateRoomCode();
  try{
    await db.collection("playerTrades").doc(code).set({
      code,
      fromId: getPlayerId(), fromName: myNickname(),
      toId: friend.id, toName: friend.nickname,
      offerFrom: [], offerTo: [],
      confirmedFrom: false, confirmedTo: false,
      status: "open",
      chat: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await db.collection("tradeInvites").doc(friend.id).set({
      pending: { code, fromId: getPlayerId(), fromName: myNickname(), createdAt: Date.now() },
    });
  }catch(e){
    toast("Não deu pra iniciar a troca agora. Tente de novo.", "");
    return;
  }
  ftOpenRoom(code);
}

async function ftOpenRoom(code){
  const db = await ensurePvpDb();
  if(!db){ toast("Sem conexão com o servidor agora.", ""); return; }
  if(_ftRoomUnsub){ _ftRoomUnsub(); _ftRoomUnsub = null; }
  _ftRoomCode = code;
  _ftRoomData = null;
  renderFtRoom(code, null);

  _ftRoomUnsub = db.collection("playerTrades").doc(code).onSnapshot(snap=>{
    if(!snap.exists) return;
    const data = snap.data();
    _ftRoomData = data;
    renderFtRoom(code, data);
    if(data.status === "open") ftMaybeFinalize(db, code, data);
    if(data.status === "completed") ftApplyLocalResult(code, data);
  }, err=>{
    console.warn("[trades] falha ao sincronizar sala:", err.message);
  });
}

function ftCloseRoom(silent){
  if(_ftRoomUnsub){ _ftRoomUnsub(); _ftRoomUnsub = null; }
  _ftRoomCode = null;
  _ftRoomData = null;
  if(!silent) renderFriendTrade();
}

async function ftMaybeFinalize(db, code, data){
  if(data.status !== "open" || !data.confirmedFrom || !data.confirmedTo) return;
  try{
    await db.runTransaction(async (tx)=>{
      const ref = db.collection("playerTrades").doc(code);
      const snap = await tx.get(ref);
      const d = snap.data();
      if(!d || d.status !== "open" || !d.confirmedFrom || !d.confirmedTo) return;
      tx.update(ref, { status: "completed", completedAt: firebase.firestore.FieldValue.serverTimestamp() });
    });
  }catch(e){ /* a outra ponta provavelmente já finalizou — sem problema */ }
}

function ftApplyLocalResult(code, data){
  ensureTradeState();
  if(STATE.trades.appliedCodes.includes(code)) return;

  const amFrom = data.fromId === getPlayerId();
  const myOffer = amFrom ? (data.offerFrom || []) : (data.offerTo || []);
  const theirOffer = amFrom ? (data.offerTo || []) : (data.offerFrom || []);

  myOffer.forEach(p=>{
    const idIdx = STATE.ownedIds.indexOf(p.id);
    if(idIdx >= 0) STATE.ownedIds.splice(idIdx, 1);
    const pIdx = STATE.ownedPlayers.findIndex(x=>x.id === p.id);
    if(pIdx >= 0) STATE.ownedPlayers.splice(pIdx, 1);
  });
  theirOffer.forEach(p=>{
    const full = getPlayer(p.id);
    if(full) ownPlayer(full);
  });

  STATE.trades.appliedCodes.push(code);
  persist();
  toast(`🔁 Troca com ${amFrom ? data.toName : data.fromName} concluída!`, "success");
  syncTopBadges();
}

async function ftSetOffer(code, isFrom, offerArray){
  const db = await ensurePvpDb();
  if(!db) return;
  const field = isFrom ? "offerFrom" : "offerTo";
  const confirmField = isFrom ? "confirmedFrom" : "confirmedTo";
  try{
    await db.collection("playerTrades").doc(code).update({ [field]: offerArray, [confirmField]: false });
  }catch(e){ toast("Não deu pra atualizar a oferta agora.", ""); }
}

async function ftSetConfirmed(code, isFrom, value){
  const db = await ensurePvpDb();
  if(!db) return;
  const field = isFrom ? "confirmedFrom" : "confirmedTo";
  try{ await db.collection("playerTrades").doc(code).update({ [field]: value }); }
  catch(e){ toast("Não deu pra confirmar agora.", ""); }
}

async function ftCancelTrade(code){
  const db = await ensurePvpDb();
  if(!db) return;
  try{ await db.collection("playerTrades").doc(code).update({ status: "cancelled" }); }
  catch(e){ /* silencioso */ }
  ftCloseRoom();
}

async function ftSendChat(code){
  const input = document.getElementById("ftChatInput");
  if(!input) return;
  const text = (input.value || "").trim().slice(0, 200);
  if(!text) return;
  const db = await ensurePvpDb();
  if(!db) return;
  input.value = "";
  try{
    await db.collection("playerTrades").doc(code).update({
      chat: firebase.firestore.FieldValue.arrayUnion({ from: getPlayerId(), name: myNickname(), text, ts: Date.now() }),
    });
  }catch(e){ toast("Mensagem não enviada. Tente de novo.", ""); }
}

function ftPlayerChip(p, removable, onRemove){
  return `<div class="trade-mini-card" ${removable ? `onclick="${onRemove}"` : ""} title="${p.name}${removable ? " — remover" : ""}">
    <img src="${p.image}" alt="${p.name}" onerror="this.onerror=null;this.src='assets/players/default.png';">
    <span class="trade-mini-ovr">${p.overall}</span>
    ${removable ? `<span class="trade-mini-remove">✕</span>` : ""}
  </div>`;
}

function renderFtRoom(code, data){
  const root = document.getElementById("tradesRoot");
  if(!root || _tradesActiveTab !== "friend" || _ftRoomCode !== code) return;

  if(!data){
    root.innerHTML = `<p class="page-sub" style="margin-top:0;">Conectando à sala de troca...</p>`;
    return;
  }
  if(data.status === "cancelled"){
    root.innerHTML = `
      <div class="trade-card">
        <p class="page-sub" style="margin-top:0;">Essa troca foi cancelada.</p>
        <button class="btn btn-block" onclick="ftCloseRoom()">‹ Voltar</button>
      </div>`;
    return;
  }

  const myId = getPlayerId();
  const amFrom = data.fromId === myId;
  const myOffer = amFrom ? data.offerFrom : data.offerTo;
  const theirOffer = amFrom ? data.offerTo : data.offerFrom;
  const myConfirmed = amFrom ? data.confirmedFrom : data.confirmedTo;
  const theirConfirmed = amFrom ? data.confirmedTo : data.confirmedFrom;
  const otherName = amFrom ? data.toName : data.fromName;
  const myValue = (myOffer||[]).reduce((s,p)=>s+tradeValue(p),0);
  const theirValue = (theirOffer||[]).reduce((s,p)=>s+tradeValue(p),0);
  const completed = data.status === "completed";

  root.innerHTML = `
    <div class="trade-card">
      <div class="ft-room-header">
        <button class="btn btn-ghost btn-sm" onclick="ftCloseRoom()">‹ Voltar</button>
        <div class="ft-room-title">Troca com ${otherName}</div>
        ${!completed ? `<button class="btn btn-ghost btn-sm" onclick="ftCancelTrade('${code}')">Cancelar</button>` : ""}
      </div>

      <div class="ft-offer-cols">
        <div class="trade-offer-box">
          <div class="trade-offer-title">Sua oferta <span class="trade-offer-value">Valor: ${myValue}</span></div>
          <div class="trade-offer-grid" id="ftMyOfferGrid">
            ${(myOffer||[]).map(p=>ftPlayerChip(p, !completed, `ftRemoveMine('${p.id}')`)).join("")}
            ${!completed && (myOffer||[]).length < TRADE_MAX_OFFER ? `<button class="trade-add-btn" id="btnFtAddPlayer">+</button>` : ""}
          </div>
          ${myConfirmed ? `<div class="mp-preview-status claimed" style="margin-top:8px;">✓ Você confirmou</div>` : ""}
        </div>
        <div class="ft-offer-arrow">⇄</div>
        <div class="trade-offer-box">
          <div class="trade-offer-title">Oferta de ${otherName} <span class="trade-offer-value">Valor: ${theirValue}</span></div>
          <div class="trade-offer-grid">
            ${(theirOffer||[]).length ? (theirOffer||[]).map(p=>ftPlayerChip(p,false)).join("") : `<p class="page-sub" style="margin:0;">Nada oferecido ainda.</p>`}
          </div>
          ${theirConfirmed ? `<div class="mp-preview-status claimed" style="margin-top:8px;">✓ ${otherName} confirmou</div>` : ""}
        </div>
      </div>

      ${completed ? `
        <div class="mp-preview-status claimed" style="display:block; text-align:center; margin-top:12px;">🎉 Troca concluída!</div>
      ` : `
        <button class="btn ${myConfirmed ? "btn-disabled-owned" : "btn-gold"} btn-block" style="margin-top:12px;" onclick="ftSetConfirmed('${code}', ${amFrom}, ${!myConfirmed})">
          ${myConfirmed ? "✓ Confirmado — toque para desfazer" : "🔁 Confirmar minha parte"}
        </button>
      `}

      <div class="ft-chat">
        <div class="trade-offer-title">Chat</div>
        <div class="ft-chat-list" id="ftChatList">
          ${(data.chat||[]).map(m=>`
            <div class="ft-chat-msg ${m.from===myId?"me":""}">
              <span class="ft-chat-name">${m.name || "?"}</span>
              <span class="ft-chat-text">${(m.text||"").replace(/</g,"&lt;")}</span>
            </div>`).join("") || `<p class="page-sub" style="margin:0;">Combine os detalhes da troca por aqui.</p>`}
        </div>
        ${!completed ? `
          <div class="ft-chat-input-row">
            <input type="text" id="ftChatInput" maxlength="200" placeholder="Escreva uma mensagem...">
            <button class="btn btn-primary btn-sm" onclick="ftSendChat('${code}')">Enviar</button>
          </div>` : ""}
      </div>
    </div>
  `;

  const chatList = document.getElementById("ftChatList");
  if(chatList) chatList.scrollTop = chatList.scrollHeight;

  const chatInput = document.getElementById("ftChatInput");
  if(chatInput) chatInput.onkeydown = (e)=>{ if(e.key === "Enter") ftSendChat(code); };

  const addBtn = document.getElementById("btnFtAddPlayer");
  if(addBtn) addBtn.onclick = ()=>{
    const offeredIds = new Set((myOffer||[]).map(p=>p.id));
    const uniq = []; const seen = new Set();
    (STATE.ownedPlayers||[]).forEach(p=>{
      if(offeredIds.has(p.id) || seen.has(p.id)) return;
      seen.add(p.id);
      uniq.push(p);
    });
    tdOpenPicker({
      title: "Oferecer jogador",
      players: uniq,
      multi: true,
      onConfirm: (picked)=>{
        const newOffer = [...(myOffer||[]), ...picked.filter(p=>!(myOffer||[]).some(o=>o.id===p.id))]
          .slice(0, TRADE_MAX_OFFER)
          .map(p=>({ id:p.id, name:p.name, overall:p.overall, tier:p.tier, image:p.image, rarity:p.rarity, rarityLabel:p.rarityLabel, position:p.position, club:p.club, nationalityFlag:p.nationalityFlag }));
        ftSetOffer(code, amFrom, newOffer);
      }
    });
  };
}

function ftRemoveMine(playerId){
  if(!_ftRoomData || !_ftRoomCode) return;
  const amFrom = _ftRoomData.fromId === getPlayerId();
  const myOffer = (amFrom ? _ftRoomData.offerFrom : _ftRoomData.offerTo) || [];
  const newOffer = myOffer.filter(p=>p.id !== playerId);
  ftSetOffer(_ftRoomCode, amFrom, newOffer);
}
