/* =========================================================
   DIAGNÓSTICO TEMPORÁRIO DE CONTROLE
   Mostra, em tempo real, na tela:
   - Se a Gamepad API existe e algum controle foi detectado
   - Qualquer tecla (keydown) recebida pela página
   Isso serve só para descobrir o que o navegador está de fato
   enxergando quando você aperta um botão do controle — depois
   de resolver o problema, é só remover a linha
   <script src="js/gamepad-debug.js"></script> do index.html.
   ========================================================= */
(function () {
  "use strict";

  const box = document.createElement("div");
  box.id = "gpDebugBox";
  box.style.cssText = [
    "position:fixed", "top:6px", "left:6px", "right:6px",
    "z-index:999999", "background:rgba(0,0,0,.85)", "color:#0f0",
    "font:11px/1.4 monospace", "padding:8px 10px", "border-radius:8px",
    "max-height:40vh", "overflow:auto", "white-space:pre-wrap",
    "pointer-events:none"
  ].join(";");
  box.textContent = "Diagnóstico de controle carregando...";
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(box));
  if (document.body) document.body.appendChild(box);

  let lastKeyLine = "(nenhuma tecla recebida ainda)";
  let keyCount = 0;

  window.addEventListener("keydown", (e) => {
    keyCount++;
    lastKeyLine = `keydown #${keyCount}: code="${e.code}" key="${e.key}" target=${e.target.tagName}`;
  }, true);

  function render() {
    const hasApi = !!navigator.getGamepads;
    let padsLine = "sem suporte a Gamepad API neste WebView";
    if (hasApi) {
      const pads = navigator.getGamepads() || [];
      const found = [];
      for (let i = 0; i < pads.length; i++) {
        const p = pads[i];
        if (!p) continue;
        const pressed = p.buttons.map((b, idx) => (b.pressed ? idx : null)).filter((v) => v !== null);
        found.push(`#${i} id="${p.id}" botões_pressionados=[${pressed.join(",")}] eixos=[${p.axes.map((a) => a.toFixed(2)).join(",")}]`);
      }
      padsLine = found.length ? found.join("\n") : "nenhum gamepad detectado pela API (navigator.getGamepads() vazio)";
    }
    box.textContent =
      "== DIAGNÓSTICO DE CONTROLE ==\n" +
      "Gamepad API disponível: " + (hasApi ? "sim" : "NÃO") + "\n" +
      padsLine + "\n\n" +
      "Última tecla recebida (keydown):\n" + lastKeyLine;
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
