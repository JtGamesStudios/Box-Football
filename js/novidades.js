/* =========================================================
   NOVIDADES — popup estilo "This week's pick up" do eFootball.
   Mostra, empilhados, todos os Boxes ativos e todos os Eventos
   ativos (banner + nome), pegando as imagens que já existem em
   data/boxes/*.json e data/events.json. Aparece só uma vez; volta
   a aparecer quando surgir conteúdo NOVO (uma Box ou Evento com
   id que a pessoa ainda não viu).
   ========================================================= */

function computeContentSignature(){
  const boxIds = GAME_DATA.boxesRaw
    .map(b => getEffectiveBox(b.id))
    .filter(b => b && b.active)
    .map(b => b.id)
    .sort();
  const eventIds = getActiveEvents().map(e => e.id).sort();
  return JSON.stringify({ boxes: boxIds, events: eventIds });
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
    <button class="novidades-item" data-nav="${it.nav}">
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
      closeNovidades();
      showScreen(btn.dataset.nav);
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
