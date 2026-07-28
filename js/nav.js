/* =========================================================
   NAVEGAÇÃO — SPA sem reload de página
   Estrutura em abas horizontais no topo (Match / Club House /
   Contract / Extras), igual ao eFootball. As telas reais do jogo
   (Contratar, Boxes, Meu Clube, Escalação, Presentes, Missões,
   Loja, Configurações) continuam existindo exatamente como antes —
   aqui só organizamos COMO se chega até elas.
   ========================================================= */

/* Abas principais do topo (dot = pontinho de notificação, opcional) */
const TOP_TABS = [
  { id: "home",      label: "Match" },
  { id: "clubhouse", label: "Club House" },
  { id: "contract",  label: "Contract" },
  { id: "extras",    label: "Extras" },
];

/* Ícones de atalho no topo direito, agora em SVG (padrão eFootball:
   perfil / presentes / mensagens / loja). Trocar o path do <svg> aqui
   dentro é o suficiente pra mudar o desenho do ícone. */
const ICON_SVG = {
  user: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 12c2.7 0 4.9-2.2 4.9-4.9S14.7 2.2 12 2.2 7.1 4.4 7.1 7.1 9.3 12 12 12zm0 2.4c-3.3 0-9.8 1.6-9.8 4.9v2.5h19.6v-2.5c0-3.3-6.5-4.9-9.8-4.9z"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 7h-2.2c.1-.3.2-.6.2-1a2.5 2.5 0 0 0-4.6-1.4L12 6.1l-1.4-1.5A2.5 2.5 0 0 0 6 6c0 .4.1.7.2 1H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1zM9 6a.9.9 0 0 1 .9-.9c.3 0 .5.1.7.3L12 7l1.4-1.6c.2-.2.4-.3.7-.3A.9.9 0 0 1 15 6c0 .5-.4 1-.9 1H9.9c-.5 0-.9-.5-.9-1zM4 13v7a1 1 0 0 0 1 1h6v-8H4zm9 8h6a1 1 0 0 0 1-1v-7h-7v8z"/></svg>`,
  mail: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  cart: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M7 18c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zM7.2 14h9.6c.8 0 1.5-.5 1.8-1.2l3.1-6.8H5.2L4.3 4H1v2h2l3.6 7.6-1.3 2.4c-.6 1.1.2 2.5 1.5 2.5h13v-2H7l1.1-2z"/></svg>`,
  trophy: `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M18 3h3a1 1 0 0 1 1 1v2c0 2.4-1.7 4.4-4 4.9-.6 1.6-1.9 2.9-3.5 3.6V17H16a1 1 0 0 1 1 1v1H7v-1a1 1 0 0 1 1-1h2.5v-2.5c-1.6-.7-2.9-2-3.5-3.6C4.7 10.4 3 8.4 3 6V4a1 1 0 0 1 1-1h3V2h11v1zM6 5H5v1c0 1.1.6 2.1 1.6 2.6C6.2 7.8 6 6.9 6 6zm12 0v1c0 .9-.2 1.8-.6 2.6C18.4 8.1 19 7.1 19 6V5zM7 4v5.5c0 2.5 2 4.5 5 4.5s5-2 5-4.5V4z"/></svg>`,
};

/* O ícone do Ranking Global fica sempre visível no topo (fora ou dentro
   da Campanha), pra dar acesso rápido à área própria do ranking. */
const TOP_ICONS = [
  { iconKey: "trophy", nav: "ranking",      title: "Ranking Global",        badgeSource: null },
  { iconKey: "user", nav: "config",        title: "Perfil / Configurações", badgeSource: null },
  { iconKey: "gift", nav: "presentes",     title: "Caixa de Presentes",     badgeSource: "homeGifts" },
  { iconKey: "mail", nav: "informacoes",   title: "Informações e Notícias", badgeSource: null, arrowBadge: true },
  { iconKey: "cart", nav: "loja",          title: "Loja",                  badgeSource: null },
];

/* Cards grandes de cada hub (banner + ícone + título + subtítulo + badge
   numérico opcional), no padrão exato do PES (Agent/Scout/Auction/Manager,
   Squad Management/My Team/Achievements/Practice).
   badgeSource: id de um elemento já existente na tela (ex: "homeMissions")
   cujo texto vira o número do badge — deixe null pra não mostrar badge.
   locked: true = card fica escurecido, com selo "Indisponível" e sem clique
   (usado enquanto só a Campanha está pronta pra jogar). */
