/* =========================================================
   RANKING — integração com Firebase (Firestore) pro ranking
   global da Divisão. Usa autenticação anônima (sem senha/login,
   o próprio Firebase gera um UID estável por navegador) — é esse
   UID que vira o ID do documento em `players`, então as regras de
   segurança do Firestore conseguem garantir que cada um só edita
   o próprio registro.

   Coleção: players/{uid}
     { username, nationality, nationalityFlag, rating, wins, draws,
       losses, isBot, playerIdLocal, updatedAt }

   Se o Firebase falhar por qualquer motivo (sem internet, projeto
   mal configurado, etc), o app continua funcionando 100% offline
   como já funcionava antes — o ranking só fica "vazio/local".
   ========================================================= */

const RANKING_ENABLED = true; // liga/desliga toda a feature rapidamente

const firebaseConfig = {
  apiKey: "AIzaSyBWYJL7CaE_F54-p7xU4AQW7SkjlzcixLY",
  authDomain: "box-football-2021.firebaseapp.com",
  projectId: "box-football-2021",
  storageBucket: "box-football-2021.firebasestorage.app",
  messagingSenderId: "1004085155031",
  appId: "1:1004085155031:web:ef301ce0b4aba134c04c92",
};

let _rankingDb = null;
let _rankingUid = null;
let _rankingReady = null; // Promise resolvida quando auth + firestore estão prontos
let PAISES_BANDEIRAS = null;

function rankingLog(...args) {
  console.log("[ranking]", ...args);
}

/** Inicializa Firebase + login anônimo. Nunca lança erro pra fora —
 *  se algo falhar, o ranking simplesmente fica indisponível. */
function initRanking() {
  if (!RANKING_ENABLED) return Promise.resolve(false);
  if (_rankingReady) return _rankingReady;

  _rankingReady = new Promise((resolve) => {
    try {
      if (typeof firebase === "undefined") {
        rankingLog("SDK do Firebase não carregou (sem internet?), ranking desativado.");
        resolve(false);
        return;
      }
      firebase.initializeApp(firebaseConfig);
      _rankingDb = firebase.firestore();

      firebase.auth().onAuthStateChanged((user) => {
        if (user) {
          _rankingUid = user.uid;
          resolve(true);
        }
      });
      firebase.auth().signInAnonymously().catch((err) => {
        rankingLog("Falha no login anônimo:", err.message);
        resolve(false);
      });
    } catch (err) {
      rankingLog("Falha ao iniciar Firebase:", err.message);
      resolve(false);
    }
  });

  return _rankingReady;
}

async function loadPaisesBandeiras() {
  if (PAISES_BANDEIRAS) return PAISES_BANDEIRAS;
  const res = await fetch("data/paises-bandeiras.json");
  PAISES_BANDEIRAS = await res.json();
  return PAISES_BANDEIRAS;
}

/* ---------- Popup de cadastro de nome de usuário ---------- */

async function populateNationalitySelect() {
  const select = document.getElementById("nationalitySelect");
  if (!select) return;
  const paises = await loadPaisesBandeiras();
  const nomes = Object.keys(paises).sort((a, b) => a.localeCompare(b, "pt-BR"));
  select.innerHTML =
    `<option value="">Selecione seu país</option>` +
    nomes.map((n) => `<option value="${n}">${paises[n]} ${n}</option>`).join("");
}

function setUsernameError(msg) {
  const el = document.getElementById("usernameError");
  if (!el) return;
  if (!msg) {
    el.style.display = "none";
    el.textContent = "";
  } else {
    el.style.display = "block";
    el.textContent = msg;
  }
}

/** Mostra o popup de cadastro se o jogador ainda não tem username salvo. */
async function maybeShowUsernamePopup() {
  if (!RANKING_ENABLED) return;
  if (STATE.profile && STATE.profile.username) return; // já cadastrado

  const overlay = document.getElementById("usernameOverlay");
  if (!overlay) return;

  await populateNationalitySelect();
  overlay.classList.remove("hidden");
}

