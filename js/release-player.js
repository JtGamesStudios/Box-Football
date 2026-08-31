/* =========================================================
   LIBERAR JOGADOR — troca uma cópia de um jogador por GP.
   Não mexe em nenhuma tela existente: é uma tela nova própria,
   abra chamando openReleasePlayerScreen() de onde quiser (botão
   no elenco, item de menu, etc — ver LEIA-ME pra sugestão de gancho).
   ========================================================= */

const RELEASE_TIER_MULT = {
  normal: 1, destaque: 1.6, lendario: 3.2, iconic: 6,
  epico: 8, bigtime: 12, // as raridades novas valem mais GP quando liberadas
};
const RELEASE_BASE = 6; // constante de ajuste — sobe/desce isso pra calibrar o quanto de GP cada liberação dá

function releaseValue(p){
  if(!p) return 0;
  const mult = RELEASE_TIER_MULT[p.tier] || 1;
  return Math.round((p.overall || 0) * mult * RELEASE_BASE);
}

/* Agrupa STATE.ownedPlayers por id (várias cópias do mesmo jogador
   viram 1 linha com contador), pra não listar 500 cards repetidos. */
function releaseGroupedOwned(){
  const groups = {};
  (STATE.ownedPlayers || []).forEach(p=>{
    if(!groups[p.id]) groups[p.id] = { player: p, count: 0 };
    groups[p.id].count++;
  });
  return Object.values(groups).sort((a,b)=> b.player.overall - a.player.overall);
}

function releasePlayer(playerId){
  const idx = STATE.ownedPlayers.findIndex(p=>p.id === playerId);
  if(idx === -1){ toast("Você não tem mais cópias desse jogador.", ""); return; }
  const player = STATE.ownedPlayers[idx];
  const value = releaseValue(player);

  if(!confirm(`Liberar 1x ${player.name} por ${value.toLocaleString("pt-BR")} GP?`)) return;

  STATE.ownedPlayers.splice(idx, 1);
  const idIdx = STATE.ownedIds.indexOf(playerId);
  if(idIdx !== -1) STATE.ownedIds.splice(idIdx, 1);

  grantCurrency(value, 0, "Liberar jogador");
  persist();
  toast(`+${value.toLocaleString("pt-BR")} GP — ${player.name} liberado.`, "success");
  renderReleasePlayerScreen();
}

function openReleasePlayerScreen(){
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
        <p class="release-hint">Troque cópias de jogadores por GP. Cada jogador na lista mostra quantas cópias você tem.</p>
        <div id="releasePlayerGrid" class="release-grid"></div>
      </div>`;
    document.body.appendChild(overlay);

    if(!document.getElementById("releasePlayerStyles")){
      const style = document.createElement("style");
      style.id = "releasePlayerStyles";
      style.textContent = `
      .release-overlay{position:fixed;inset:0;background:rgba(4,6,12,.92);z-index:9998;display:flex;align-items:center;justify-content:center;}
      .release-overlay.hidden{display:none;}
      .release-panel{background:#131a26;border-radius:16px;padding:18px;max-width:420px;width:92%;max-height:82vh;overflow-y:auto;color:#fff;}
      .release-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
      .release-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;}
      .release-hint{font-size:12px;color:#9ab;margin-bottom:12px;}
      .release-grid{display:flex;flex-direction:column;gap:8px;}
      .release-row{display:flex;align-items:center;gap:10px;background:#1c2634;border-radius:10px;padding:8px 10px;}
      .release-row img{width:40px;height:40px;object-fit:cover;border-radius:8px;}
      .release-row .rname{flex:1;font-size:13px;font-weight:600;}
      .release-row .rcount{font-size:11px;color:#9ab;}
      .release-row button{background:#ffd23f;color:#111;border:none;padding:7px 12px;border-radius:16px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;}
      `;
      document.head.appendChild(style);
    }
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
  grid.innerHTML = groups.map(g=>{
    const value = releaseValue(g.player);
    return `
      <div class="release-row">
        <img src="${g.player.image}" alt="">
        <div class="rname">${g.player.name}<br><span class="rcount">${g.count}x na coleção · OVR ${g.player.overall}</span></div>
        <button onclick="releasePlayer('${g.player.id}')">${value.toLocaleString("pt-BR")} GP</button>
      </div>`;
  }).join("");
}
