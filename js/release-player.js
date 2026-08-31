/* =========================================================
   LIBERAR JOGADOR — clique na carta abre um submenu (igual a
   referência que você mandou: card grande + lista de opções à
   direita). Aqui só tem UMA opção na lista: Liberar. As outras
   (Player Details, Positions, Contract Renewal, Use Item) da
   referência NÃO entram por enquanto, como você pediu.

   Fluxo: openReleasePlayerScreen() -> grade de cards -> clicar
   num card -> abre o submenu daquele jogador -> clicar em
   "Liberar" -> confirmação -> credita GP e some 1 cópia.
   ========================================================= */

const RELEASE_TIER_MULT = {
  normal: 1, destaque: 1.6, lendario: 3.2, iconic: 6,
  epico: 8, bigtime: 12,
};
const RELEASE_BASE = 6; // constante de ajuste do quanto de GP cada liberação dá

function releaseValue(p){
  if(!p) return 0;
  const mult = RELEASE_TIER_MULT[p.tier] || 1;
  return Math.round((p.overall || 0) * mult * RELEASE_BASE);
}

function releaseGroupedOwned(){
  const groups = {};
  (STATE.ownedPlayers || []).forEach(p=>{
    if(!groups[p.id]) groups[p.id] = { player: p, count: 0 };
    groups[p.id].count++;
  });
  return Object.values(groups).sort((a,b)=> b.player.overall - a.player.overall);
}

function releaseCountOwned(playerId){
  return (STATE.ownedIds || []).filter(id=>id===playerId).length;
}

/* ---------------- injeta estilos 1x ---------------- */
function releaseInjectStylesOnce(){
  if(document.getElementById("releasePlayerStyles")) return;
  const style = document.createElement("style");
  style.id = "releasePlayerStyles";
  style.textContent = `
  .release-overlay{position:fixed;inset:0;background:rgba(4,6,12,.92);z-index:9998;display:flex;align-items:center;justify-content:center;}
  .release-overlay.hidden{display:none;}
  .release-panel{background:#131a26;border-radius:16px;padding:18px;max-width:440px;width:92%;max-height:82vh;overflow-y:auto;color:#fff;}
  .release-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
  .release-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;}
  .release-hint{font-size:12px;color:#9ab;margin-bottom:12px;}
  .release-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(78px,1fr));gap:8px;}
  .release-thumb{position:relative;background:#1c2634;border-radius:10px;padding:4px;cursor:pointer;text-align:center;}
  .release-thumb img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;}
  .release-thumb .rc-count{position:absolute;top:2px;right:2px;background:#ffd23f;color:#111;font-size:10px;font-weight:800;border-radius:10px;padding:1px 5px;}
  .release-thumb .rc-name{font-size:10px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}

  /* submenu (estilo referência) */
  .release-sub-overlay{position:fixed;inset:0;background:rgba(4,6,12,.96);z-index:9999;display:flex;align-items:center;justify-content:center;}
  .release-sub-overlay.hidden{display:none;}
  .release-sub-panel{background:#f4f4f6;border-radius:14px;padding:20px;max-width:480px;width:92%;color:#111;}
  .release-sub-top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #ddd;padding-bottom:10px;margin-bottom:16px;}
  .release-sub-top h2{margin:0;font-size:20px;}
  .release-sub-close{background:none;border:none;font-size:18px;cursor:pointer;color:#111;}
  .release-sub-body{display:flex;gap:20px;align-items:flex-start;}
  .release-sub-card img{width:130px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.25);}
  .release-sub-count{font-size:12px;color:#666;margin-top:8px;text-align:center;}
  .release-sub-list{flex:1;}
  .release-sub-row{display:flex;align-items:center;gap:10px;padding:12px 0;border-bottom:1px solid #e2e2e2;cursor:pointer;color:#2563eb;font-size:16px;font-weight:600;}
  .release-sub-row:last-child{border-bottom:none;}
  `;
  document.head.appendChild(style);
}

