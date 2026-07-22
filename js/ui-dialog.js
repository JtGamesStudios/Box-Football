/* =========================================================
   UI DIALOG — modal de confirmação/aviso genérico, reaproveitado por
   js/google-link.js, js/migration-notice.js e js/app-transfer.js.
   Reaproveita as classes visuais já existentes (.novidades-overlay /
   .novidades-card) pra manter o mesmo estilo do resto do jogo, sem
   depender de nenhum outro script (só cria e remove seu próprio DOM).
   ========================================================= */

function _uiDialogBuild(title, message, buttons) {
  const overlay = document.createElement("div");
  overlay.className = "novidades-overlay";

  const card = document.createElement("div");
  card.className = "novidades-card";

  const head = document.createElement("div");
  head.className = "novidades-head";
  head.innerHTML = `<h2>${title}</h2>`;
  card.appendChild(head);

  const msg = document.createElement("p");
  msg.className = "page-sub";
  msg.style.margin = "0 0 6px";
  msg.style.whiteSpace = "pre-line";
  msg.textContent = message;
  card.appendChild(msg);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  card.appendChild(actions);

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  return { overlay, actions };
}

/** Mostra um modal com um botão só (aviso informativo). Resolve a
 *  Promise quando o jogador fecha. */
function showInfoDialog(title, message, buttonText) {
  return new Promise((resolve) => {
    const { overlay, actions } = _uiDialogBuild(title, message);
    const btn = document.createElement("button");
    btn.className = "btn btn-primary";
    btn.textContent = buttonText || "Entendi";
    btn.onclick = () => {
      overlay.remove();
      resolve();
    };
    actions.appendChild(btn);
  });
}

/** Mostra um modal com Confirmar/Cancelar. Resolve `true`/`false`
 *  conforme a escolha do jogador. */
function showConfirmDialog(title, message, confirmText, cancelText) {
  return new Promise((resolve) => {
    const { overlay, actions } = _uiDialogBuild(title, message);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "btn";
    cancelBtn.textContent = cancelText || "Cancelar";
    cancelBtn.onclick = () => {
      overlay.remove();
      resolve(false);
    };

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "btn btn-primary";
    confirmBtn.textContent = confirmText || "Confirmar";
    confirmBtn.onclick = () => {
      overlay.remove();
      resolve(true);
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);
  });
}
