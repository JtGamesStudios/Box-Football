/* =========================================================
   DIAGNÓSTICO DE CONTROLE (Gamepad) — ferramenta de suporte.

   Diferente de js/gamepad-controls.js (que fica 100% inerte até
   detectar um controle de verdade), este painel roda SEMPRE que
   aberto manualmente em Configurações > "🎮 Testar Controle", pra
   mostrar o estado cru da Gamepad API no aparelho — inclusive se
   ela nem existir no WebView. Isso serve pra diagnosticar por que
   um controle não é detectado, sem precisar adivinhar.
   ========================================================= */
(function () {
  "use strict";

  let diagInterval = null;
  let connectedCount = 0;
  let disconnectedCount = 0;

  window.addEventListener("gamepadconnected", () => { connectedCount++; });
  window.addEventListener("gamepaddisconnected", () => { disconnectedCount++; });

  function renderDiag() {
    const body = document.getElementById("gpDiagBody");
    if (!body) return;

    const hasApi = typeof navigator.getGamepads === "function";
    let html = "";
    html += `<div class="gp-diag-line"><b>Gamepad API existe?</b> ${hasApi ? "✅ SIM" : "❌ NÃO — o WebView não suporta"}</div>`;
    html += `<div class="gp-diag-line"><b>Evento gamepadconnected disparou:</b> ${connectedCount}x</div>`;
    html += `<div class="gp-diag-line"><b>Evento gamepaddisconnected disparou:</b> ${disconnectedCount}x</div>`;

    if (hasApi) {
      let pads = [];
      try { pads = navigator.getGamepads() || []; } catch (e) {
        html += `<div class="gp-diag-line gp-diag-err"><b>Erro ao chamar getGamepads():</b> ${e.message}</div>`;
      }
      const found = Array.from(pads).filter(Boolean);
      html += `<div class="gp-diag-line"><b>Controles detectados agora:</b> ${found.length}</div>`;
      if (!found.length) {
        html += `<div class="gp-diag-line gp-diag-warn">Nenhum controle no array. Aperte QUALQUER botão do controle agora — em muitos aparelhos Android o controle só aparece aqui DEPOIS do primeiro botão apertado.</div>`;
      }
      found.forEach((pad) => {
        const pressed = pad.buttons.map((b, i) => (b.pressed ? i : null)).filter((v) => v !== null);
        const axes = pad.axes.map((a) => a.toFixed(2)).join(", ");
        html += `<div class="gp-diag-pad">
          <div><b>#${pad.index}</b> — ${pad.id || "(sem nome)"}</div>
          <div>Conectado: ${pad.connected !== false ? "sim" : "não"}</div>
          <div>Botões: ${pad.buttons.length} | Eixos: ${pad.axes.length}</div>
          <div>Botões pressionados agora: ${pressed.length ? pressed.join(", ") : "—"}</div>
          <div>Eixos: ${axes}</div>
        </div>`;
      });
    }

    html += `<div class="gp-diag-line gp-diag-ua"><b>WebView (User-Agent):</b><br>${navigator.userAgent}</div>`;
    body.innerHTML = html;
  }

  function openGamepadDiag() {
    const overlay = document.getElementById("gpDiagOverlay");
    if (!overlay) return;
    overlay.classList.remove("hidden");
    connectedCount = 0;
    disconnectedCount = 0;
    renderDiag();
    if (diagInterval) clearInterval(diagInterval);
    diagInterval = setInterval(renderDiag, 250);
  }

  function closeGamepadDiag() {
    const overlay = document.getElementById("gpDiagOverlay");
    if (overlay) overlay.classList.add("hidden");
    if (diagInterval) { clearInterval(diagInterval); diagInterval = null; }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const openBtn = document.getElementById("btnGamepadDiag");
    const closeBtn = document.getElementById("gpDiagCloseBtn");
    if (openBtn) openBtn.addEventListener("click", openGamepadDiag);
    if (closeBtn) closeBtn.addEventListener("click", closeGamepadDiag);
  });
})();
