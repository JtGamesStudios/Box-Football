/* =========================================================
   MEU CLUBE — pesquisa, filtros e ordenação
   ========================================================= */
function renderClubeGrid(){
  const grid = document.getElementById("clubeGrid");
  const q = (document.getElementById("clubeSearch").value || "").toLowerCase().trim();
  const posFilter = document.getElementById("clubeFilterPos").value;
  const rarityFilter = document.getElementById("clubeFilterRarity").value;
  const sortBy = document.getElementById("clubeSort").value;

  const homeCountEl = document.getElementById("homePlayers");
  if(homeCountEl) homeCountEl.textContent = STATE.ownedPlayers.length;

  let list = STATE.ownedPlayers.filter(p=>{
    if(q && !p.name.toLowerCase().includes(q) && !p.club.toLowerCase().includes(q)) return false;
    if(posFilter && p.position !== posFilter) return false;
    if(rarityFilter && p.rarity !== rarityFilter) return false;
    return true;
  });

  switch(sortBy){
    case "strong": list.sort((a,b)=> b.overall - a.overall); break;
    case "weak": list.sort((a,b)=> a.overall - b.overall); break;
    case "name": list.sort((a,b)=> a.name.localeCompare(b.name)); break;
    case "recent": list.sort((a,b)=> b.acquiredAt - a.acquiredAt); break;
  }

  if(list.length===0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">👥</div>${STATE.ownedPlayers.length===0 ? "Você ainda não contratou nenhum jogador. Vá em Contratar!" : "Nenhum jogador encontrado com esses filtros."}</div>`;
    return;
  }

  grid.innerHTML = list.map(p=> renderPlayerCard(p)).join("");
}

["clubeSearch","clubeFilterPos","clubeFilterRarity","clubeSort"].forEach(id=>{
  document.addEventListener("DOMContentLoaded", ()=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener("input", renderClubeGrid);
  });
});
