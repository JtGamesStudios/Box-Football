/* =========================================================
   CONTENT UPDATE — download obrigatório de conteúdo novo
   =========================================================
   Agora data/content-version.json guarda uma LISTA de updates
   ("updates": [...]), cada um com sua própria "releaseDate". O
   jogo baixa um update assim que a data dele chega — sem precisar
   publicar nada de novo naquele dia. Se a pessoa ficar dias sem
   abrir o jogo, ela recebe de uma vez só todos os updates que
   ficaram pendentes nesse meio tempo (não precisa abrir um por um).

   Pra publicar uma atualização nova, adicione um objeto na lista
   "updates" de data/content-version.json:
     - "version": um número maior que o do update anterior;
     - "releaseDate": ISO datetime — só passa a valer a partir
       dessa data/hora (pode deixar cadastrado com semanas de
       antecedência, ex: todo o calendário de agosto de uma vez);
     - "label": o texto que a pessoa vai ver no popup;
     - "assets": arquivos novos/pesados que valem pré-baixar
       (fotos de jogador, banners, vídeos etc.) — o tamanho do
       popup é calculado sozinho a partir desses arquivos.
   Arquivos "leves" (players.json, boxes, eventos, missões, cupons)
   já atualizam sozinhos a cada sessão — não precisam entrar aqui.

   IMPORTANTE: música NÃO deve entrar em "assets". As faixas tocam
   via <audio> normal (js/music.js) e não precisam de pré-download
   bloqueante — colocá-las aqui só deixaria o popup de update maior
   e mais lento sem necessidade.

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
      const raw = localStorage.getItem(VERSION_STORAGE_KEY);
      return raw === null ? 0 : Number(raw) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveVersion(version) {
    try {
      localStorage.setItem(VERSION_STORAGE_KEY, String(version));
    } catch (e) {
      /* ignora — não é crítico */
    }
  }

  // Pega só os updates cuja releaseDate já chegou, e que ainda não
  // foram baixados neste dispositivo (version > o que já foi salvo).
  function getPendingUpdates(manifest, savedVersion) {
    const all = Array.isArray(manifest.updates) ? manifest.updates : [];
    const now = Date.now();
    return all
      .filter((u) => u && typeof u.version === "number")
      .filter((u) => !u.releaseDate || new Date(u.releaseDate).getTime() <= now)
      .filter((u) => u.version > savedVersion)
      .sort((a, b) => a.version - b.version);
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

  async function runUpdateFlow(pendingUpdates) {
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

    // Se vários updates ficaram pendentes (pessoa sumiu um tempo), junta
    // tudo num download só, com o texto do update mais recente.
    const finalVersion = pendingUpdates[pendingUpdates.length - 1].version;
    const label = pendingUpdates[pendingUpdates.length - 1].label || "Novidades no Box-Football.";
    const assets = [];
    const seen = new Set();
    pendingUpdates.forEach((u) => {
      (Array.isArray(u.assets) ? u.assets : []).forEach((a) => {
        if (!seen.has(a)) {
          seen.add(a);
          assets.push(a);
        }
      });
    });

    if (labelEl) labelEl.textContent = label;
    if (sizeEl) sizeEl.textContent = "Calculando tamanho…";

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

      downloadAssets(assets, finalVersion, (downloaded) => {
        const pct = totalSize > 0 ? Math.min(100, Math.round((downloaded / totalSize) * 100)) : 100;
        if (fillEl) fillEl.style.width = pct + "%";
        if (statusEl) statusEl.textContent = `Baixando… ${formatBytes(downloaded)}${totalSize > 0 ? " / " + formatBytes(totalSize) : ""}`;
      })
        .then(() => {
          if (fillEl) fillEl.style.width = "100%";
          if (statusEl) statusEl.textContent = "Concluído!";
          saveVersion(finalVersion);
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
      const pendingUpdates = getPendingUpdates(manifest, saved);

      if (!pendingUpdates.length) {
        pending = false;
        return;
      }

      await runUpdateFlow(pendingUpdates);
    } catch (e) {
      // se não der pra checar (offline, arquivo ausente etc.), não trava
      // o jogo pra sempre — deixa entrar normalmente.
      console.warn("[content-update] Checagem de update falhou, liberando entrada:", e);
      pending = false;
    }
  }

  checkForUpdate();
})();
