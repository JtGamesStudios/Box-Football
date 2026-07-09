/* =========================================================
   NAVEGAÇÃO — SPA sem reload de página
   Estrutura em abas horizontais no topo (Match / Club House /
   Contract / Extras), igual ao eFootball. As telas reais do jogo
   (Contratar, Boxes, Meu Clube, Escalação, Presentes, Missões,
   Loja, Configurações) continuam existindo exatamente como antes —
   aqui só organizamos COMO se chega até elas.
   ========================================================= */

/* Abas principais do topo */
const TOP_TABS = [
  { id: "home",      label: "Match" },
  { id: "clubhouse", label: "Club House" },
  { id: "contract",  label: "Contract" },
  { id: "extras",    label: "Extras" },
];

/* Ícones de atalho no topo direito (perfil / presentes / missões / loja) */
const TOP_ICONS = [
  { icon: "👤", nav: "config",    title: "Perfil / Configurações" },
  { icon: "🎁", nav: "presentes", title: "Caixa de Presentes", badgeSource: "homeGifts" },
  { icon: "🎯", nav: "missoes",   title: "Missões" },
  { icon: "🛒", nav: "loja",      title: "Loja" },
];

/* Cards grandes de cada hub (banner + ícone + título + subtítulo),
   no estilo das telas "Club House" / "Contract" / "Extras" do eFootball. */
const CLUBHOUSE_CARDS = [
  { nav: "clube",     banner: "banner-emerald", icon: "👥", title: "Meu Clube",  sub: "Veja e organize seus jogadores contratados" },
  { nav: "escalacao", banner: "banner-violet",  icon: "⚽", title: "Escalação",  sub: "Monte seu time titular e salve elencos" },
  { nav: "missoes",   banner: "banner-crimson", icon: "🎯", title: "Missões",   sub: "Complete objetivos e ganhe recompensas" },
];
const CONTRACT_CARDS = [
  { nav: "contratar", banner: "banner-gold",    icon: "🎰", title: "Contratar", sub: "Abra Boxes e contrate seu próximo reforço" },
  { nav: "boxes",      banner: "banner-boxdraw", icon: "📦", title: "Boxes",      sub: "Acompanhe o progresso de cada Box" },
  { nav: "loja",       banner: "banner-emerald", icon: "💰", title: "Loja",       sub: "Troque Moedas por GP" },
];
const EXTRAS_CARDS = [
  { nav: "presentes", banner: "banner-violet",  icon: "🎁", title: "Caixa de Presentes", sub: "Resgate recompensas de missões e eventos" },
  { nav: "config",     banner: "banner-crimson", icon: "⚙",  title: "Configurações",       sub: "Preferências e painel administrativo" },
];

/* Cada tela "filha" pertence a uma aba do topo — usado para destacar
   a aba certa e para o botão "‹ Voltar" saber para onde retornar. */
const SCREEN_PARENT_TAB = {
  home: "home",
  clubhouse: "clubhouse", clube: "clubhouse", escalacao: "clubhouse", missoes: "clubhouse",
  contract: "contract", contratar: "contract", boxes: "contract", loja: "contract",
  extras: "extras", presentes: "extras", config: "extras",
};

/* Telas "hub" mostram grid de cards; as demais são telas-folha reais */
const HUB_SCREENS = ["clubhouse", "contract", "extras"];

let currentScreen = "home";

function buildNav(){
  buildTopTabs();
  buildTopIcons();
  buildHubGrid("clubhouseGrid", CLUBHOUSE_CARDS);
  buildHubGrid("contractGrid", CONTRACT_CARDS);
  buildHubGrid("extrasGrid", EXTRAS_CARDS);
}

function buildTopTabs(){
  const wrap = document.getElementById("menuTabs");
  if(!wrap) return;
  wrap.innerHTML = "";
  TOP_TABS.forEach(tab=>{
    const btn = document.createElement("button");
    btn.className = "menu-tab-item";
    btn.dataset.tab = tab.id;
    btn.textContent = tab.label;
    btn.onclick = ()=> showScreen(tab.id);
    wrap.appendChild(btn);
  });
}

