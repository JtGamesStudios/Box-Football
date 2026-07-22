/* ============ Splash Screen — carrossel + toque pra entrar ============
   - Troca a imagem de fundo a cada SLIDE_INTERVAL ms.
   - Ao tocar/clicar em qualquer lugar da splash, mostra um loading rápido
     e depois exibe a tela de MANUTENÇÃO (o app não é liberado enquanto
     MAINTENANCE_MODE estiver true).
   - Não depende de nenhum outro script pra funcionar (pode ficar antes
     ou depois dos demais <script> no index.html) — a única exceção é o
     menu "Transferir dados" (só existe dentro do app/Capacitor), que
     chama startDataTransferFlow() de js/app-transfer.js. */
(function () {
  const SLIDE_INTERVAL = 10000;   // troca de imagem a cada 10s
  const LOADING_DURATION = 1400;  // quanto tempo o loading fica visível
  const FADE_OUT_DURATION = 500;  // precisa bater com a transição no CSS

  // ---------------------------------------------------------------
  // MODO MANUTENÇÃO
  // Deixe true enquanto o servidor estiver em manutenção.
  // Quando quiser liberar o app de novo, é só voltar para false.
  // ---------------------------------------------------------------
  const MAINTENANCE_MODE = false;
  const MAINTENANCE_END_LABEL = "Terça, 21/07 21:30";

  // ---------------------------------------------------------------
  // MIGRAÇÃO PRO APP — a partir dessa data/hora (horário de Brasília),
  // o acesso pelo NAVEGADOR é bloqueado permanentemente (sem bypass).
  // Dentro do app instalado (Capacitor) esse bloqueio nunca se aplica.
  // ---------------------------------------------------------------
  const MIGRATION_CUTOFF_DATE = new Date("2026-07-30T23:59:00-03:00");
  const DOWNLOAD_APP_URL = ""; // preencher com o link do app (Play Store) quando disponível

  function isNativePlatform() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }

  // ---------------------------------------------------------------
  // ACESSO SECRETO (bypass da manutenção)
  // Troque "minha-chave-secreta" por algo só seu.
  // Pra entrar mesmo em manutenção, abra o link assim:
  //   https://seusite.com/?acesso=minha-chave-secreta
  // Uma vez usado, o navegador lembra (localStorage) e você não
  // precisa repetir o link nas próximas vezes — até apagar os dados
  // do site ou trocar de dispositivo/navegador.
  // ---------------------------------------------------------------
  const BYPASS_KEY = "pes2021mobile";
  const BYPASS_STORAGE_FLAG = "boxclube_bypass_maintenance_v8";

  function hasBypass() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("acesso") === BYPASS_KEY) {
        localStorage.setItem(BYPASS_STORAGE_FLAG, "1");
        return true;
      }
      return localStorage.getItem(BYPASS_STORAGE_FLAG) === "1";
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

  function showMaintenance() {
    stopCarousel();
    if (tapHint) tapHint.classList.add("hidden");
    if (loadingWrap) loadingWrap.classList.add("hidden");

    if (maintenanceWrap) {
      const endEl = maintenanceWrap.querySelector("#maintEndLabel");
      if (endEl) endEl.textContent = MAINTENANCE_END_LABEL;
      maintenanceWrap.classList.remove("hidden");
    }
    // O overlay permanece visível — o app fica escondido atrás dele
    // até a manutenção terminar (MAINTENANCE_MODE = false).
  }

  // Tela de bloqueio permanente pelo navegador, depois da data de corte
  // da migração — reaproveita o visual da tela de manutenção, mas com
  // texto próprio e SEM bypass nenhum (localStorage/URL não liberam).
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
     "Transferir dados" chama startDataTransferFlow(), definido em
     js/app-transfer.js. Criado dinamicamente aqui pra não poluir o
     index.html com algo que só existe dentro do app instalado. */
  function setupAppMenu() {
    if (!isNativePlatform()) return;
    if (document.getElementById("splashHamburgerBtn")) return;

    const btn = document.createElement("button");
    btn.id = "splashHamburgerBtn";
    btn.className = "splash-hamburger-btn";
    btn.setAttribute("aria-label", "Menu");
    btn.textContent = "☰";

    const menu = document.createElement("div");
    menu.id = "splashHamburgerMenu";
    menu.className = "splash-hamburger-menu hidden";
    menu.innerHTML = `<button type="button" class="splash-hamburger-item" id="splashTransferDataBtn">Transferir dados</button>`;

    overlay.appendChild(btn);
    overlay.appendChild(menu);

    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      menu.classList.toggle("hidden");
    });
    document.addEventListener("click", (ev) => {
      if (!menu.contains(ev.target) && ev.target !== btn) menu.classList.add("hidden");
    });

    const transferBtn = menu.querySelector("#splashTransferDataBtn");
    transferBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      menu.classList.add("hidden");
      if (typeof startDataTransferFlow === "function") startDataTransferFlow();
    });
  }

  function enterApp() {
    if (started) return;
    started = true;

    stopCarousel();
    if (tapHint) tapHint.classList.add("hidden");
    if (loadingWrap) loadingWrap.classList.remove("hidden");

    setTimeout(() => {
      if (!isNativePlatform() && Date.now() > MIGRATION_CUTOFF_DATE.getTime()) {
        showMigrationLock();
        return;
      }
      if (MAINTENANCE_MODE && !hasBypass()) {
        showMaintenance();
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
      e.preventDefault();
      enterApp();
    },
    { passive: false }
  );
  document.addEventListener("keydown", (e) => {
    if (!started && (e.key === "Enter" || e.key === " ")) enterApp();
  });

  startCarousel();
  setupAppMenu();
})();
