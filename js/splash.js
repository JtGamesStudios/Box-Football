/* ============ Splash Screen — carrossel + toque pra entrar ============
   - Troca a imagem de fundo a cada SLIDE_INTERVAL ms.
   - Ao tocar/clicar em qualquer lugar da splash, mostra um loading rápido
     e depois exibe a tela de MANUTENÇÃO (o app não é liberado enquanto
     MAINTENANCE_MODE estiver true).
   - Não depende de nenhum outro script do projeto: pode ficar antes ou
     depois dos demais <script> no index.html. */
(function () {
  const SLIDE_INTERVAL = 10000;   // troca de imagem a cada 10s
  const LOADING_DURATION = 1400;  // quanto tempo o loading fica visível
  const FADE_OUT_DURATION = 500;  // precisa bater com a transição no CSS

  // ---------------------------------------------------------------
  // MODO MANUTENÇÃO
  // Deixe true enquanto o servidor estiver em manutenção.
  // Quando quiser liberar o app de novo, é só voltar para false.
  // ---------------------------------------------------------------
  const MAINTENANCE_MODE = true;
  const MAINTENANCE_END_LABEL = "Quarta, 15/07 19:30";

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
  const BYPASS_STORAGE_FLAG = "boxclube_bypass_maintenance_v7";

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

  function enterApp() {
    if (started) return;
    started = true;

    stopCarousel();
    if (tapHint) tapHint.classList.add("hidden");
    if (loadingWrap) loadingWrap.classList.remove("hidden");

    setTimeout(() => {
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
})();