function buildTopIcons(){
  const wrap = document.getElementById("topIcons");
  if(!wrap) return;
  wrap.innerHTML = "";
  TOP_ICONS.forEach(item=>{
    const btn = document.createElement("button");
    btn.className = "topicon-btn";
    btn.title = item.title;
    btn.dataset.nav = item.nav;
    btn.innerHTML = item.badgeSource
      ? `<span class="badge-dot hidden" data-badge-for="${item.nav}">0</span>${item.icon}`
      : item.icon;
    btn.onclick = ()=> showScreen(item.nav);
    wrap.appendChild(btn);
  });
}

function buildHubGrid(containerId, cards){
  const wrap = document.getElementById(containerId);
  if(!wrap) return;
  wrap.innerHTML = "";
  cards.forEach(c=>{
    const btn = document.createElement("button");
    btn.className = "menu-card";
    btn.dataset.nav = c.nav;
    btn.innerHTML = `
      <div class="menu-card-banner ${c.banner}">
        <div class="menu-card-icon">${c.icon}</div>
      </div>
      <div class="menu-card-body">
        <div class="menu-card-title">${c.title}</div>
        <div class="menu-card-sub">${c.sub}</div>
      </div>`;
    btn.onclick = ()=> showScreen(c.nav);
    wrap.appendChild(btn);
  });
}

/* Injeta (ou remove) o botão "‹ Voltar" no topo das telas-filha,
   igual ao botão azul das telas de Box do eFootball. */
function updateBackButton(id){
  document.querySelectorAll(".screen-back-btn").forEach(b => b.remove());
  if(HUB_SCREENS.includes(id) || id === "home") return;
  const parentTab = SCREEN_PARENT_TAB[id];
  if(!parentTab || parentTab === id) return;
  const target = document.getElementById("screen-" + id);
  if(!target) return;
  const back = document.createElement("button");
  back.className = "btn screen-back-btn";
  back.innerHTML = "‹ Voltar";
  back.onclick = ()=> showScreen(parentTab);
  target.prepend(back);
}

/* Sincroniza o badge numérico do ícone de presentes com o valor
   já calculado pelo app (id="homeGifts"), sem duplicar lógica. */
function syncTopBadges(){
  TOP_ICONS.forEach(item=>{
    if(!item.badgeSource) return;
    const source = document.getElementById(item.badgeSource);
    const badge = document.querySelector(`[data-badge-for="${item.nav}"]`);
    if(!source || !badge) return;
    const val = parseInt(source.textContent, 10) || 0;
    badge.textContent = val;
    badge.classList.toggle("hidden", val <= 0);
  });
}

function showScreen(id){
  currentScreen = id;
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById("screen-" + id);
  if(target) target.classList.add("active");

  const activeTab = SCREEN_PARENT_TAB[id] || id;
  document.querySelectorAll(".menu-tab-item").forEach(b => b.classList.toggle("active", b.dataset.tab === activeTab));
  document.querySelectorAll(".topicon-btn").forEach(b => b.classList.toggle("active", b.dataset.nav === id));

  updateBackButton(id);

  // recarrega conteúdo dinâmico de cada tela ao entrar nela (inalterado)
  if(id==="contratar") renderContratarGrid();
  if(id==="boxes") renderBoxesScreen();
  if(id==="clube") renderClubeGrid();
  if(id==="escalacao") renderEscalacao();
  if(id==="presentes") renderGifts();
  if(id==="missoes") renderMissions();
  if(id==="loja") renderStore();
  if(id==="config") renderAdminPanel();
  if(id==="home") renderHome();

  syncTopBadges();

  window.scrollTo({ top:0, behavior:"instant" in window ? "instant":"auto" });
}

document.addEventListener("click", (e)=>{
  const navEl = e.target.closest("[data-nav]");
  if(navEl && navEl.tagName === "BUTTON" &&
     !navEl.classList.contains("menu-tab-item") &&
     !navEl.classList.contains("topicon-btn") &&
     !navEl.classList.contains("menu-card")){
    showScreen(navEl.dataset.nav);
  }
});
