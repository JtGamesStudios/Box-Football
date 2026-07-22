/* =========================================================
   CONTENT UPDATE — download obrigatório de conteúdo novo
   =========================================================
   Compara data/content-version.json com a versão já baixada neste
   dispositivo (localStorage). Se for diferente (ou for a primeira
   vez), mostra um popup bloqueante na splash, ANTES do "Toque para
   começar", com o tamanho do download e uma barra de progresso — o
   jogo só libera depois que tudo for baixado com sucesso.

   Pra publicar uma atualização nova (ex: campanha com jogadores e
   Boxes novas), edite data/content-version.json:
     - bump o "version" (qualquer número diferente do anterior já
       dispara o popup pra quem já jogou antes);
     - troque o "label" pelo texto que a pessoa vai ver;
     - liste em "assets" os arquivos novos/pesados que valem a pena
       pré-baixar (fotos de jogador, banners, vídeos etc.) — o
       tamanho mostrado no popup é calculado sozinho a partir desses
       arquivos.
   Arquivos "leves" (jogadores.json, boxes, missões, cupons) já
   atualizam sozinhos a cada sessão — não precisam entrar aqui.

   Expõe isContentUpdatePending(), usado por js/splash.js pra não
   deixar a pessoa entrar no jogo enquanto o download não terminar.
   ========================================================= */
(function () {
  const VERSION_URL = "data/content-version.json";
  const VERSION_STORAGE_KEY = "boxclube_content_version";
  const CACHE_NAME_PREFIX = "boxclube-content-v";

  // Bloqueia a entrada até sabermos se precisa ou não de update —
  // evita alguém conseguir tocar "começar" antes da checagem terminar.
  let pending = true;

  window.isContentUpdatePending = function () {
    return pending;
  };

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "0 KB";
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function getSavedVersion() {
    try {
      return localStorage.getItem(VERSION_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function saveVersion(version) {
    try {
      localStorage.setItem(VERSION_STORAGE_KEY, String(version));
    } catch (e) {
      /* ignora — não é crítico */
    }
  }

  async function computeTotalSize(assets) {
    let total = 0;
    await Promise.all(
      assets.map(async (url) => {
        try {
          const res = await fetch(url, { method: "HEAD", cache: "no-store" });
          const len = parseInt(res.headers.get("content-length") || "0", 10);
          total += len || 0;
        } catch (e) {
          /* se o HEAD falhar, só não soma esse arquivo na estimativa */
        }
      })
    );
    return total;
  }

  async function downloadAssets(assets, version, onProgress) {
    let cache = null;
    if (window.caches && caches.open) {
      cache = await caches.open(CACHE_NAME_PREFIX + version);
    }
    let downloaded = 0;
    for (const url of assets) {
      const res = await fetch(url, { cache: "reload" });
      if (!res.ok) throw new Error("Falha ao baixar " + url);
      const len = parseInt(res.headers.get("content-length") || "0", 10);
      if (cache) {
        try {
          await cache.put(url, res.clone());
        } catch (e) {
          /* segue o baile mesmo se não conseguir guardar no cache */
        }
      }
      downloaded += len || 0;
      onProgress(downloaded);
    }
    return downloaded;
  }

  function showUpdateOverlay() {
    const overlay = document.getElementById("splashContentUpdate");
    if (overlay) overlay.classList.remove("hidden");
    return overlay;
  }

  function hideUpdateOverlay() {
    const overlay = document.getElementById("splashContentUpdate");
    if (overlay) overlay.classList.add("hidden");
  }

  async function runUpdateFlow(manifest) {
    const overlay = showUpdateOverlay();
    if (!overlay) {
      // sem overlay na página (não deveria acontecer) — não trava o jogo
      pending = false;
      return;
    }

    const labelEl = document.getElementById("contentUpdateLabel");
    const sizeEl = document.getElementById("contentUpdateSize");
    const fillEl = document.getElementById("contentUpdateFill");
    const statusEl = document.getElementById("contentUpdateStatus");
    const btn = document.getElementById("contentUpdateBtn");

    if (labelEl) labelEl.textContent = manifest.label || "Novidades no Box-Football.";
    if (sizeEl) sizeEl.textContent = "Calculando tamanho…";

    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    const totalSize = await computeTotalSize(assets);
    if (sizeEl) {
      sizeEl.textContent = totalSize > 0 ? `Tamanho: ${formatBytes(totalSize)}` : "Atualização leve — poucos KB.";
    }

    function startDownload() {
      if (btn) {
        btn.disabled = true;
        btn.textContent = "Baixando…";
      }
      if (statusEl) statusEl.textContent = "Baixando, não feche o jogo…";

      downloadAssets(assets, manifest.version, (downloaded) => {
        const pct = totalSize > 0 ? Math.min(100, Math.round((downloaded / totalSize) * 100)) : 100;
        if (fillEl) fillEl.style.width = pct + "%";
        if (statusEl) statusEl.textContent = `Baixando… ${formatBytes(downloaded)}${totalSize > 0 ? " / " + formatBytes(totalSize) : ""}`;
      })
        .then(() => {
          if (fillEl) fillEl.style.width = "100%";
          if (statusEl) statusEl.textContent = "Concluído!";
          saveVersion(manifest.version);
          pending = false;
          setTimeout(hideUpdateOverlay, 400);
        })
        .catch((err) => {
          console.warn("[content-update] Falha no download:", err);
          if (statusEl) statusEl.textContent = "Não deu pra baixar agora. Verifique sua conexão e tente de novo.";
          if (btn) {
            btn.disabled = false;
            btn.textContent = "⬇️ Tentar novamente";
          }
        });
    }

    if (btn) btn.onclick = startDownload;
  }

  async function checkForUpdate() {
    try {
      const res = await fetch(VERSION_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("content-version.json indisponível");
      const manifest = await res.json();

      const saved = getSavedVersion();
      const isNew = saved === null || String(manifest.version) !== saved;

      if (!isNew) {
        pending = false;
        return;
      }

      await runUpdateFlow(manifest);
    } catch (e) {
      // se não der pra checar (offline, arquivo ausente etc.), não trava
      // o jogo pra sempre — deixa entrar normalmente.
      console.warn("[content-update] Checagem de update falhou, liberando entrada:", e);
      pending = false;
    }
  }

  checkForUpdate();
})();