/* Cards da aba "Match" (home) — réplica exata dos 4 cards da imagem de
   referência (eFootball / Modo de evento / Jogo c/ amigo / Campanha).
   nav:null = card decorativo, sem clique/navegação nenhuma. */
const HOME_CARDS = [
  { nav: "cardbattle", banner: "banner-home-efootball", icon: "", title: "eFootball",      sub: "Duelo de cartas — vida, combo e estratégia", badgeSource: null, keepIcon: true },
  { nav: "evento", banner: "banner-home-evento", icon: "", title: "Modo de evento", sub: "Ganhe prêmios em jogos contra o COM", badgeSource: null },
  { nav: "amigo", banner: "banner-home-amigo",  icon: "", title: "Jogo c/ amigo",  sub: "Desafie um amigo, ao vivo, online", badgeSource: null },
  { nav: "campanha", banner: "banner-home-campanha",  icon: "", title: "Campanha",      sub: "", badgeSource: null },
];
const CLUBHOUSE_CARDS = [
  { nav: "clube",     banner: "banner-club-meuclube",  icon: "", title: "Meu Clube",  sub: "Veja e organize seus jogadores contratados", badgeSource: null },
  { nav: "escalacao", banner: "banner-club-escalacao", icon: "", title: "Escalação",  sub: "Monte seu time titular e salve elencos", badgeSource: null },
  { nav: "missoes",   banner: "banner-club-missoes",   icon: "", title: "Missões",   sub: "Complete objetivos e ganhe recompensas", badgeSource: "homeMissions" },
];
const CONTRACT_CARDS = [
  { nav: "contratar", banner: "banner-contract-contratar", icon: "", title: "Contratar", sub: "Abra Boxes e contrate seu próximo reforço", badgeSource: null },
  { nav: "loja",       banner: "banner-contract-loja",      icon: "", title: "Loja",       sub: "Troque Moedas por GP", badgeSource: null },
];
/* Sub-hub da tela "Contratar": escolher entre a Box Draw (Legends,
   paga em GP) e as Boxes Especiais (eventos/destaque, pagas em Moedas). */
const CONTRATAR_CARDS = [
  { nav: "boxdraw",  banner: "banner-contratar-boxdraw",  icon: "", title: "Box Draw", sub: "A grande Box de Lendas — sorteio pago em GP", badgeSource: null },
  { nav: "especial", banner: "banner-contratar-especial", icon: "", title: "Especial", sub: "Boxes de eventos, jogadores em destaque e grátis", badgeSource: null },
];
const EXTRAS_CARDS = [
  { nav: "presentes", banner: "banner-extras-presentes", icon: "", title: "Caixa de Presentes", sub: "Resgate recompensas de missões e eventos", badgeSource: "homeGifts" },
  { nav: "config",     banner: "banner-extras-config",    icon: "⚙",  title: "Configurações",       sub: "Preferências, seu ID e resgate de código", badgeSource: null, keepIcon: true },
];

/* Cada tela "filha" pertence a uma aba do topo — usado para destacar
   a aba certa e para o botão "‹ Voltar" saber para onde retornar. */
const SCREEN_PARENT_TAB = {
  home: "home",
  campanha: "home",
  ranking: "home",
  evento: "home",
  amigo: "home",
  cardbattle: "home",
  clubhouse: "clubhouse", clube: "clubhouse", escalacao: "clubhouse", missoes: "clubhouse",
  contract: "contract", contratar: "contract", boxes: "contract", loja: "contract",
  boxdraw: "contratar", especial: "contratar",
  extras: "extras", presentes: "extras", config: "extras",
  informacoes: "home",
};

/* Telas "hub" mostram grid de cards; as demais são telas-folha reais */
const HUB_SCREENS = ["home", "clubhouse", "contract", "extras", "contratar"];

let currentScreen = "home";
/* Pilha de "de onde a pessoa veio" — o botão "‹ Voltar" usa isso pra
   voltar pra tela REAL anterior (ex: Campanha → Escalação → Voltar
   → Campanha de novo), em vez de sempre cair na aba-pai fixa. */
