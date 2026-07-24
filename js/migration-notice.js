/* =========================================================
   MIGRATION NOTICE — aviso pra baixar o APK (SITE)
   =========================================================
   Arquivo independente, injetado direto no index.html: não é chamado
   por nenhum outro módulo, só observa a splash (pra aparecer depois
   que o jogador entra no jogo).

   Do dia de hoje até a DATA DE CORTE abaixo: popup informativo, não
   bloqueante, no máximo uma vez por dia/sessão (controlado via
   localStorage), avisando quem ainda está jogando pelo navegador que
   precisa baixar o app. Duas opções: "Já baixei" e "Baixar". Ao clicar
   em "Baixar", o download do APK começa na hora (o Android abre o
   instalador automaticamente assim que o arquivo termina de baixar —
   só falta o jogador tocar em "Instalar" na tela do sistema, isso o
   navegador não consegue pular). Depois de qualquer uma das duas
   opções, o aviso não aparece mais.

   Só é exibido no navegador (não dentro do app instalado via
   Capacitor).
   ========================================================= */

// ---------------------------------------------------------------
// CONFIGURAÇÃO — ajuste esses dois valores.
// ---------------------------------------------------------------

// DATA DE CORTE — a partir desse instante o jogo deixa de funcionar
// pelo navegador (ver também js/splash.js, que faz o bloqueio real).
const MIGRATION_NOTICE_CUTOFF = new Date("2026-07-30T23:59:00-03:00");

// LINK DO APK — troque pelo link real de download (seu servidor, um
// bucket, GitHub Releases etc). Precisa ser um link direto pro
// arquivo .apk, não uma página.
const MIGRATION_NOTICE_APK_URL = "assets/app/box-clube.apk";

// ---------------------------------------------------------------

const MIGRATION_NOTICE_STORAGE_KEY = "boxclube_migration_notice_last_shown";
const MIGRATION_NOTICE_DONE_KEY = "boxclube_migration_notice_done"; // "baixei" ou "baixando"

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

function _migrationNoticeIsDone() {
  try {
    return !!localStorage.getItem(MIGRATION_NOTICE_DONE_KEY);
  } catch (e) {
    return false;
  }
}

function _migrationNoticeMarkDone(status) {
  try {
    localStorage.setItem(MIGRATION_NOTICE_DONE_KEY, status);
  } catch (e) {
    /* ignora — não é crítico */
  }
}

/** Dispara o download do APK sem sair da página (link temporário com
 *  atributo download). No Android, assim que o download termina, o
 *  próprio sistema oferece a instalação automaticamente. */
function _migrationNoticeStartApkDownload() {
  const a = document.createElement("a");
  a.href = MIGRATION_NOTICE_APK_URL;
  a.download = "box-clube.apk";
  document.body.appendChild(a);
  a.click();
  a.remove();
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
      <div class="migration-countdown">Faltam ${days} dia${days === 1 ? "" : "s"}</div>

      <div style="margin-top:14px; padding:12px 14px; border-radius:12px; background:var(--surface-2); border:1px solid var(--border);">
        <p style="margin:0 0 6px; font-weight:700; font-size:13.5px; color:var(--text);">🔄 Transferência de dados</p>
        <p class="page-sub" style="margin:0; font-size:13px;">
          Seu progresso é vinculado à sua conta Google. Ao abrir o app pela
          primeira vez e entrar com a mesma conta, tudo ( plantel,
          moedas) é transferido automaticamente — não precisa recriar nada.
        </p>
      </div>

      <label style="display:flex; align-items:flex-start; gap:8px; margin-top:12px; font-size:12.5px; color:var(--text-muted); cursor:pointer;">
        <input type="checkbox" id="migrationNoticeAckCheck" style="margin-top:2px;">
        Entendi como funciona a transferência de dados
      </label>

      <div class="dialog-actions" style="margin-top:14px;">
        <button class="btn" id="migrationNoticeAlreadyBtn">Já baixei</button>
        <button class="btn btn-primary" id="migrationNoticeDownloadBtn" disabled>Baixar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();

  const ackCheck = overlay.querySelector("#migrationNoticeAckCheck");
  const downloadBtn = overlay.querySelector("#migrationNoticeDownloadBtn");
  ackCheck.onchange = () => {
    downloadBtn.disabled = !ackCheck.checked;
  };

  overlay.querySelector("#migrationNoticeCloseX").onclick = () => {
    _migrationNoticeMarkShownToday();
    close();
  };

  overlay.querySelector("#migrationNoticeAlreadyBtn").onclick = () => {
    _migrationNoticeMarkDone("ja-baixou");
    if (typeof toast === "function") toast("Show! Já pode jogar direto pelo app 👍", "success");
    close();
  };

  downloadBtn.onclick = () => {
    _migrationNoticeStartApkDownload();
    _migrationNoticeMarkDone("baixando");
    if (typeof toast === "function") {
      toast("Baixando o app… ao terminar, toque no arquivo pra instalar.", "success");
    }
    close();
  };
}

function _migrationNoticeMaybeShow() {
  if (_migrationNoticeIsNativeApp()) return; // dentro do app, não faz sentido avisar
  if (Date.now() > MIGRATION_NOTICE_CUTOFF.getTime()) return; // depois do corte quem cuida é a tela de bloqueio
  if (_migrationNoticeIsDone()) return; // já baixou ou já confirmou que baixou
  if (_migrationNoticeAlreadyShownToday()) return;

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
