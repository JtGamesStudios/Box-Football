/* =========================================================
   CAIXA DE PRESENTES
   ========================================================= */
function renderGifts(){
  const wrap = document.getElementById("giftsList");
  const gifts = STATE.gifts.slice().sort((a,b)=> b.createdAt - a.createdAt);
  const homeGifts = document.getElementById("homeGifts");
  if(homeGifts) homeGifts.textContent = gifts.filter(g=>!g.claimed).length;

  if(gifts.length===0){
    wrap.innerHTML = `<div class="empty-state"><div class="big">🎁</div>Nenhum presente ainda. Complete missões e volte todos os dias!</div>`;
    return;
  }
  wrap.innerHTML = gifts.map(g=>`
    <div class="gift-item">
      <div class="mission-info">
        <div class="mission-desc">${g.title}</div>
        <div class="mission-prog-txt">${g.desc}</div>
      </div>
      <div style="text-align:right;">
        <div class="mission-reward" style="color:var(--gold);">${g.gp?g.gp.toLocaleString("pt-BR")+" GP":""} ${g.coins? "+ "+g.coins.toLocaleString("pt-BR")+" Moedas":""}</div>
        ${g.badge ? `<div class="gift-badge-tag">${g.badge.icon} ${g.badge.label}</div>` : ""}
        ${g.claimed
          ? `<span style="font-size:11.5px;color:var(--turf);">Resgatado ✓</span>`
          : `<button class="btn btn-sm btn-primary" onclick="claimGiftUI('${g.id}')">Resgatar</button>`}
      </div>
    </div>`).join("");
}

function claimGiftUI(id){
  claimGift(id);
  toast("Presente resgatado!", "success");
  renderGifts();
}

document.getElementById("btnClaimAllGifts").addEventListener("click", ()=>{
  claimAllGifts();
  renderGifts();
});