let screenHistory = [];

function buildNav(){
  buildTopTabs();
  buildTopIcons();
  buildHubGrid("homeGrid", HOME_CARDS);
  buildHubGrid("clubhouseGrid", CLUBHOUSE_CARDS);
  buildHubGrid("contractGrid", CONTRACT_CARDS);
  buildHubGrid("extrasGrid", EXTRAS_CARDS);
  buildHubGrid("contratarSubGrid", CONTRATAR_CARDS);
  updateContratarCardBanners();
  updateCardBattleCardLock();
}

/* Enquanto o Card Battle estiver em teste fechado (ver
   CARD_BATTLE_ACCESS_WHITELIST em js/cardbattle.js), o card da Home
   (o antigo "eFootball") fica travado igual aos outros modos
   "Indisponível" pra quem não está na lista. */
function updateCardBattleCardLock(){
  const card = document.querySelector('.menu-card[data-nav="cardbattle"]');
  if(!card) return;
  const allowed = typeof hasCardBattleAccess !== "function" || hasCardBattleAccess();
  card.classList.toggle("locked", !allowed);
  card.disabled = !allowed;
  card.onclick = allowed ? (()=> showScreen("cardbattle")) : null;
  const existingLock = card.querySelector(".menu-card-lock");
  if(!allowed && !existingLock){
    card.insertAdjacentHTML("beforeend", `<div class="menu-card-lock"><span class="menu-card-lock-icon">🔒</span><span class="menu-card-lock-label">Em breve</span></div>`);
  } else if(allowed && existingLock){
    existingLock.remove();
  }
}

/* Os cards "Box Draw" e "Especial" usam como imagem o banner da
   primeira Box ativa de cada categoria (ordem de data/boxes/index.json).
   Se nenhuma box ativa existir na categoria, o card fica travado
   (sem clique) e sem foto — só um cinza liso, igual aos outros
   modos "Indisponível". */
function updateContratarCardBanners(){
  if(typeof GAME_DATA === 'undefined' || !GAME_DATA.boxesRaw || !GAME_DATA.boxesRaw.length) return;
  ["boxdraw","especial"].forEach(cat=>{
    const el = document.getElementById(`menuCardBanner-${cat}`);
    if(!el) return;
    const card = el.closest(".menu-card");
    const first = GAME_DATA.boxesRaw
      .map(b=>getEffectiveBox(b.id))
      .find(b=>b.active && isBoxLive(b) && b.category===cat);

    if(first && first.banner){
      el.style.backgroundImage = `url('${first.banner}')`;
      el.style.backgroundColor = "";
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      if(card){
        card.classList.remove("locked");
        card.disabled = false;
        card.onclick = ()=> showScreen(cat);
        const lock = card.querySelector(".menu-card-lock");
        if(lock) lock.remove();
      }
    } else {
      el.style.backgroundImage = "none";
      el.style.backgroundColor = "#6B7280";
      if(card){
        card.classList.add("locked");
        card.disabled = true;
        card.onclick = null;
        if(!card.querySelector(".menu-card-lock")){
          card.insertAdjacentHTML("beforeend", `<div class="menu-card-lock"><span class="menu-card-lock-icon">🔒</span><span class="menu-card-lock-label">Indisponível</span></div>`);
        }
      }
    }
  });
}

