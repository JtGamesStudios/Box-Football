/* =========================================================
   NOVIDADES — popup estilo "This week's pick up" do eFootball.
   Mostra, empilhados, todos os Boxes ativos, todos os Eventos
   ativos e todos os CÓDIGOS DE RESGATE anunciados (banner + nome),
   pegando as imagens que já existem em data/boxes/*.json,
   data/events.json e data/coupons.json. Aparece só uma vez; volta
   a aparecer quando surgir conteúdo NOVO (uma Box, Evento ou
   código com id que a pessoa ainda não viu).

   Pra anunciar um código de resgate aqui dentro, no
   data/coupons.json basta adicionar:
     "announce": true,           // liga o aviso
     "announceTitle": "...",     // opcional, título mostrado no popup
     "banner": "assets/banners/seu-banner.png"  // opcional, imagem do card
   O aviso some sozinho pra cada jogador assim que ele resgatar
   aquele código (ou se o código for só pra outro ID, ou expirar).
   ========================================================= */

function getAnnouncedCoupons(){
  const myId = typeof getPlayerId === "function" ? getPlayerId() : null;
  return (GAME_DATA.coupons || []).filter(c=>{
    if(!c.announce) return false;
    if(c.expiresAt && Date.now() > new Date(c.expiresAt).getTime()) return false;
    if(c.targetId && myId && String(c.targetId).trim().toUpperCase() !== myId.toUpperCase()) return false;
    const code = String(c.code || "").trim().toUpperCase();
    if(STATE && STATE.redeemedCodes && STATE.redeemedCodes.includes(code)) return false;
    return true;
  });
}

function computeContentSignature(){
  const boxIds = GAME_DATA.boxesRaw
    .map(b => getEffectiveBox(b.id))
    .filter(b => b && b.active)
    .map(b => b.id)
    .sort();
  const eventIds = getActiveEvents().map(e => e.id).sort();
  const couponCodes = getAnnouncedCoupons().map(c => String(c.code).toUpperCase()).sort();
  return JSON.stringify({ boxes: boxIds, events: eventIds, coupons: couponCodes });
}

function buildNovidadesItems(){
  const items = [];

  GAME_DATA.boxesRaw
    .map(b => getEffectiveBox(b.id))
    .filter(b => b && b.active)
    .forEach(b=>{
      items.push({
        banner: b.banner,
        title: b.name,
        sub: b.category === "boxdraw" ? "Box Draw — sorteio pago em GP" : "Especial — pago em Moedas",
        nav: "contratar",
      });
    });

  getActiveEvents().forEach(evt=>{
    items.push({
      banner: evt.banner,
      title: evt.title,
      sub: "Ganhe prêmios em jogos contra o COM",
      nav: "evento",
    });
  });

  getAnnouncedCoupons().forEach(c=>{
    const code = String(c.code || "").trim().toUpperCase();
    items.push({
      banner: c.banner || "",
      title: c.announceTitle || c.title || "Novo código de presente disponível!",
      sub: `Código: <strong>${code}</strong> — resgate em Configurações`,
      nav: "config",
      couponCode: code,
    });
  });

  return items;
}

function renderNovidadesList(){
  const wrap = document.getElementById("novidadesList");
  if(!wrap) return;
  const items = buildNovidadesItems();
  if(!items.length){
    wrap.innerHTML = `<p class="page-sub" style="margin:0;">Nada de novo por enquanto — volte em breve!</p>`;
    return;
  }
  wrap.innerHTML = items.map(it => `
    <button class="novidades-item" data-nav="${it.nav}" ${it.couponCode ? `data-coupon="${it.couponCode}"` : ""}>
      <div class="novidades-item-banner" style="background-image:url('${it.banner}')"></div>
      <div class="novidades-item-body">
        <div class="novidades-item-title">${it.title}</div>
        <div class="novidades-item-sub">${it.sub}</div>
      </div>
      <span class="novidades-item-arrow">›</span>
    </button>`).join("");
}

function closeNovidades(){
  const overlay = document.getElementById("novidadesOverlay");
  if(overlay) overlay.classList.add("hidden");
  STATE.seenContent.signature = computeContentSignature();
  persist();
}

function maybeShowNovidades(){
  const overlay = document.getElementById("novidadesOverlay");
  if(!overlay) return;
  const signature = computeContentSignature();
  if(STATE.seenContent.signature === signature) return; // já viu esse conteúdo

  renderNovidadesList();
  overlay.classList.remove("hidden");

  overlay.querySelectorAll("[data-nav]").forEach(btn=>{
    btn.onclick = ()=>{
      const couponCode = btn.dataset.coupon;
      closeNovidades();
      showScreen(btn.dataset.nav);
      if(couponCode){
        const input = document.getElementById("couponCodeInput");
        if(input) input.value = couponCode;
      }
    };
  });
}

document.addEventListener("DOMContentLoaded", ()=>{
  const closeBtn = document.getElementById("novidadesCloseBtn");
  if(closeBtn) closeBtn.onclick = closeNovidades;
  const overlay = document.getElementById("novidadesOverlay");
  if(overlay){
    overlay.addEventListener("click", (e)=>{ if(e.target === overlay) closeNovidades(); });
  }
});
