/* =========================================================
   SUPORTE A CONTROLE (Gamepad) — genérico, funciona no jogo
   inteiro sem precisar mexer tela por tela.

   Como funciona:
   1) Detecta quando um controle conecta/desconecta (toast na tela).
   2) Descobre se é Xbox ou PlayStation pelo nome do dispositivo e
      escolhe o conjunto de ícones certo (dá pra "misturar": cada
      controle plugado usa o próprio conjunto, na hora).
   3) Cria um CURSOR VIRTUAL na tela, movido pelo analógico
      esquerdo/D-pad — ele funciona em cima de QUALQUER botão do
      jogo (menus, escalação, loja, partidas, etc.) porque simula
      clique/toque de verdade no elemento que está embaixo dele.
      Isso evita ter que redesenhar cada tela uma por uma.
   4) Botão A/✕ = clicar. Botão B/○ = "Voltar" (clica sozinho no
      botão de voltar da tela, ou fecha o pop-up/modal aberto).
   5) Barra fixa embaixo mostra os ícones + o que cada botão faz
      na tela atual (o rótulo troca sozinho com base no título
      de cada <section class="screen" data-title="..."> e em
      quais ações realmente existem naquele momento).
   6) Nas partidas (Arena 2D / Vôlei de Praia), que já leem
      teclado (setas + Espaço + X), o controle "finge" ser teclado
      — assim funciona sem tocar no motor de física dos jogos.
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Ícones (SVG embutido, sem depender de internet) ---------- */
  const ICONS = {
    xbox: {
      A: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#5CB85C"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#0b2e0b" font-family="Arial,Helvetica,sans-serif">A</text></svg>`,
      B: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#E6394F"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#3a0b0f" font-family="Arial,Helvetica,sans-serif">B</text></svg>`,
      X: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#198CFF"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#06213b" font-family="Arial,Helvetica,sans-serif">X</text></svg>`,
      Y: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#F2C94C"/><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="700" fill="#3a2e04" font-family="Arial,Helvetica,sans-serif">Y</text></svg>`,
      LB: "LB", RB: "RB", LT: "LT", RT: "RT", START: "☰", SELECT: "⧉",
      label: "Xbox"
    },
    ps: {
      A: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#2C3E50"/><path d="M8.5 8.5l7 7M15.5 8.5l-7 7" stroke="#7FD1E3" stroke-width="2" stroke-linecap="round"/></svg>`,
      B: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#2C3E50"/><circle cx="12" cy="12" r="6" fill="none" stroke="#E6394F" stroke-width="2"/></svg>`,
      X: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#2C3E50"/><rect x="7.5" y="7.5" width="9" height="9" fill="none" stroke="#F06FB6" stroke-width="2"/></svg>`,
      Y: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#2C3E50"/><path d="M12 6.5l5 8.5H7z" fill="none" stroke="#5CB85C" stroke-width="2"/></svg>`,
      LB: "L1", RB: "R1", LT: "L2", RT: "R2", START: "OPT", SELECT: "SHARE",
      label: "PlayStation"
    },
    generic: {
      A: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#8B95A6"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">1</text></svg>`,
      B: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#8B95A6"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">2</text></svg>`,
      X: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#8B95A6"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">3</text></svg>`,
      Y: `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#8B95A6"/><text x="12" y="16.5" text-anchor="middle" font-size="11" font-weight="700" fill="#fff" font-family="Arial,Helvetica,sans-serif">4</text></svg>`,
      LB: "L1", RB: "R1", LT: "L2", RT: "R2", START: "☰", SELECT: "⧉",
      label: "Controle"
    }
  };

  const STICK_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="12" cy="12" r="11" fill="#3a4356"/><circle cx="12" cy="12" r="5" fill="#c6cdda"/></svg>`;
  const DPAD_ICON = `<svg viewBox="0 0 24 24" width="18" height="18"><rect x="9" y="2" width="6" height="20" rx="1.5" fill="#3a4356"/><rect x="2" y="9" width="20" height="6" rx="1.5" fill="#3a4356"/></svg>`;

  function detectBrand(id) {
    const s = (id || "").toLowerCase();
    if (s.includes("xbox") || s.includes("xinput") || s.includes("microsoft")) return "xbox";
    if (s.includes("playstation") || s.includes("dualshock") || s.includes("dualsense") || s.includes("sony") || s.includes("054c")) return "ps";
    return "generic";
  }

  let activeSet = ICONS.generic;
  let gpConnected = false;
  let gpIndex = null;
  let lastInputTime = 0;

  /* ---------- Estado do "teclado virtual" pra partidas (Arena 2D / Vôlei) ---------- */
  const virtualKeys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, Space: false, KeyX: false };
  function setVirtualKey(code, pressed) {
    if (virtualKeys[code] === pressed) return;
    virtualKeys[code] = pressed;
    const evt = new KeyboardEvent(pressed ? "keydown" : "keyup", { code, key: code, bubbles: true });
    window.dispatchEvent(evt);
  }

  /* ---------- Cursor virtual (mouse emulado pelo controle) ---------- */
  let cursorX = window.innerWidth / 2, cursorY = window.innerHeight / 2;
  let cursorEl = null;
  function ensureCursor() {
    if (cursorEl) return cursorEl;
    cursorEl = document.createElement("div");
    cursorEl.id = "gpCursor";
    cursorEl.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l14 8-6 1.5L14 18 10.5 12 4 2z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    document.body.appendChild(cursorEl);
    return cursorEl;
  }
  function moveCursor(dx, dy) {
    cursorX = Math.max(4, Math.min(window.innerWidth - 4, cursorX + dx));
    cursorY = Math.max(4, Math.min(window.innerHeight - 4, cursorY + dy));
    const el = ensureCursor();
    el.style.transform = `translate(${cursorX}px, ${cursorY}px)`;
  }
  function showCursor(show) {
    const el = ensureCursor();
    el.classList.toggle("hidden", !show);
  }

  function dispatchPointerAt(x, y, type) {
    const target = document.elementFromPoint(x, y);
    if (!target) return null;
    const opts = { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window, button: 0 };
    target.dispatchEvent(new MouseEvent(type, opts));
    return target;
  }
  function clickAtCursor() {
    const target = document.elementFromPoint(cursorX, cursorY);
    if (!target) return;
    dispatchPointerAt(cursorX, cursorY, "mousedown");
    dispatchPointerAt(cursorX, cursorY, "mouseup");
    dispatchPointerAt(cursorX, cursorY, "click");
    cursorEl && cursorEl.classList.add("gp-cursor-click");
    setTimeout(() => cursorEl && cursorEl.classList.remove("gp-cursor-click"), 140);
  }

  /* ---------- Botão "Voltar" universal (B / ○) ---------- */
  function pressBack() {
    // 1) pop-ups/diálogos conhecidos (ui-dialog.js, migração, login, etc.)
    const closeSelectors = [
      ".novidades-overlay:not(.hidden) .novidades-close",
      ".wc-login-overlay:not(.hidden) .wc-login-close",
      ".search-overlay:not(.hidden) .event-play-close",
      ".cb-end-overlay:not(.hidden) #cbEndBtn"
    ];
    for (const sel of closeSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) { el.click(); return; }
    }
    // 2) qualquer overlay visível com um único botão óbvio de fechar
    const genericClose = document.querySelector(
      ".novidades-overlay:not(.hidden) .btn, .wc-login-overlay:not(.hidden) .btn"
    );
    if (genericClose && genericClose.offsetParent !== null) { genericClose.click(); return; }
    // 3) botão "‹ Voltar" da tela atual (nav.js)
    const backBtn = document.querySelector(".screen-back-btn");
    if (backBtn && backBtn.offsetParent !== null) { backBtn.click(); return; }
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
    if (!gpConnected) { el.classList.add("hidden"); return; }
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

  /* Atualiza a legenda sempre que a tela muda (troca de .active) ou um
     overlay aparece/some — sem precisar alterar nav.js. */
  const legendObserver = new MutationObserver(() => updateLegend());
  legendObserver.observe(document.body, { attributes: true, attributeFilter: ["class"], subtree: true });

  /* ---------- Toast "Controle conectado" ---------- */
  function showConnectToast(brand, label) {
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

  /* ---------- Loop principal do gamepad ---------- */
  const DEADZONE = 0.22;
  const CURSOR_SPEED = 16;
  let prevButtons = [];

  function pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = gpIndex !== null ? pads[gpIndex] : null;
    if (pad) {
      // Analógico esquerdo / D-pad → cursor virtual
      let dx = 0, dy = 0;
      const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
      if (Math.abs(ax) > DEADZONE) dx = ax;
      if (Math.abs(ay) > DEADZONE) dy = ay;
      if (pad.buttons[14] && pad.buttons[14].pressed) dx = -1; // D-pad esquerda
      if (pad.buttons[15] && pad.buttons[15].pressed) dx = 1;  // D-pad direita
      if (pad.buttons[12] && pad.buttons[12].pressed) dy = -1; // D-pad cima
      if (pad.buttons[13] && pad.buttons[13].pressed) dy = 1;  // D-pad baixo
      if (dx || dy) { moveCursor(dx * CURSOR_SPEED, dy * CURSOR_SPEED); lastInputTime = performance.now(); }

      // Analógico direito → rolagem da página
      const rx = pad.axes[2] || 0, ry = pad.axes[3] || 0;
      if (Math.abs(ry) > DEADZONE) window.scrollBy(0, ry * 14);
      if (Math.abs(rx) > DEADZONE) window.scrollBy(rx * 14, 0);

      // Botões
      const btn = (i) => !!(pad.buttons[i] && pad.buttons[i].pressed);
      const wasBtn = (i) => !!prevButtons[i];

      if (btn(0) && !wasBtn(0)) clickAtCursor();          // A / ✕
      if (btn(1) && !wasBtn(1)) pressBack();               // B / ○

      // Gameplay (Arena 2D / Vôlei de Praia): finge ser teclado
      setVirtualKey("ArrowLeft", dx < -DEADZONE);
      setVirtualKey("ArrowRight", dx > DEADZONE);
      setVirtualKey("ArrowUp", btn(0) || dy < -DEADZONE);
      setVirtualKey("Space", btn(0));
      setVirtualKey("KeyX", btn(2));

      prevButtons = pad.buttons.map(b => b.pressed);
    }
    requestAnimationFrame(pollGamepad);
  }
  requestAnimationFrame(pollGamepad);

  window.addEventListener("gamepadconnected", (e) => {
    gpConnected = true;
    gpIndex = e.gamepad.index;
    const brand = detectBrand(e.gamepad.id);
    activeSet = ICONS[brand];
    document.documentElement.classList.add("gp-active");
    showCursor(true);
    showConnectToast(brand, activeSet.label);
    updateLegend();
  });

  window.addEventListener("gamepaddisconnected", () => {
    gpConnected = false;
    gpIndex = null;
    document.documentElement.classList.remove("gp-active");
    showCursor(false);
    updateLegend();
  });

  document.addEventListener("DOMContentLoaded", () => {
    ensureCursor();
    ensureLegend();
    showCursor(false);
  });
})();
