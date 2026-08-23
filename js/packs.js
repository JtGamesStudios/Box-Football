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

/* ---------- Correção retroativa pra quem comprou ANTES da insígnia existir ----------
   Se um pacote com badgeId já foi comprado (packPurchases > 0) mas a
   insígnia ainda não está em STATE.profileBadges, concede ela agora.
   Precisa disso porque stockPerUser normalmente é 1 — quem já comprou
   nunca mais vai passar pelo buyPack() de novo, então sem isso ficaria
   pra sempre sem a insígnia que passou a valer depois da compra dele.
   Roda uma vez no boot (idempotente: não duplica se já tem). */
function backfillPackBadges(){
  let changed = false;
  const newlyGranted = [];
  (GAME_DATA.packs || []).forEach(pack=>{
    if(!pack.badgeId) return;
    if(packPurchaseCount(pack.id) <= 0) return;
    STATE.profileBadges = STATE.profileBadges || [];
    if(!STATE.profileBadges.some(b => b.id === pack.badgeId)){
      const badge = { id: pack.badgeId, icon: pack.badgeIcon || "🎖️", label: pack.cosmeticLabel || pack.title };
      STATE.profileBadges.push(badge);
      newlyGranted.push(badge);
      changed = true;
    }
  });
  if(changed){
    persist();
    if(typeof syncRankingToFirebase === "function") syncRankingToFirebase();
    // Avisa a pessoa de verdade — sem isso, ela só ficaria sabendo se
    // abrisse Configurações por acaso. Um toast por insígnia nova,
    // com um pequeno atraso pro boot terminar de desenhar a tela.
    setTimeout(()=>{
      newlyGranted.forEach(b=>{
        if(typeof toast === "function"){
          toast(`${b.icon} Nova insígnia conquistada: "${b.label}"! Veja em Configurações.`, "success");
        }
      });
    }, 1200);
  }
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
      <div class="pack-header" ${pack.banner ? `style="background-image:url('${pack.banner}')"` : ""}>
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

/* ---------- Insígnias de perfil ----------
   Por enquanto só os Pacotes concedem insígnia (campo "badgeId" no
   pack), mas STATE.profileBadges foi feito genérico de propósito —
   dá pra qualquer outro sistema (Card Battle, eventos, etc.) chamar
   STATE.profileBadges.push({id,icon,label}) no futuro sem mudar nada
   aqui. Aparecem em Configurações e (se sincronizado) no Ranking
   Global, junto do nome do jogador. */
function renderProfileBadges(){
  const wrap = document.getElementById("profileBadgesGrid");
  if(!wrap) return;
  const badges = STATE.profileBadges || [];
  if(!badges.length){
    wrap.innerHTML = `<p class="page-sub" style="margin:0;">Nenhuma insígnia ainda — compre um Pacote especial pra conquistar a primeira.</p>`;
    return;
  }
  wrap.innerHTML = badges.map(b => `
    <div class="badge-chip" title="${b.label}">
      <span class="badge-chip-icon">${b.icon}</span>
      <span class="badge-chip-label">${b.label}</span>
    </div>`).join("");
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

  if(pack.badgeId){
    STATE.profileBadges = STATE.profileBadges || [];
    if(!STATE.profileBadges.some(b => b.id === pack.badgeId)){
      STATE.profileBadges.push({ id: pack.badgeId, icon: pack.badgeIcon || "🎖️", label: pack.cosmeticLabel || pack.title });
    }
  }

  persist();
  if(typeof refreshWalletUI === "function") refreshWalletUI();
  if(typeof syncRankingToFirebase === "function") syncRankingToFirebase();
  if(typeof renderProfileBadges === "function") renderProfileBadges();
  toast(`Pacote "${pack.title}" resgatado! ${1 + squad.length} cartas adicionadas ao seu elenco.`, "success");
  renderPacotesScreen();
}
