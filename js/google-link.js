/* =========================================================
   GOOGLE LINK — vincular conta Google à sessão anônima (SITE)
   =========================================================
   Permite ao jogador vincular uma conta Google ao uid anônimo atual
   (linkWithPopup), preservando 100% do progresso e ranking já
   existentes. É totalmente OPCIONAL — quem não vincular continua
   jogando anônimo exatamente como sempre.

   Caso a conta Google escolhida já esteja vinculada em outro
   navegador/aparelho, o Firebase recusa o link
   ("auth/credential-already-in-use") — nesse caso oferecemos a opção
   de ENTRAR com essa conta e trazer o progresso de lá pra cá
   (respeitando o limite de transferências, ver js/transfer-limit.js).

   Depende de: js/ranking.js (initRanking), js/ui-dialog.js
   (showConfirmDialog/showInfoDialog), js/transfer-limit.js
   (checkTransferLimit/incrementTransferCount/formatResetDate),
   js/cloud-save.js (saveStateToCloud/loadStateFromCloud).
   ========================================================= */

function googleLinkLog(...args) {
  console.log("[google-link]", ...args);
}

function isGoogleLinked() {
  const user = firebase.auth && firebase.auth().currentUser;
  if (!user) return false;
  return user.providerData.some((p) => p.providerId === "google.com");
}

function getGoogleEmail() {
  const user = firebase.auth && firebase.auth().currentUser;
  if (!user) return null;
  const gp = user.providerData.find((p) => p.providerId === "google.com");
  return (gp && gp.email) || user.email || null;
}

/** Fluxo completo de "entrar com uma conta Google já vinculada noutro
 *  aparelho e trazer o progresso de lá pra cá" — respeita o limite
 *  mensal de transferências (Parte E). */
async function _mergeWithExistingGoogleAccount(credential) {
  const confirmed = await showConfirmDialog(
    "Conta já vinculada em outro aparelho",
    "Essa conta Google já está vinculada em outro aparelho. Deseja entrar com ela e trazer os dados de lá pra cá? Isso vai substituir o progresso deste navegador.",
    "Entrar e trazer dados",
    "Cancelar"
  );
  if (!confirmed) return;

  try {
    const result = await firebase.auth().signInWithCredential(credential);
    const uid = result.user.uid;

    const limit = await checkTransferLimit(uid);
    if (!limit.permitido) {
      await showInfoDialog(
        "Limite de transferências atingido",
        `Você atingiu o limite de 10 transferências neste mês. Ele reseta em ${formatResetDate(limit.resetaEm)}.`
      );
      return;
    }

    const cloudSave = await loadStateFromCloud(uid);
    if (!cloudSave) {
      googleLinkLog("Nenhum save encontrado na nuvem pra essa conta.");
      return;
    }

    localStorage.setItem(SAVE_KEY, JSON.stringify(cloudSave));
    await incrementTransferCount(uid);
    location.reload();
  } catch (err) {
    googleLinkLog("Falha ao entrar com a conta Google já vinculada:", err.message);
    if (typeof toast === "function") {
      toast("Não deu pra entrar com essa conta agora. Tenta de novo em instantes.", "");
    }
  }
}

/** Ponto de entrada do botão "Vincular conta Google". */
async function linkGoogleAccount() {
  try {
    const ready = await initRanking();
    if (!ready) {
      if (typeof toast === "function") toast("Sem conexão no momento. Tenta de novo em instantes.", "");
      return;
    }

    if (isGoogleLinked()) return; // já vinculado, nada a fazer

    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().currentUser.linkWithPopup(provider);

    await saveStateToCloud();
    if (typeof toast === "function") toast("Conta Google vinculada com sucesso!", "success");
    renderGoogleLinkUI();
  } catch (err) {
    if (err && err.code === "auth/credential-already-in-use") {
      await _mergeWithExistingGoogleAccount(err.credential);
      return;
    }
    googleLinkLog("Falha ao vincular conta Google:", err && err.message);
    if (typeof toast === "function") {
      toast("Não deu pra vincular a conta agora. Tenta de novo em instantes.", "");
    }
  }
}

/* ---------- UI: Configurações + selo discreto na splash ---------- */

function renderGoogleLinkUI() {
  const statusEl = document.getElementById("googleLinkStatus");
  const btnEl = document.getElementById("googleLinkBtn");
  if (statusEl && btnEl) {
    if (isGoogleLinked()) {
      statusEl.textContent = `Vinculado como ${getGoogleEmail() || "conta Google"}`;
      btnEl.classList.add("hidden");
    } else {
      statusEl.textContent = "Sua conta ainda não está vinculada.";
      btnEl.classList.remove("hidden");
    }
  }

  // Selo discreto perto do "Seu ID" na splash, criado dinamicamente pra
  // não depender de editar js/splash.js.
  const splashId = document.getElementById("splashPlayerId");
  if (splashId && !document.getElementById("splashGoogleStatus")) {
    const el = document.createElement("div");
    el.id = "splashGoogleStatus";
    el.className = "splash-id";
    splashId.insertAdjacentElement("afterend", el);
  }
  const splashStatus = document.getElementById("splashGoogleStatus");
  if (splashStatus) {
    splashStatus.textContent = isGoogleLinked() ? "Conta Google vinculada ✅" : "";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("googleLinkBtn");
  if (btn) btn.onclick = linkGoogleAccount;

  initRanking().then(() => {
    renderGoogleLinkUI();
    firebase.auth().onAuthStateChanged(() => renderGoogleLinkUI());
  });
});
