/* =========================================================
   MIGRATION NOTICE — aviso de migração pro app (SITE)
   =========================================================
   Arquivo independente, injetado direto no index.html: não é chamado
   por nenhum outro módulo, só observa a splash (pra aparecer depois
   que o jogador entra no jogo) e o estado de login do Firebase (pra
   saber se já vinculou a conta Google).

   Do dia de hoje até a DATA DE CORTE abaixo: popup informativo, não
   bloqueante, no máximo uma vez por dia/sessão (controlado via
   localStorage). Se a conta já estiver vinculada, não mostra o popup
   — só um aviso discreto.

   Depende de: js/ranking.js (initRanking), js/google-link.js
   (isGoogleLinked/linkGoogleAccount). Só é exibido no navegador (não
   dentro do app instalado via Capacitor).
   ========================================================= */

// ---------------------------------------------------------------
// DATA DE CORTE — a partir desse instante o jogo deixa de funcionar
// pelo navegador (ver também js/splash.js, que faz o bloqueio real).
// ---------------------------------------------------------------
const MIGRATION_NOTICE_CUTOFF = new Date("2026-07-30T23:59:00-03:00");

const MIGRATION_NOTICE_STORAGE_KEY = "boxclube_migration_notice_last_shown";

function _migrationNoticeIsNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function _migrationNoticeDaysLeft() {
  const diffMs = MIGRATION_NOTICE_CUTOFF.getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 86400000));
}

function _migrationNoticeTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function _migrationNoticeAlreadyShownToday() {
  try {
    return localStorage.getItem(MIGRATION_NOTICE_STORAGE_KEY) === _migrationNoticeTodayKey();
  } catch (e) {
    return false;
  }
}

function _migrationNoticeMarkShownToday() {
  try {
    localStorage.setItem(MIGRATION_NOTICE_STORAGE_KEY, _migrationNoticeTodayKey());
  } catch (e) {
    /* ignora — não é crítico */
  }
}

function _migrationNoticeBuildModal() {
  const overlay = document.createElement("div");
  overlay.className = "novidades-overlay";
  overlay.id = "migrationNoticeOverlay";

  const days = _migrationNoticeDaysLeft();

  overlay.innerHTML = `
    <div class="novidades-card">
      <div class="novidades-head">
        <h2>O Box Clube está virando app! 📱</h2>
        <button class="novidades-close" id="migrationNoticeCloseX" aria-label="Fechar">✕</button>
      </div>
      <p class="page-sub" style="margin:0 0 8px;">
        Estamos migrando o Box Clube pra um app Android. A partir de
        30/07/2026 não vai ser mais possível jogar pelo navegador —
        só pelo app.
      </p>
      <p class="page-sub" style="margin:0 0 8px;color:var(--crimson);font-weight:700;">
        Se você não vincular sua conta Google antes dessa data, seu
        progresso será perdido — não há como recuperar depois.
      </p>
      <div class="migration-countdown">Faltam ${days} dia${days === 1 ? "" : "s"}</div>
      <div class="dialog-actions" style="margin-top:14px;">
        <button class="btn" id="migrationNoticeLaterBtn">Lembrar depois</button>
        <button class="btn btn-primary" id="migrationNoticeLinkBtn">Vincular conta Google agora</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector("#migrationNoticeCloseX").onclick = () => {
    _migrationNoticeMarkShownToday();
    close();
  };
  overlay.querySelector("#migrationNoticeLaterBtn").onclick = () => {
    _migrationNoticeMarkShownToday();
    close();
  };
  overlay.querySelector("#migrationNoticeLinkBtn").onclick = async () => {
    close();
    if (typeof linkGoogleAccount === "function") await linkGoogleAccount();
    _migrationNoticeMarkShownToday();
  };
}

async function _migrationNoticeMaybeShow() {
  if (_migrationNoticeIsNativeApp()) return; // dentro do app, não faz sentido avisar
  if (Date.now() > MIGRATION_NOTICE_CUTOFF.getTime()) return; // depois do corte quem cuida é a tela de bloqueio
  if (_migrationNoticeAlreadyShownToday()) return;

  // espera o Firebase responder se a conta já está vinculada, sem
  // travar a exibição por muito tempo em caso de falha de rede.
  if (typeof initRanking === "function") {
    await Promise.race([initRanking(), new Promise((r) => setTimeout(r, 3000))]);
  }

  if (typeof isGoogleLinked === "function" && isGoogleLinked()) {
    _migrationNoticeMarkShownToday();
    if (typeof toast === "function") toast("Conta vinculada ✅ — baixe o app quando quiser.", "success");
    return;
  }

  _migrationNoticeBuildModal();
}

function _migrationNoticeInit() {
  const splash = document.getElementById("splashOverlay");
  if (!splash) {
    // sem splash na página, mostra direto (com um pequeno atraso)
    setTimeout(_migrationNoticeMaybeShow, 800);
    return;
  }

  if (splash.classList.contains("hidden")) {
    _migrationNoticeMaybeShow();
    return;
  }

  const observer = new MutationObserver(() => {
    if (splash.classList.contains("hidden")) {
      observer.disconnect();
      _migrationNoticeMaybeShow();
    }
  });
  observer.observe(splash, { attributes: true, attributeFilter: ["class"] });
}

document.addEventListener("DOMContentLoaded", _migrationNoticeInit);