function buildTopTabs(){
  const wrap = document.getElementById("menuTabs");
  if(!wrap) return;
  wrap.innerHTML = "";
  TOP_TABS.forEach((tab, i)=>{
    if(i > 0){
      const sep = document.createElement("span");
      sep.className = "tab-sep";
      sep.textContent = "|";
      wrap.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.className = "menu-tab-item";
    btn.dataset.tab = tab.id;
    btn.innerHTML = tab.label + (tab.dot ? `<span class="tab-dot ${tab.dot==="orange"?"orange":""}"></span>` : "");
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
    btn.innerHTML = item.arrowBadge
      ? `<span class="info-badge-arrow hidden" id="infoBadgeArrow">▲</span>${ICON_SVG[item.iconKey]}`
      : item.badgeSource
      ? `<span class="badge-dot hidden" data-badge-for="${item.nav}">0</span>${ICON_SVG[item.iconKey]}`
      : ICON_SVG[item.iconKey];
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
    const isLocked = !!c.locked;
    btn.className = "menu-card" + (c.nav ? "" : " no-nav") + (isLocked ? " locked" : "");
    if(isLocked) btn.disabled = true;
    if(c.nav) btn.dataset.nav = c.nav;
    btn.innerHTML = `
      <div class="menu-card-banner ${c.banner}" id="menuCardBanner-${c.nav || containerId + '-' + c.title}"></div>
      ${c.badgeSource ? `<span class="menu-card-badge hidden" data-hub-badge-for="${c.nav}">0</span>` : ""}
      ${(c.icon || c.keepIcon) ? `<div class="menu-card-icon">${c.icon}</div>` : ""}
      <div class="menu-card-body">
        <div class="menu-card-title">${c.title}</div>
        ${c.sub ? `<div class="menu-card-sub">${c.sub}</div>` : ""}
      </div>
      ${isLocked ? `<div class="menu-card-lock"><span class="menu-card-lock-icon">🔒</span><span class="menu-card-lock-label">Indisponível</span></div>` : ""}`;
    if(c.nav && !isLocked) btn.onclick = ()=> showScreen(c.nav);
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
  back.onclick = ()=>{
    const prev = screenHistory.pop();
    showScreen(prev || parentTab, { isBack:true });
  };
  target.prepend(back);
}

/* Sincroniza os badges numéricos (ícones do topo + cards de hub) com
   valores já calculados pelo app (ex: id="homeGifts"), sem duplicar lógica. */
const ALL_HUB_CARDS = [...HOME_CARDS, ...CLUBHOUSE_CARDS, ...CONTRACT_CARDS, ...EXTRAS_CARDS, ...CONTRATAR_CARDS];

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

  ALL_HUB_CARDS.forEach(c=>{
    if(!c.badgeSource) return;
    const source = document.getElementById(c.badgeSource);
    const badge = document.querySelector(`[data-hub-badge-for="${c.nav}"]`);
    if(!source || !badge) return;
    const val = parseInt(source.textContent, 10) || 0;
    badge.textContent = val;
    badge.classList.toggle("hidden", val <= 0);
  });
}

function showScreen(id, opts){
  opts = opts || {};
  // só empilha quando é navegação "pra frente" (clique em card/aba/ícone) e
  // realmente troca de tela; o botão Voltar chama com isBack:true pra não
  // reempilhar o caminho de volta
  if(!opts.isBack && id !== currentScreen){
    screenHistory.push(currentScreen);
    if(screenHistory.length > 25) screenHistory.shift();
  }
  currentScreen = id;
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = document.getElementById("screen-" + id);
  if(target) target.classList.add("active");

  const activeTab = SCREEN_PARENT_TAB[id] || id;
  document.querySelectorAll(".menu-tab-item").forEach(b => b.classList.toggle("active", b.dataset.tab === activeTab));
  document.querySelectorAll(".topicon-btn").forEach(b => b.classList.toggle("active", b.dataset.nav === id));

  // Telas de grid (Club House / Contract / Extras) ficam travadas no
  // tamanho da tela, sem scroll — igual ao layout do eFootball. As
  // demais telas (listas, boxes, escalação etc.) continuam rolando
  // normalmente, por isso essa classe só entra/sai com base no id.
  document.documentElement.classList.toggle("hub-active", HUB_SCREENS.includes(id));

  updateBackButton(id);

  // recarrega conteúdo dinâmico de cada tela ao entrar nela (inalterado)
  if(id==="boxdraw") renderContratarGrid("boxdraw");
  if(id==="especial") renderContratarGrid("especial");
  if(id==="contratar") updateContratarCardBanners();
  if(id==="boxes") renderBoxesScreen();
  if(id==="clube") renderClubeGrid();
  if(id==="escalacao") renderEscalacao();
  if(id==="presentes") renderGifts();
  if(id==="missoes") renderMissions();
  if(id==="informacoes") renderInformacoes();
  if(id==="loja") renderStore();
  if(id==="config") renderConfigScreen();
  if(id==="home") renderHome();
  if(id==="campanha") renderCampaign();
  if(id==="ranking") renderRankingScreen();
  if(id==="evento") renderEventoScreen();
  if(id==="amigo") renderAmigoScreen();
  if(id==="cardbattle") initCardBattleScreen();

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
