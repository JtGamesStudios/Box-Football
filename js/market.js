/* =========================================================
   MERCADO DE TRANSFERÊNCIAS — substitui a "Troca do Sistema".
   20 jogadores por GP, sorteados de novo a cada 2h, em loop
   contínuo (nunca para). Cada slot é uma unidade só: quando
   alguém compra, aquele slot fica "Vendido" até a próxima
   rodada de 2h.

   Fica na mesma aba/raiz que já existia (#tradesRoot) — troca
   feita em js/trades.js, ver LEIA-ME.
   ========================================================= */

const MARKET_REFRESH_MS = 2 * 60 * 60 * 1000; // 2 horas
const MARKET_SLOT_COUNT = 20;

const MARKET_TIER_MULT = {
  normal: 1, destaque: 1.6, lendario: 3.2, iconic: 6,
  epico: 8, bigtime: 12,
};
const MARKET_PRICE_BASE = 9; // constante de ajuste — sobe/desce isso pra calibrar o preço geral do mercado

// pesos de sorteio por tier: a maioria do mercado é gente comum,
// craque aparece pouco — mesma filosofia das boxes
const MARKET_TIER_WEIGHT = {
  normal: 70, destaque: 18, lendario: 8, iconic: 3, epico: 1, bigtime: 0.5,
};

function ensureMarketState(){
  if(!STATE.market || !Array.isArray(STATE.market.slots)){
    STATE.market = { generatedAt: 0, nextRefreshAt: 0, slots: [] };
  }
  if(Date.now() >= STATE.market.nextRefreshAt){
    regenerateMarket();
  }
  return STATE.market;
}

function marketWeightedPickPool(){
  const pool = [];
  (GAME_DATA.players || []).forEach(p=>{
    const w = MARKET_TIER_WEIGHT[p.tier] ?? 1;
    if(w > 0) pool.push({ p, w });
  });
  return pool;
}

function marketPickOne(pool){
  const total = pool.reduce((a,x)=>a+x.w, 0);
  let r = Math.random() * total;
  for(const item of pool){
    r -= item.w;
    if(r <= 0) return item.p;
  }
  return pool[pool.length-1].p;
}

function marketPrice(p){
  const mult = MARKET_TIER_MULT[p.tier] || 1;
  const jitter = 0.85 + Math.random() * 0.3; // ±15% pra não ficar sempre o mesmo preço pro mesmo jogador
  return Math.round((p.overall || 0) * mult * MARKET_PRICE_BASE * jitter);
}

function regenerateMarket(){
  const pool = marketWeightedPickPool();
  const slots = [];
  const usedIds = new Set();
  let guard = 0;
  while(slots.length < MARKET_SLOT_COUNT && guard < 2000){
    guard++;
    const p = marketPickOne(pool);
    if(!p || usedIds.has(p.id)) continue; // sem repetir jogador na mesma rodada
    usedIds.add(p.id);
    slots.push({ slotId: "m" + slots.length, playerId: p.id, priceGP: marketPrice(p), sold: false });
  }
  STATE.market = {
    generatedAt: Date.now(),
    nextRefreshAt: Date.now() + MARKET_REFRESH_MS,
    slots,
  };
  persist();
}

function buyMarketSlot(slotId){
  const market = ensureMarketState();
  const slot = market.slots.find(s=>s.slotId === slotId);
  if(!slot || slot.sold) return;
  const player = getPlayer(slot.playerId);
  if(!player) return;

  if(!spendCurrency(slot.priceGP, 0)){
    toast("GP insuficiente pra essa contratação.", "");
    return;
  }
  ownPlayer(player);
  slot.sold = true;
  persist();
  toast(`${player.name} contratado!`, "success");
  renderTransferMarket();
}

function marketCountdownLabel(){
  const ms = Math.max(0, STATE.market.nextRefreshAt - Date.now());
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}min`;
}

let _marketTickTimer = null;

function renderTransferMarket(){
  const root = document.getElementById("tradesRoot");
  if(!root) return;
  const market = ensureMarketState();

  root.innerHTML = `
    <div class="market-header">
      <h3>🏪 Mercado de Transferências</h3>
      <p class="market-sub">Nova leva de jogadores a cada 2 horas. Próxima rodada em <b id="marketCountdown">${marketCountdownLabel()}</b>.</p>
    </div>
    <div class="market-grid" id="marketGrid">
      ${market.slots.map(slot=>{
        const p = getPlayer(slot.playerId);
        if(!p) return "";
        return `
          <div class="market-card ${slot.sold ? "sold" : ""}">
            <img src="${p.image}" alt="">
            <div class="market-card-name">${p.name}</div>
            <div class="market-card-ovr">OVR ${p.overall}</div>
            ${slot.sold
              ? `<button class="market-buy" disabled>Vendido</button>`
              : `<button class="market-buy" onclick="buyMarketSlot('${slot.slotId}')">${slot.priceGP.toLocaleString("pt-BR")} GP</button>`
            }
          </div>`;
      }).join("")}
    </div>`;

  if(!document.getElementById("marketStyles")){
    const style = document.createElement("style");
    style.id = "marketStyles";
    style.textContent = `
    .market-header{margin-bottom:12px;}
    .market-sub{font-size:12px;color:#9ab;}
    .market-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(88px,1fr));gap:8px;}
    .market-card{background:#1c2634;border-radius:10px;padding:6px;text-align:center;}
    .market-card.sold{opacity:.45;}
    .market-card img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;}
    .market-card-name{font-size:11px;font-weight:600;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
    .market-card-ovr{font-size:10px;color:#9ab;}
    .market-buy{margin-top:4px;width:100%;background:#ffd23f;color:#111;border:none;padding:5px 0;border-radius:12px;font-size:11px;font-weight:700;cursor:pointer;}
    .market-buy:disabled{background:#333;color:#888;cursor:default;}
    `;
    document.head.appendChild(style);
  }

  clearInterval(_marketTickTimer);
  _marketTickTimer = setInterval(()=>{
    // se passou das 2h enquanto a tela tava aberta, gera rodada nova sozinho (loop contínuo)
    if(Date.now() >= STATE.market.nextRefreshAt){
      renderTransferMarket();
      return;
    }
    const el = document.getElementById("marketCountdown");
    if(el) el.textContent = marketCountdownLabel();
  }, 1000);
}