async function confirmUsername() {
  const input = document.getElementById("usernameInput");
  const select = document.getElementById("nationalitySelect");
  const username = (input.value || "").trim();
  const nationality = select.value;

  if (username.length < 3 || username.length > 16) {
    setUsernameError("O nome precisa ter entre 3 e 16 caracteres.");
    return;
  }
  if (!/^[A-Za-z0-9À-ÿ _.-]+$/.test(username)) {
    setUsernameError("Use apenas letras, números, espaço, ponto, traço ou underline.");
    return;
  }
  if (!nationality) {
    setUsernameError("Escolha sua nacionalidade.");
    return;
  }

  const btn = document.getElementById("usernameConfirmBtn");
  btn.disabled = true;
  setUsernameError("");

  try {
    const ready = await initRanking();
    if (ready) {
      // checa se o nome já está em uso por outro documento
      const taken = await _rankingDb
        .collection("players")
        .where("usernameLower", "==", username.toLowerCase())
        .limit(1)
        .get();
      if (!taken.empty && taken.docs[0].id !== _rankingUid) {
        setUsernameError("Esse nome já está em uso, escolha outro.");
        btn.disabled = false;
        return;
      }
    }

    const paises = await loadPaisesBandeiras();
    STATE.profile = {
      username,
      nationality,
      nationalityFlag: paises[nationality] || "🏳️",
      registeredAt: Date.now(),
    };
    persist();

    if (ready) await pushProfileToFirestore();

    document.getElementById("usernameOverlay").classList.add("hidden");
    if (typeof toast === "function") toast(`Bem-vindo, ${username}!`, "success");
    if (typeof renderCampaignLeaderboard === "function") renderCampaignLeaderboard();
  } catch (err) {
    rankingLog("Erro ao confirmar username:", err.message);
    setUsernameError("Não deu pra cadastrar agora — tenta de novo em instantes.");
  } finally {
    btn.disabled = false;
  }
}

/* ---------- Sincronização do rating com o Firestore ---------- */

async function pushProfileToFirestore() {
  if (!RANKING_ENABLED) return;
  if (!STATE.profile || !STATE.profile.username) return;
  const ready = await initRanking();
  if (!ready) return;

  const c = STATE.campaign;
  try {
    await _rankingDb.collection("players").doc(_rankingUid).set(
      {
        username: STATE.profile.username,
        usernameLower: STATE.profile.username.toLowerCase(),
        nationality: STATE.profile.nationality,
        nationalityFlag: STATE.profile.nationalityFlag,
        rating: c.rating,
        wins: c.wins,
        draws: c.draws,
        losses: c.losses,
        isBot: false,
        playerIdLocal: typeof getPlayerId === "function" ? getPlayerId() : null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    rankingLog("Falha ao sincronizar perfil:", err.message);
  }
}

/** Chamado depois de cada partida da Campanha (ver campaign.js).
 *  "Fire and forget" — nunca trava a UI do jogo esperando a rede. */
function syncRankingToFirebase() {
  if (!RANKING_ENABLED) return;
  if (!STATE.profile || !STATE.profile.username) return;
  pushProfileToFirestore().catch(() => {});
}

/* ---------- Leaderboard ---------- */

/** Busca todos os documentos de players e devolve ordenados por rating.
 *  Pra fase de testes (algumas centenas de registros) isso é simples e
 *  barato. Se a base crescer muito no futuro, troque por uma consulta
 *  paginada (orderBy + limit + startAfter) em vez de trazer tudo. */
async function fetchLeaderboard() {
  const ready = await initRanking();
  if (!ready) return null;
  try {
    const snap = await _rankingDb.collection("players").orderBy("rating", "desc").get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    rankingLog("Falha ao buscar leaderboard:", err.message);
    return null;
  }
}

function leaderboardRowHtml(entry, position, isMe) {
  return `<div class="leaderboard-row${isMe ? " me" : ""}">
    <span class="leaderboard-pos">#${position}</span>
    <span class="leaderboard-flag">${entry.nationalityFlag || "🏳️"}</span>
    <span class="leaderboard-name">${entry.username || "?"}</span>
    <span class="leaderboard-rating">${(entry.rating || 0).toLocaleString("pt-BR")}</span>
  </div>`;
}

/** Renderiza o bloco de ranking dentro da tela de Campanha.
 *  Mostra o Top 10 e, se o jogador não estiver nele, mostra a posição
 *  dele "grudada" embaixo. */
async function renderCampaignLeaderboard() {
  const wrap = document.getElementById("campLeaderboardList");
  if (!wrap) return;

  wrap.innerHTML = `<p class="page-sub" style="margin:0;">Carregando ranking...</p>`;

  const list = await fetchLeaderboard();
  if (!list) {
    wrap.innerHTML = `<p class="page-sub" style="margin:0;">Ranking indisponível no momento (sem conexão).</p>`;
    return;
  }
  if (!list.length) {
    wrap.innerHTML = `<p class="page-sub" style="margin:0;">Ainda não há ninguém no ranking.</p>`;
    return;
  }

  const top = list.slice(0, 10);
  let html = top.map((e, i) => leaderboardRowHtml(e, i + 1, e.id === _rankingUid)).join("");

  const myIndex = list.findIndex((e) => e.id === _rankingUid);
  if (myIndex >= 10) {
    html += `<div class="leaderboard-sep">···</div>`;
    html += leaderboardRowHtml(list[myIndex], myIndex + 1, true);
  }

  wrap.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("usernameConfirmBtn");
  if (btn) btn.onclick = confirmUsername;
});
