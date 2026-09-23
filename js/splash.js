/* ============ Splash Screen — carrossel + toque pra entrar ============
   - Visual estilo PES: logo à esquerda + círculo de toque, "Seu ID" /
     versão (APP_VERSION) / copyright no canto inferior esquerdo, selo
     da marca no canto superior direito e botão de menu no inferior
     direito (peças novas montadas em setupPesLayout()).
   - Troca a imagem de fundo a cada SLIDE_INTERVAL ms.
   - Ao tocar/clicar em qualquer lugar da splash, mostra um loading rápido
     e depois exibe a tela de MANUTENÇÃO (o app não é liberado enquanto
     MAINTENANCE_MODE estiver true).
   - Não depende de nenhum outro script pra funcionar (pode ficar antes
     ou depois dos demais <script> no index.html) — as exceções são o
     menu hambúrguer (só existe dentro do app/Capacitor), com "Limpar
     cache" (local) e "Transferir dados", que chama startDataTransferFlow()
     de js/app-transfer.js; e o update obrigatório de conteúdo (ver
     js/content-update.js), que pode segurar o enterApp() até terminar
     de baixar. */
(function () {
  const SLIDE_INTERVAL = 10000;   // troca de imagem a cada 10s
  const LOADING_DURATION = 1400;  // quanto tempo o loading fica visível
  const FADE_OUT_DURATION = 500;  // precisa bater com a transição no CSS

  // ---------------------------------------------------------------
  // VERSÃO DO JOGO — aparece no canto inferior esquerdo da splash.
  // Troque aqui a cada versão nova (é o único lugar).
  // ---------------------------------------------------------------
  const APP_VERSION = "1.0.1";
  const APP_COPYRIGHT = "©2026 JT Games Studios";
  const BRAND_BADGE = "JT";              // texto dentro do círculo (canto superior direito)
  const BRAND_NAME = "GAMES STUDIOS";    // texto embaixo do círculo

  // ---------------------------------------------------------------
  // MODO MANUTENÇÃO
  // Deixe true enquanto o servidor estiver em manutenção.
  // Quando quiser liberar o app de novo, é só voltar para false.
  // ---------------------------------------------------------------
  const MAINTENANCE_MODE = false;
  const MAINTENANCE_END_LABEL = "Em breve";

  // ---------------------------------------------------------------
  // MANUTENÇÃO SEMANAL AUTOMÁTICA — toda quarta-feira, das 23h às 0h
  // (horário de Brasília, UTC-3 fixo, sem horário de verão). Fecha
  // sozinho às 23h de quarta e reabre sozinho às 0h de quinta, sem
  // precisar mexer em nada manualmente. Os mesmos IDs de
  // MAINTENANCE_BYPASS_IDS (abaixo) também liberam esse horário.
  // Pra desativar, é só trocar para false.
  // ---------------------------------------------------------------
  const WEEKLY_MAINTENANCE_ENABLED = true;
  const WEEKLY_MAINTENANCE_DAY = 3;         // 0=domingo, 1=segunda, 2=terça, 3=quarta
  const WEEKLY_MAINTENANCE_START_HOUR = 23; // fecha às 23h de quarta
  const WEEKLY_MAINTENANCE_END_LABEL = "Volta hoje à 00h";

  function getBrasiliaNow() {
    // Brasília = UTC-3 fixo (Brasil não usa mais horário de verão).
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    return new Date(utcMs + -3 * 60 * 60000);
  }

  function isWeeklyMaintenanceActive() {
    if (!WEEKLY_MAINTENANCE_ENABLED) return false;
    const brNow = getBrasiliaNow();
    // Janela: quarta-feira, a partir da hora 23 até a virada pra
    // quinta (hora 0) — ou seja, só a última hora de quarta-feira.
    return brNow.getDay() === WEEKLY_MAINTENANCE_DAY && brNow.getHours() >= WEEKLY_MAINTENANCE_START_HOUR;
  }

  // ---------------------------------------------------------------
  // MIGRAÇÃO PRO APP — a partir dessa data/hora (horário de Brasília),
  // o acesso pelo NAVEGADOR é bloqueado para todo mundo, EXCETO os
  // dispositivos listados em MIGRATION_BYPASS_IDS (abaixo).
  // Dentro do app instalado (Capacitor) esse bloqueio nunca se aplica.
  // ---------------------------------------------------------------
  const MIGRATION_CUTOFF_DATE = new Date("2026-07-30T23:59:00-03:00");
  const DOWNLOAD_APP_URL = ""; // preencher com o link do app (Play Store) quando disponível

  // ---------------------------------------------------------------
  // ACESSO PELO NAVEGADOR (só o seu PC) — IDs de dispositivo que podem
  // entrar pelo navegador mesmo depois da data de corte da migração.
  // Abra o jogo no navegador do PC, copie o "Seu ID: XXXX-XXXX" que
  // aparece na tela inicial e cole aqui (uma linha por dispositivo).
  // Lista vazia ([]) = ninguém entra pelo navegador depois do corte.
  // ---------------------------------------------------------------
  const MIGRATION_BYPASS_IDS = [
    "82P5-7ZBY", 
  ];

  function hasMigrationBypass() {
    try {
      return typeof getPlayerId === "function" && MIGRATION_BYPASS_IDS.includes(getPlayerId());
    } catch (e) {
      return false;
    }
  }

  function isNativePlatform() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // ---------------------------------------------------------------
  // ACESSO SECRETO (bypass da manutenção) — agora por ID do dispositivo,
  // não por link, já que o acesso principal passou a ser pelo app.
  // Seu ID aparece na própria tela inicial ("Seu ID: XXXX-XXXX") e em
  // Configurações — copie o ID do SEU aparelho e cole na lista abaixo.
  // Pra liberar mais de um dispositivo seu, é só adicionar mais IDs.
  // Lista vazia ([]) = manutenção vale pra todo mundo, sem exceção.
  // ---------------------------------------------------------------
  const MAINTENANCE_BYPASS_IDS = [
    "NER7-VM4B",
    "82P5-7ZBY", 
  ];

  function hasBypass() {
    try {
      return typeof getPlayerId === "function" && MAINTENANCE_BYPASS_IDS.includes(getPlayerId());
    } catch (e) {
      return false;
    }
  }

  const overlay = document.getElementById("splashOverlay");
  if (!overlay) return;

  // Mostra o ID único deste navegador já na tela inicial — necessário
  // pra resgatar códigos/presentes (e, no futuro, adicionar amigos).
  const idEl = document.getElementById("splashPlayerId");
  if (idEl && typeof getPlayerId === "function") {
    idEl.textContent = "Seu ID: " + getPlayerId();
  }

  const slides = Array.from(document.querySelectorAll(".splash-slide"));
  const tapHint = document.getElementById("splashTapHint");
  const loadingWrap = document.getElementById("splashLoading");
  const maintenanceWrap = document.getElementById("splashMaintenance");

  /* ---------- Layout estilo PES ----------
     Monta, por JS, as peças novas da splash (não precisa mexer no
     index.html): vinheta leve, círculo de toque, bloco de informações
     (ID + versão + copyright) e selo da marca. Os elementos que já
     existem (#splashTapHint, #splashPlayerId) são reaproveitados. */
  function setupPesLayout() {
    if (overlay.querySelector(".splash-info")) return;

    // vinheta logo depois dos slides (fica acima da foto e abaixo do texto)
    const vignette = document.createElement("div");
    vignette.className = "splash-vignette";
    const slidesWrap = overlay.querySelector(".splash-slides");
    if (slidesWrap) slidesWrap.insertAdjacentElement("afterend", vignette);
    else overlay.insertBefore(vignette, overlay.firstChild);

    // círculo de toque dentro do "toque pra entrar" (some junto com ele)
    if (tapHint && !tapHint.querySelector(".splash-ring")) {
      // se o hint for só texto, o texto vira o rótulo embaixo do círculo
      const label = tapHint.children.length ? "" : tapHint.textContent.trim();
      if (label) tapHint.textContent = "";
      const ring = document.createElement("span");
      ring.className = "splash-ring";
      tapHint.insertBefore(ring, tapHint.firstChild);
      if (label) {
        const lbl = document.createElement("span");
        lbl.className = "splash-tap-label";
        lbl.textContent = label;
        tapHint.appendChild(lbl);
      }
    }

    // informações do jogador: Seu ID / versão / copyright
    const info = document.createElement("div");
    info.className = "splash-info";
    if (idEl) info.appendChild(idEl); // move o elemento existente pra cá

    const ver = document.createElement("div");
    ver.className = "splash-version";
    ver.id = "splashVersion";
    ver.innerHTML = "Versão <b></b>";
    ver.querySelector("b").textContent = APP_VERSION;
    info.appendChild(ver);

    const copy = document.createElement("div");
    copy.className = "splash-copy";
    copy.textContent = APP_COPYRIGHT;
    info.appendChild(copy);
    overlay.appendChild(info);

    // selo da marca (canto superior direito)
    const brand = document.createElement("div");
    brand.className = "splash-brand";
    brand.innerHTML = '<div class="splash-brand-ring"></div><span class="splash-brand-name"></span>';
    brand.querySelector(".splash-brand-ring").textContent = BRAND_BADGE;
    brand.querySelector(".splash-brand-name").textContent = BRAND_NAME;
    overlay.appendChild(brand);
  }

  let current = 0;
  let timer = null;
  let started = false;

  function goToSlide(index) {
    slides.forEach((s, i) => s.classList.toggle("active", i === index));
    current = index;
  }

  function startCarousel() {
    if (slides.length <= 1) return;
    timer = setInterval(() => {
      goToSlide((current + 1) % slides.length);
    }, SLIDE_INTERVAL);
  }

  function stopCarousel() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function showMaintenance(endLabel) {
    stopCarousel();
    if (tapHint) tapHint.classList.add("hidden");
    if (loadingWrap) loadingWrap.classList.add("hidden");

    if (maintenanceWrap) {
      const endEl = maintenanceWrap.querySelector("#maintEndLabel");
      if (endEl) endEl.textContent = endLabel || MAINTENANCE_END_LABEL;
      maintenanceWrap.classList.remove("hidden");
    }
    // O overlay permanece visível — o app fica escondido atrás dele
    // até a manutenção terminar (MAINTENANCE_MODE = false, ou a janela
    // semanal automática passar da hora 0h de quinta).
  }

  // Tela de bloqueio pelo navegador, depois da data de corte da
  // migração — reaproveita o visual da tela de manutenção, mas com
  // texto próprio. Só libera quem estiver em MIGRATION_BYPASS_IDS
  // (localStorage/URL não liberam).
  function showMigrationLock() {
    stopCarousel();
    if (tapHint) tapHint.classList.add("hidden");
    if (loadingWrap) loadingWrap.classList.add("hidden");

    const lockWrap = document.getElementById("splashMigrationLock");
    if (lockWrap) {
      if (DOWNLOAD_APP_URL) {
        const btn = lockWrap.querySelector("#migrationLockDownloadBtn");
        if (btn) {
          btn.href = DOWNLOAD_APP_URL;
          btn.classList.remove("hidden");
        }
      }
      lockWrap.classList.remove("hidden");
    }
  }

  /* ---------- Menu hambúrguer (só dentro do app / Capacitor) ----------
     "Limpar cache" apaga os arquivos temporários já baixados neste
     dispositivo (Cache Storage + Service Worker), sem mexer na conta
     nem no progresso salvo. "Transferir dados" chama
     startDataTransferFlow(), definido em js/app-transfer.js (abre o
     seletor de conta Google nativo, igual no PES original). Criado
     dinamicamente aqui pra não poluir o index.html com algo que só
     existe dentro do app instalado. */
  async function clearAppCache() {
    const message =
      "Isso vai apagar os arquivos temporários do jogo já baixados neste dispositivo (imagens, sons etc.). Sua conta e seu progresso NÃO serão apagados.";
    const confirmed =
      typeof showConfirmDialog === "function"
        ? await showConfirmDialog("Limpar cache", message, "Limpar", "Cancelar")
        : confirm(message);
    if (!confirmed) return;

    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
    } catch (e) {
      console.warn("[splash] Falha ao limpar cache:", e);
    }

    location.reload();
  }

  function setupAppMenu() {
    if (document.getElementById("splashHamburgerBtn")) return;

    const btn = document.createElement("button");
    btn.id = "splashHamburgerBtn";
    btn.className = "splash-hamburger-btn";
    btn.setAttribute("aria-label", "Menu");
    // ícone de lista (pontos + linhas), igual ao botão de menu do PES
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="#fff">' +
      '<circle cx="3.5" cy="6" r="1.7"/><circle cx="3.5" cy="12" r="1.7"/><circle cx="3.5" cy="18" r="1.7"/>' +
      '<rect x="8" y="4.9" width="14" height="2.2" rx="1.1"/><rect x="8" y="10.9" width="14" height="2.2" rx="1.1"/>' +
      '<rect x="8" y="16.9" width="14" height="2.2" rx="1.1"/></g></svg>';

    const menu = document.createElement("div");
    menu.id = "splashHamburgerMenu";
    menu.className = "splash-hamburger-menu hidden";
    // "Transferir dados" só faz sentido dentro do app instalado (abre o
    // seletor de conta Google nativo) — no navegador nem aparece, pra
    // não deixar um botão "morto" na tela.
    menu.innerHTML = `
      <button type="button" class="splash-hamburger-item" id="splashClearCacheBtn">🧹 Limpar cache</button>
      ${isNativePlatform() ? '<button type="button" class="splash-hamburger-item" id="splashTransferDataBtn">🔄 Transferir dados</button>' : ""}`;

    overlay.appendChild(btn);
    overlay.appendChild(menu);

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      menu.classList.toggle("hidden");
    });
    document.addEventListener("click", (ev) => {
      if (!menu.contains(ev.target) && ev.target !== btn) menu.classList.add("hidden");
    });

    const clearCacheBtn = menu.querySelector("#splashClearCacheBtn");
    clearCacheBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      menu.classList.add("hidden");
      clearAppCache();
    });

    const transferBtn = menu.querySelector("#splashTransferDataBtn");
    if (transferBtn) {
      transferBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        menu.classList.add("hidden");
        if (typeof startDataTransferFlow === "function") startDataTransferFlow();
      });
    }
  }

  function enterApp() {
    if (started) return;
    // Bloqueia a entrada enquanto o update obrigatório de conteúdo
    // (js/content-update.js) ainda não terminou de baixar.
    if (typeof isContentUpdatePending === "function" && isContentUpdatePending()) return;
    started = true;

    stopCarousel();
    if (tapHint) tapHint.classList.add("hidden");
    if (loadingWrap) loadingWrap.classList.remove("hidden");

    setTimeout(() => {
      if (!isNativePlatform() && Date.now() > MIGRATION_CUTOFF_DATE.getTime() && !hasMigrationBypass()) {
        showMigrationLock();
        return;
      }
      if (MAINTENANCE_MODE && !hasBypass()) {
        showMaintenance(MAINTENANCE_END_LABEL);
        return;
      }
      if (isWeeklyMaintenanceActive() && !hasBypass()) {
        showMaintenance(WEEKLY_MAINTENANCE_END_LABEL);
        return;
      }
      overlay.classList.add("fade-out");
      // música de fundo só começa aqui, saindo da splash pro menu —
      // e de quebra aproveita esse toque como o "gesto do usuário"
      // que os navegadores exigem pra liberar áudio com autoplay.
      if (typeof initMusic === "function") initMusic();
      setTimeout(() => {
        overlay.classList.add("hidden");
      }, FADE_OUT_DURATION);
    }, LOADING_DURATION);
  }

  overlay.addEventListener("click", enterApp);
  overlay.addEventListener(
    "touchend",
    (e) => {
      // Se tiver update de conteúdo pendente (ou o toque foi em algum
      // botão/link dentro da splash, tipo o menu hambúrguer ou o botão
      // "Baixar agora"), não faz preventDefault aqui — senão cancela o
      // clique sintético que o próprio elemento tocado precisa receber.
      if (typeof isContentUpdatePending === "function" && isContentUpdatePending()) return;
      if (e.target.closest && e.target.closest("button, a")) return;
      e.preventDefault();
      enterApp();
    },
    { passive: false }
  );
  document.addEventListener("keydown", (e) => {
    if (!started && (e.key === "Enter" || e.key === " ")) enterApp();
  });

  startCarousel();
  setupPesLayout();
  setupAppMenu();
})();
