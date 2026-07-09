/* =========================================================
   LOJA — trocar Moedas por GP
   ========================================================= */
function renderStore(){
  const wrap = document.getElementById("storeGrid");
  wrap.innerHTML = GAME_DATA.store.filter(s=>s.costCoins>0).map(item=>`
    <div class="quick-card">
      <div class="lbl">${item.name}</div>
      <div class="num" style="font-size:20px;">${item.grantGP.toLocaleString("pt-BR")} GP</div>
      <button class="btn btn-gold btn-sm btn-block" onclick="buyStoreItem('${item.id}')">◆ ${item.costCoins} Moedas</button>
    </div>
  `).join("");
}

function buyStoreItem(id){
  const item = GAME_DATA.store.find(s=>s.id===id);
  if(!item) return;
  if(!spendCurrency(0, item.costCoins)){ toast("Moedas insuficientes.", ""); return; }
  grantCurrency(item.grantGP, 0);
  toast(`Compra realizada: +${item.grantGP.toLocaleString("pt-BR")} GP`, "success");
}