/* ---------------- tela de grade (grid de cards) ---------------- */
function openReleasePlayerScreen(){
  releaseInjectStylesOnce();
  if(!document.getElementById("releasePlayerOverlay")){
    const overlay = document.createElement("div");
    overlay.id = "releasePlayerOverlay";
    overlay.className = "release-overlay";
    overlay.innerHTML = `
      <div class="release-panel">
        <div class="release-header">
          <h2>Liberar Jogadores</h2>
          <button class="release-close" onclick="document.getElementById('releasePlayerOverlay').classList.add('hidden')">✕</button>
        </div>
        <p class="release-hint">Toque numa carta pra ver as opções.</p>
        <div id="releasePlayerGrid" class="release-grid"></div>
      </div>`;
    document.body.appendChild(overlay);
  }
  document.getElementById("releasePlayerOverlay").classList.remove("hidden");
  renderReleasePlayerScreen();
}

function renderReleasePlayerScreen(){
  const grid = document.getElementById("releasePlayerGrid");
  if(!grid) return;
  const groups = releaseGroupedOwned();
  if(groups.length === 0){
    grid.innerHTML = `<p class="release-hint">Nenhum jogador no elenco ainda.</p>`;
    return;
  }
  grid.innerHTML = groups.map(g=>`
    <div class="release-thumb" onclick="openPlayerReleaseMenu('${g.player.id}')">
      <span class="rc-count">${g.count}x</span>
      <img src="${g.player.image}" alt="">
      <div class="rc-name">${g.player.name}</div>
    </div>`).join("");
}

/* ---------------- submenu da carta (igual a referência) ---------------- */
function openPlayerReleaseMenu(playerId){
  const player = getPlayer(playerId);
  if(!player) return;
  const count = releaseCountOwned(playerId);
  if(count <= 0){ toast("Você não tem mais cópias desse jogador.", ""); return; }

  let overlay = document.getElementById("releaseSubOverlay");
  if(!overlay){
    overlay = document.createElement("div");
    overlay.id = "releaseSubOverlay";
    overlay.className = "release-sub-overlay";
    document.body.appendChild(overlay);
  }

  const value = releaseValue(player);
  overlay.innerHTML = `
    <div class="release-sub-panel">
      <div class="release-sub-top">
        <h2>${player.name}</h2>
        <button class="release-sub-close" onclick="document.getElementById('releaseSubOverlay').classList.add('hidden')">✕</button>
      </div>
      <div class="release-sub-body">
        <div class="release-sub-card">
          <img src="${player.image}" alt="">
          <div class="release-sub-count">${count}x na coleção</div>
        </div>
        <div class="release-sub-list">
          <div class="release-sub-row" onclick="confirmReleasePlayer('${player.id}')">
            🗑️ Liberar (${value.toLocaleString("pt-BR")} GP)
          </div>
        </div>
      </div>
    </div>`;
  overlay.classList.remove("hidden");
}

function confirmReleasePlayer(playerId){
  const player = getPlayer(playerId);
  if(!player) return;
  const value = releaseValue(player);
  if(!confirm(`Liberar 1x ${player.name} por ${value.toLocaleString("pt-BR")} GP?`)) return;
  releasePlayer(playerId);
  const sub = document.getElementById("releaseSubOverlay");
  if(sub) sub.classList.add("hidden");
}

/* ---------------- execução de fato ---------------- */
function releasePlayer(playerId){
  const idx = STATE.ownedPlayers.findIndex(p=>p.id === playerId);
  if(idx === -1){ toast("Você não tem mais cópias desse jogador.", ""); return; }
  const player = STATE.ownedPlayers[idx];
  const value = releaseValue(player);

  STATE.ownedPlayers.splice(idx, 1);
  const idIdx = STATE.ownedIds.indexOf(playerId);
  if(idIdx !== -1) STATE.ownedIds.splice(idIdx, 1);

  grantCurrency(value, 0, "Liberar jogador");
  persist();
  toast(`+${value.toLocaleString("pt-BR")} GP — ${player.name} liberado.`, "success");
  renderReleasePlayerScreen();
}
