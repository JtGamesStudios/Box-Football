/* =========================================================
   SUPORTE A CONTROLE (Gamepad) — genérico, funciona no jogo
   inteiro sem precisar mexer tela por tela.

   IMPORTANTE: tudo aqui fica 100% INERTE enquanto nenhum controle
   está conectado — nenhum loop, nenhum observer, nenhum listener
   pesado roda antes do evento "gamepadconnected" disparar de
   verdade. Isso é essencial porque o app roda em TV box (hardware
   mais fraco) e qualquer coisa "sempre ligada" desde o carregamento
   da página pode travar a resposta a toque logo na tela inicial.

   Como funciona (só depois que um controle conecta):
   1) Toast "Controle conectado" e detecção Xbox/PlayStation pelo
      nome do dispositivo, pra escolher o conjunto de ícones certo.
   2) Cursor virtual movido pelo analógico esquerdo/D-pad — simula
      clique de verdade no elemento embaixo dele, então funciona em
      cima de QUALQUER tela sem precisar redesenhar cada uma.
   3) A/✕ = clicar. B/○ = "Voltar" (clica no botão de voltar da
      tela ou fecha o pop-up aberto).
   4) Barra fixa embaixo com o título da tela atual + os ícones
      válidos naquele momento.
   5) Nas partidas (Arena 2D / Vôlei de Praia), que já leem teclado
      (setas + Espaço + X), o controle "finge" ser teclado.
   Tudo isso é desligado (loop parado, observer desconectado, barra
   e cursor escondidos) assim que o controle desconecta.
   ========================================================= */

