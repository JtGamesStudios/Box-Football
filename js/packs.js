/* =========================================================
   PACOTES — bundles de conteúdo FIXO (sem sorteio). Diferente das
   Boxes normais (gacha), aqui o jogador vê exatamente o que vai
   receber antes de comprar: 1 carta principal (headliner) + um
   "esquadrão" de cartas garantidas + bônus de GP/Moedas + um
   cosmético. Estoque limitado por conta (stockPerUser) e prazo
   (endsAt), igual o pacote de referência que inspirou isso.
   ========================================================= */

function getPackById(id){
  return (GAME_DATA.packs || []).find(p => p.id === id);
}

function isPackLive(pack){
  if(!pack.active) return false;
  if(pack.endsAt && new Date(pack.endsAt).getTime() < Date.now()) return false;
  return true;
}

function packPurchaseCount(packId){
  STATE.packPurchases = STATE.packPurchases || {};
  return STATE.packPurchases[packId] || 0;
}

function packRemaining(pack){
  return Math.max(0, (pack.stockPerUser || 1) - packPurchaseCount(pack.id));
}

function packPlayerById(id){
  return (GAME_DATA.players || []).find(p => p.id === id);
}

function formatPackTimeLeft(endsAt){
  if(!endsAt) return "";
  const diff = new Date(endsAt).getTime() - Date.now();
  if(diff <= 0) return "Encerrado";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  return days > 0 ? `Termina em ${days}d ${hours}h` : `Termina em ${hours}h`;
}

function renderPacotesScreen(){
  const wrap = document.getElementById("pacotesGrid");
  if(!wrap) return;
  const packs = (GAME_DATA.packs || []).filter(isPackLive);

  if(!packs.length){
    wrap.innerHTML = `<div class="empty-state"><div class="big">🎁</div>Nenhum Pacote especial disponível no momento.</div>`;
    return;
  }

  wrap.innerHTML = packs.map(pack=>{
    const headliner = packPlayerById(pack.headlinerPlayerId);
    const squad = (pack.squadPlayerIds || []).map(packPlayerById).filter(Boolean);
    const remaining = packRemaining(pack);
    const soldOut = remaining <= 0;
    const timeLeft = formatPackTimeLeft(pack.endsAt);

    return `
    <div class="pack-card">
      <div class="pack-header">
        <div>
          <div class="pack-subtitle">${pack.subtitle || "Pacote Especial"}</div>
          <div class="pack-title">${pack.title}</div>
        </div>
        ${timeLeft ? `<div class="pack-timeleft">⏱ ${timeLeft}</div>` : ""}
      </div>
      <div class="pack-body">
        <div class="pack-headliner">
          ${headliner ? renderPlayerCard(headliner) : ""}
        </div>
        <div class="pack-squad-wrap">
          <div class="pack-squad-label">Cartas garantidas nesse pacote:</div>
          <div class="pack-squad-grid">
            ${squad.map(p => `<div class="pack-squad-item">${renderPlayerCard(p)}</div>`).join("")}
          </div>
          <div class="pack-bonus-row">
            ${pack.bonusGP ? `<div class="pack-bonus-tile"><span class="pack-bonus-icon">$</span><span>${pack.bonusGP.toLocaleString("pt-BR")} GP</span></div>` : ""}
            ${pack.bonusCoins ? `<div class="pack-bonus-tile"><span class="pack-bonus-icon">◆</span><span>${pack.bonusCoins.toLocaleString("pt-BR")} Moedas</span></div>` : ""}
            ${pack.cosmeticLabel ? `<div class="pack-bonus-tile pack-bonus-cosmetic"><span class="pack-bonus-icon">🎽</span><span>${pack.cosmeticLabel}<br><small>${pack.cosmeticDesc || ""}</small></span></div>` : ""}
          </div>
        </div>
      </div>
      <div class="pack-footer">
        <div class="pack-remaining">${soldOut ? "Esgotado nessa conta" : `Restante${remaining===1?"":"s"}: ${remaining}`}</div>
        <button class="btn btn-primary btn-pack-buy" ${soldOut ? "disabled" : ""} onclick="buyPack('${pack.id}')">
          ◆ ${pack.priceCoins.toLocaleString("pt-BR")}
        </button>
      </div>
    </div>`;
  }).join("");
}

function buyPack(packId){
  const pack = getPackById(packId);
  if(!pack || !isPackLive(pack)) { toast("Esse Pacote não está mais disponível.", ""); return; }
  if(packRemaining(pack) <= 0){ toast("Você já resgatou esse Pacote.", ""); return; }
  if((STATE.currency.coins || 0) < pack.priceCoins){ toast("Moedas insuficientes.", ""); return; }

  STATE.currency.coins -= pack.priceCoins;

  const headliner = packPlayerById(pack.headlinerPlayerId);
  const squad = (pack.squadPlayerIds || []).map(packPlayerById).filter(Boolean);
  if(headliner) ownPlayer(headliner);
  squad.forEach(p => ownPlayer(p));

  if(pack.bonusGP) STATE.currency.gp = (STATE.currency.gp || 0) + pack.bonusGP;
  if(pack.bonusCoins) STATE.currency.coins = (STATE.currency.coins || 0) + pack.bonusCoins;

  STATE.packPurchases = STATE.packPurchases || {};
  STATE.packPurchases[packId] = (STATE.packPurchases[packId] || 0) + 1;

  persist();
  if(typeof refreshWalletUI === "function") refreshWalletUI();
  toast(`Pacote "${pack.title}" resgatado! ${1 + squad.length} cartas adicionadas ao seu elenco.`, "success");
  renderPacotesScreen();
}
