/* ============ Splash Screen — carrossel + toque pra entrar ============
   - Troca a imagem de fundo a cada SLIDE_INTERVAL ms.
   - Ao tocar/clicar em qualquer lugar da splash, mostra um loading rápido
     e depois revela o app (que já está carregado por trás, como sempre foi).
   - Não depende de nenhum outro script do projeto: pode ficar antes ou
     depois dos demais <script> no index.html. */
(function () {
  const SLIDE_INTERVAL = 10000;   // troca de imagem a cada 10s
  const LOADING_DURATION = 1400;  // quanto tempo o loading fica visível
  const FADE_OUT_DURATION = 500;  // precisa bater com a transição no CSS

  const overlay = document.getElementById("splashOverlay");
  if (!overlay) return;

  const slides = Array.from(document.querySelectorAll(".splash-slide"));
  const tapHint = document.getElementById("splashTapHint");
  const loadingWrap = document.getElementById("splashLoading");

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

  function enterApp() {
    if (started) return;
    started = true;

    stopCarousel();
    if (tapHint) tapHint.classList.add("hidden");
    if (loadingWrap) loadingWrap.classList.remove("hidden");

    setTimeout(() => {
      overlay.classList.add("fade-out");
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
