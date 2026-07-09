/* =========================================================
   NAVEGAÇÃO — SPA sem reload de página
   ========================================================= */
const NAV_ITEMS = [
  { id: "home",       icon: "🏠", label: "Início" },
  { id: "contratar",  icon: "🎰", label: "Contratar" },
  { id: "boxes",      icon: "📦", label: "Boxes" },
  { id: "clube",      icon: "👥", label: "Meu Clube" },
  { id: "escalacao",  icon: "⚽", label: "Escalação" },
  { id: "presentes",  icon: "🎁", label: "Caixa de Presentes" },
  { id: "missoes",    icon: "🎯", label: "Missões" },
  { id: "loja",       icon: "💰", label: "Loja" },
  { id: "config",     icon: "⚙", label: "Configurações" },
];
const TABBAR_IDS = ["home", "contratar", "clube", "escalacao"];

let currentScreen = "home";

function buildNav(){
  const desktop = document.getElementById("navListDesktop");
  const drawerList = document.getElementById("navListDrawer");
  desktop.innerHTML = "";
  drawerList.innerHTML = "";

  NAV_ITEMS.forEach(item=>{
    const btn = document.createElement("button");
    btn.className = "nav-item";
    btn.dataset.nav = item.id;
    btn.innerHTML = `<span class="ico">${item.icon}</span><span>${item.label}</span>`;
    btn.onclick = ()=> showScreen(item.id);
    desktop.appendChild(btn);

    const btn2 = btn.cloneNode(true);
    btn2.onclick = ()=>{ showScreen(item.id); closeDrawer(); };
    drawerList.appendChild(btn2);
  });

  const tabbar = document.getElementById("tabbar");
  tabbar.innerHTML = "";
  TABBAR_IDS.forEach(id=>{
    const item = NAV_ITEMS.find(n=>n.id===id);
    const btn = document.createElement("button");
    btn.className = "tab-item";
    btn.dataset.nav = id;
    btn.innerHTML = `<span class="ico">${item.icon}</span><span>${item.label.split(" ")[0]}</span>`;
    btn.onclick = ()=> showScreen(id);
    tabbar.appendChild(btn);
  });
  const moreBtn = document.createElement("button");
  moreBtn.className = "tab-item";
  moreBtn.innerHTML = `<span class="ico">☰</span><span>Mais</span>`;
  moreBtn.onclick = openDrawer;
  tabbar.appendChild(moreBtn);
}

function openDrawer(){
  document.getElementById("drawer").classList.add("open");
  document.getElementById("drawerBackdrop").classList.add("open");
}
function closeDrawer(){
  document.getElementById("drawer").classList.remove("open");
  document.getElementById("drawerBackdrop").classList.remove("open");
}

function showScreen(id){
  currentScreen = id;
  document.querySelectorAll(".screen").forEach(s=> s.classList.remove("active"));
  const target = document.getElementById("screen-" + id);
  if(target) target.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(b=> b.classList.toggle("active", b.dataset.nav===id));
  document.querySelectorAll(".tab-item").forEach(b=> b.classList.toggle("active", b.dataset.nav===id));

  // recarrega conteúdo dinâmico de cada tela ao entrar nela
  if(id==="contratar") renderContratarGrid();
  if(id==="boxes") renderBoxesScreen();
  if(id==="clube") renderClubeGrid();
  if(id==="escalacao") renderEscalacao();
  if(id==="presentes") renderGifts();
  if(id==="missoes") renderMissions();
  if(id==="loja") renderStore();
  if(id==="config") renderAdminPanel();
  if(id==="home") renderHome();

  window.scrollTo({ top:0, behavior:"instant" in window ? "instant":"auto" });
}

document.addEventListener("click", (e)=>{
  const navEl = e.target.closest("[data-nav]");
  if(navEl && navEl.tagName === "BUTTON" && !navEl.classList.contains("nav-item") && !navEl.classList.contains("tab-item")){
    showScreen(navEl.dataset.nav);
  }
});

document.getElementById("drawerBackdrop").addEventListener("click", closeDrawer);