(function () {
  "use strict";

  if (!navigator.getGamepads) return; // dispositivo sem suporte — não faz nada

  /* ---------- Ícones (SVG embutido, sem depender de internet) ---------- */
  const ICONS = {
    xbox: {
      A: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#5CB85C"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#0b2e0b" font-family="Arial,Helvetica,sans-serif">A</text></svg>`,
      B: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#E6394F"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#3a0b0f" font-family="Arial,Helvetica,sans-serif">B</text></svg>`,
      X: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#198CFF"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#06213b" font-family="Arial,Helvetica,sans-serif">X</text></svg>`,
      Y: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#F2C94C"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#3a2e04" font-family="Arial,Helvetica,sans-serif">Y</text></svg>`,
      label: "Xbox"
    },
    ps: {
      A: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#2C3E50"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#7FD1E3" stroke-width="2" stroke-linecap="round"/></svg>`,
      B: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#2C3E50"/><circle cx="12" cy="12" r="6" fill="none" stroke="#E6394F" stroke-width="2"/></svg>`,
      X: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#2C3E50"/><rect x="7.5" y="7.5" width="9" height="9" fill="none" stroke="#F06FB6" stroke-width="2"/></svg>`,
      Y: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#2C3E50"/><path d="M12 6.5l5 8.5H7z" fill="none" stroke="#5CB85C" stroke-width="2"/></svg>`,
      label: "PlayStation"
    },
    generic: {
      A: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#8B95A6"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">1</text></svg>`,
      B: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#8B95A6"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">2</text></svg>`,
      X: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#8B95A6"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">3</text></svg>`,
      Y: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#8B95A6"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">4</text></svg>`,
      label: "Controle"
    }
  };

  const STICK_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#3a4356"/><circle cx="12" cy="12" r="5" fill="#c6cdda"/></svg>`;

  function detectBrand(id) {
    const s = (id || "").toLowerCase();
    if (s.includes("xbox") || s.includes("xinput") || s.includes("microsoft")) return "xbox";
    if (s.includes("playstation") || s.includes("dualshock") || s.includes("dualsense") || s.includes("sony") || s.includes("054c")) return "ps";
    return "generic";
  }

  let activeSet = ICONS.generic;
  let gpIndex = null;
  let rafId = null;
  let legendObserver = null;

  /* ---------- Estado do "teclado virtual" pra partidas (Arena 2D / Vôlei) ---------- */
  const virtualKeys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false, KeyX: false };
  function setVirtualKey(code, pressed) {
    if (virtualKeys[code] === pressed) return;
    virtualKeys[code] = pressed;
    window.dispatchEvent(new KeyboardEvent(pressed ? "keydown" : "keyup", { code, key: code, bubbles: true }));
  }
  function releaseAllVirtualKeys() {
    Object.keys(virtualKeys).forEach((code) => setVirtualKey(code, false));
  }

  /* ---------- Cursor virtual (mouse emulado pelo controle) ---------- */
  let cursorX = window.innerWidth / 2, cursorY = window.innerHeight / 2;
  let cursorEl = null;
  function ensureCursor() {
    if (cursorEl) return cursorEl;
    cursorEl = document.createElement("div");
    cursorEl.id = "gpCursor";
    cursorEl.className = "hidden";
    cursorEl.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l14 8-6 1.5L14 18 10.5 12 4 2z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    document.body.appendChild(cursorEl);
    return cursorEl;
  }
  function moveCursor(dx, dy) {
    cursorX = Math.max(4, Math.min(window.innerWidth - 4, cursorX + dx));
    cursorY = Math.max(4, Math.min(window.innerHeight - 4, cursorY + dy));
    ensureCursor().style.transform = `translate(${cursorX}px, ${cursorY}px)`;
  }
  function dispatchPointerAt(x, y, type) {
    const target = document.elementFromPoint(x, y);
    if (!target) return;
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0 }));
  }
  function clickAtCursor() {
    dispatchPointerAt(cursorX, cursorY, "mousedown");
    dispatchPointerAt(cursorX, cursorY, "mouseup");
    dispatchPointerAt(cursorX, cursorY, "click");
    cursorEl && cursorEl.classList.add("gp-cursor-click");
    setTimeout(() => cursorEl && cursorEl.classList.remove("gp-cursor-click"), 140);
  }

  /* ---------- Botão "Voltar" universal (B / ○) ---------- */
  function pressBack() {
    const closeSelectors = [
      ".novidades-overlay:not(.hidden) .novidades-close",
      ".wc-login-overlay:not(.hidden) .wc-login-close",
      ".search-overlay:not(.hidden) .event-play-close",
      ".cb-end-overlay:not(.hidden) #cbEndBtn",
      ".novidades-overlay:not(.hidden) .btn",
      ".wc-login-overlay:not(.hidden) .btn"
    ];
    for (const sel of closeSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) { el.click(); return; }
    }
    const backBtn = document.querySelector(".screen-back-btn");
    if (backBtn && backBtn.offsetParent !== null) { backBtn.click(); }
  }

  /* ---------- Barra de legenda (ícones + ação na tela atual) ---------- */
  let legendEl = null;
  function ensureLegend() {
    if (legendEl) return legendEl;
    legendEl = document.createElement("div");
    legendEl.id = "gpLegend";
    legendEl.className = "hidden";
    document.body.appendChild(legendEl);
    return legendEl;
  }
  function legendItem(iconHtml, label) {
    return `<span class="gp-legend-item"><span class="gp-legend-icon">${iconHtml}</span>${label}</span>`;
  }
  function updateLegend() {
    const el = ensureLegend();
    el.classList.remove("hidden");
    const activeScreen = document.querySelector(".screen.active");
    const title = activeScreen ? (activeScreen.dataset.title || "") : "";
    const hasBack = !!(
      document.querySelector(".novidades-overlay:not(.hidden)") ||
      document.querySelector(".wc-login-overlay:not(.hidden)") ||
      document.querySelector(".cb-end-overlay:not(.hidden)") ||
      document.querySelector(".screen-back-btn")
    );
    let html = `<span class="gp-legend-title">${title}</span>`;
    html += legendItem(STICK_ICON, "Mover cursor");
    html += legendItem(activeSet.A, "Selecionar");
    if (hasBack) html += legendItem(activeSet.B, "Voltar");
    el.innerHTML = html;
  }

  /* ---------- Toast "Controle conectado" ---------- */
  function showConnectToast(label) {
    const toast = document.createElement("div");
    toast.id = "gpToast";
    toast.innerHTML = `<span class="gp-toast-icon">🎮</span> Controle conectado — <b>${label}</b>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 400);
    }, 3200);
  }

  /* ---------- Loop principal do gamepad (só roda com controle conectado) ---------- */
  const DEADZONE = 0.22;
  const CURSOR_SPEED = 16;
  let prevButtons = [];

  function pollGamepad() {
    if (gpIndex === null) return; // desconectou — para o loop
    try {
      const pads = navigator.getGamepads();
      const pad = pads[gpIndex];
      if (pad) {
        let dx = 0, dy = 0;
        const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
        if (Math.abs(ax) > DEADZONE) dx = ax;
        if (Math.abs(ay) > DEADZONE) dy = ay;
        if (pad.buttons[14] && pad.buttons[14].pressed) dx = -1;
        if (pad.buttons[15] && pad.buttons[15].pressed) dx = 1;
        if (pad.buttons[12] && pad.buttons[12].pressed) dy = -1;
        if (pad.buttons[13] && pad.buttons[13].pressed) dy = 1;
        if (dx || dy) moveCursor(dx * CURSOR_SPEED, dy * CURSOR_SPEED);

        const ry = pad.axes[3] || 0, rx = pad.axes[2] || 0;
        if (Math.abs(ry) > DEADZONE) window.scrollBy(0, ry * 14);
        if (Math.abs(rx) > DEADZONE) window.scrollBy(rx * 14, 0);

        const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
        const wasBtn = (i) => !!prevButtons[i];

        if (btn(0) && !wasBtn(0)) clickAtCursor();
        if (btn(1) && !wasBtn(1)) pressBack();

        setVirtualKey("ArrowLeft", dx < -DEADZONE);
        setVirtualKey("ArrowRight", dx > DEADZONE);
        setVirtualKey("ArrowUp", btn(0) || dy < -DEADZONE);
        setVirtualKey("Space", btn(0));
        setVirtualKey("KeyX", btn(2));

        prevButtons = pad.buttons.map((b) => b.pressed);
      }
    } catch (e) {
      console.warn("[gamepad-controls] erro no loop, desligando:", e);
      stopGamepadFeatures();
      return;
    }
    rafId = requestAnimationFrame(pollGamepad);
  }

  function startGamepadFeatures(gamepad) {
    gpIndex = gamepad.index;
    activeSet = ICONS[detectBrand(gamepad.id)];
    document.documentElement.classList.add("gp-active");
    ensureCursor().classList.remove("hidden");
    updateLegend();
    showConnectToast(activeSet.label);

    if (!legendObserver) {
      legendObserver = new MutationObserver(() => updateLegend());
    }
    legendObserver.observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });

    if (rafId === null) rafId = requestAnimationFrame(pollGamepad);
  }

  function stopGamepadFeatures() {
    gpIndex = null;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    if (legendObserver) legendObserver.disconnect();
    document.documentElement.classList.remove("gp-active");
    if (cursorEl) cursorEl.classList.add("hidden");
    if (legendEl) legendEl.classList.add("hidden");
    releaseAllVirtualKeys();
  }

  window.addEventListener("gamepadconnected", (e) => startGamepadFeatures(e.gamepad));
  window.addEventListener("gamepaddisconnected", (e) => {
    if (e.gamepad && e.gamepad.index === gpIndex) stopGamepadFeatures();
  });

  /* ---------- Watchdog (fallback p/ Android) ----------
     Em muitos navegadores mobile (principalmente Chrome/Android com
     controle Bluetooth já pareado antes de abrir a página) o evento
     "gamepadconnected" simplesmente NUNCA dispara, mesmo com o
     controle 100% funcional e respondendo a getGamepads(). Sem esse
     evento, o resto do script (que é todo "preguiçoso" de propósito)
     nunca liga — por isso os botões pareciam não fazer nada.

     Esse watchdog roda um setInterval leve (não é loop de animação,
     não pesa no TV box) só para checar de tempos em tempos se existe
     algum gamepad conectado que o evento não avisou, e liga tudo
     manualmente nesse caso. Também serve de rede de segurança para
     detectar desconexão quando esse outro evento falha. */
  setInterval(() => {
    let pads;
    try {
      pads = navigator.getGamepads ? navigator.getGamepads() : [];
    } catch (e) {
      return;
    }
    if (!pads) return;

    // Controle plugado que o evento não avisou -> liga na mão.
    if (gpIndex === null) {
      for (let i = 0; i < pads.length; i++) {
        const pad = pads[i];
        if (pad && (pad.connected !== false)) {
          startGamepadFeatures(pad);
          break;
        }
      }
      return;
    }

    // Já conectado: confirma que ainda existe (rede de segurança
    // para o caso do "gamepaddisconnected" também não disparar).
    const stillThere = pads[gpIndex] && pads[gpIndex].connected !== false;
    if (!stillThere) stopGamepadFeatures();
  }, 800);
})();
