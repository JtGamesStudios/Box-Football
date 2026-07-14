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
const RANKING_FULL_PAGE_SIZE = 200; // quantas linhas a tela "Ranking Global" carrega de uma vez

/* ---------- Avatar de perfil (5 opções fixas, ilustrativas) ----------
   As imagens ficam em assets/avatars/avatar1.png ... avatar5.png — troque
   pelos seus arquivos. Se um perfil (bot antigo, por ex.) não tiver a
   propriedade `avatar`, cai no avatar1 como padrão. */
const AVATAR_COUNT = 5;
const AVATAR_BASE_PATH = "assets/avatars/";

function avatarUrl(n) {
  const num = Number(n) >= 1 && Number(n) <= AVATAR_COUNT ? Number(n) : 1;
  return `${AVATAR_BASE_PATH}avatar${num}.png`;
}

/** Gera o HTML dos 5 círculos de avatar pra um seletor, marcando o
 *  `selected` com a classe .selected. */
function avatarPickerHtml(selected) {
  let html = "";
  for (let i = 1; i <= AVATAR_COUNT; i++) {
    html += `<button type="button" class="avatar-option${i === selected ? " selected" : ""}" data-avatar="${i}">
      <img src="${avatarUrl(i)}" alt="Avatar ${i}" onerror="this.style.opacity=0">
    </button>`;
  }
  return html;
}

/** Liga o clique nos botões de um seletor de avatar (delegação de evento).
 *  onPick(n) é chamado com o número escolhido (1 a 5). */
function wireAvatarPicker(containerEl, onPick) {
  if (!containerEl || containerEl.dataset.wired) return;
  containerEl.dataset.wired = "1";
  containerEl.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".avatar-option");
    if (!btn || !containerEl.contains(btn)) return;
    const n = Number(btn.dataset.avatar);
    containerEl.querySelectorAll(".avatar-option").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    onPick(n);
  });
}

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

/** state.js monta o objeto STATE de forma assíncrona (só fica pronto
 *  depois do DOMContentLoaded, não durante) — então tudo que depende de
 *  STATE.profile/STATE.campaign precisa esperar ele existir de verdade,
 *  senão quebra com "Cannot read properties of null". Fica tentando de
 *  100 em 100ms por até ~8s antes de desistir. */
function whenStateReady(callback, retriesLeft = 80) {
  if (typeof STATE !== "undefined" && STATE) {
    callback();
    return;
  }
  if (retriesLeft <= 0) {
    rankingLog("STATE nunca ficou pronto — ranking não inicializou.");
    return;
  }
  setTimeout(() => whenStateReady(callback, retriesLeft - 1), 100);
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

let _signupSelectedAvatar = 1; // avatar escolhido no popup de cadastro (antes de existir STATE.profile)

/** Mostra o popup de cadastro se o jogador ainda não tem username salvo. */
async function maybeShowUsernamePopup() {
  if (!RANKING_ENABLED) return;
  if (!STATE) return; // STATE ainda não montou — quem chamou deve usar whenStateReady()
  if (STATE.profile && STATE.profile.username) return; // já cadastrado

  const overlay = document.getElementById("usernameOverlay");
  if (!overlay) return;

  await populateNationalitySelect();

  const avatarWrap = document.getElementById("usernameAvatarPicker");
  if (avatarWrap) {
    avatarWrap.innerHTML = avatarPickerHtml(_signupSelectedAvatar);
    wireAvatarPicker(avatarWrap, (n) => { _signupSelectedAvatar = n; });
  }

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
      avatar: _signupSelectedAvatar,
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
        avatar: STATE.profile.avatar || 1,
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

/** Busca os melhores documentos de `players`, ordenados por rating.
 *  Com milhares de registros (bots + jogadores reais) não faz sentido
 *  baixar a coleção inteira toda vez — por padrão essa função já limita
 *  a consulta no próprio Firestore (orderBy + limit), então só paga o
 *  custo/latência das linhas que realmente vão aparecer na tela.
 *  Passe `null` em limitCount só se realmente precisar de tudo. */
async function fetchLeaderboard(limitCount = RANKING_FULL_PAGE_SIZE) {
  const ready = await initRanking();
  if (!ready) return null;
  try {
    let q = _rankingDb.collection("players").orderBy("rating", "desc");
    if (limitCount) q = q.limit(limitCount);
    const snap = await q.get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    rankingLog("Falha ao buscar leaderboard:", err.message);
    return null;
  }
}

/** Descobre a posição exata do jogador no ranking usando uma consulta de
 *  agregação (count()) — conta quantos registros têm rating MAIOR que o
 *  dele, sem precisar baixar a coleção inteira. Retorna null se a
 *  agregação falhar (SDK antigo, sem internet etc), pra quem chamar poder
 *  cair num plano B (ex: só mostrar "fora do Top 200"). */
async function fetchMyRankPosition(myRating) {
  const ready = await initRanking();
  if (!ready) return null;
  try {
    const q = _rankingDb.collection("players").where("rating", ">", myRating);
    if (typeof q.count !== "function") return null; // SDK sem suporte a agregação
    const snap = await q.count().get();
    return (snap.data().count || 0) + 1;
  } catch (err) {
    rankingLog("Falha ao calcular posição exata:", err.message);
    return null;
  }
}

const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function leaderboardRowHtml(entry, position, isMe) {
  const medalClass = MEDALS[position] ? ` medal-${position}` : "";
  const posHtml = MEDALS[position]
    ? `<span class="leaderboard-pos leaderboard-medal">${MEDALS[position]}</span>`
    : `<span class="leaderboard-pos">#${position}</span>`;

  return `<div class="leaderboard-row${medalClass}${isMe ? " me" : ""}">
    ${posHtml}
    <span class="leaderboard-avatar-wrap">
      <img class="leaderboard-avatar" src="${avatarUrl(entry.avatar)}" alt="" onerror="this.style.opacity=0">
      <span class="leaderboard-flag-badge">${entry.nationalityFlag || "🏳️"}</span>
    </span>
    <span class="leaderboard-name">${entry.username || "?"}</span>
    <span class="leaderboard-rating"><span class="leaderboard-coin">🪙</span>${(entry.rating || 0).toLocaleString("pt-BR")}</span>
  </div>`;
}

/** Renderiza o bloco de ranking dentro da tela de Campanha.
 *  Mostra o Top 10 e, se o jogador não estiver nele, mostra a posição
 *  dele "grudada" embaixo (a posição exata vem de uma consulta de
 *  agregação, então funciona mesmo com milhares de registros). */
async function renderCampaignLeaderboard() {
  const wrap = document.getElementById("campLeaderboardList");
  if (!wrap) return;
  if (!STATE) return; // STATE ainda não montou — quem chamou deve usar whenStateReady()

  wrap.innerHTML = `<p class="page-sub" style="margin:0;">Carregando ranking...</p>`;

  const list = await fetchLeaderboard(50); // top 50 é suficiente pra achar o jogador na maioria dos casos
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
  } else if (myIndex === -1 && STATE.profile && STATE.profile.username) {
    // Não apareceu nem no top 50 — pergunta a posição exata via count().
    const rating = STATE.campaign.rating;
    const myPos = await fetchMyRankPosition(rating);
    if (myPos) {
      const meEntry = {
        username: STATE.profile.username,
        nationalityFlag: STATE.profile.nationalityFlag,
        rating,
      };
      html += `<div class="leaderboard-sep">···</div>`;
      html += leaderboardRowHtml(meEntry, myPos, true);
    }
  }

  wrap.innerHTML = html;
}

/* ---------- Tela própria "Ranking Global" (fora/dentro da Campanha) ---------- */

/** Renderiza a tela cheia do Ranking Global: Top N completo (bots +
 *  jogadores reais misturados, ordenados só por rating) e, fixo acima
 *  da lista, um cartão com a posição exata do próprio jogador. */
async function renderRankingScreen() {
  const listWrap = document.getElementById("rankingFullList");
  const meWrap = document.getElementById("rankingMeCard");
  if (!listWrap || !meWrap) return;

  listWrap.innerHTML = `<p class="page-sub" style="margin:0;">Carregando ranking...</p>`;
  meWrap.innerHTML = `<p class="page-sub" style="margin:0;">Carregando sua posição...</p>`;

  const list = await fetchLeaderboard(RANKING_FULL_PAGE_SIZE);
  if (!list) {
    listWrap.innerHTML = `<p class="page-sub" style="margin:0;">Ranking indisponível no momento (sem conexão).</p>`;
    meWrap.innerHTML = "";
    return;
  }
  if (!list.length) {
    listWrap.innerHTML = `<p class="page-sub" style="margin:0;">Ainda não há ninguém no ranking.</p>`;
    meWrap.innerHTML = "";
    return;
  }

  listWrap.innerHTML = list.map((e, i) => leaderboardRowHtml(e, i + 1, e.id === _rankingUid)).join("");

  // Cartão "Você" — só aparece se o jogador já tiver nome cadastrado.
  if (!STATE.profile || !STATE.profile.username) {
    meWrap.innerHTML = `<p class="page-sub" style="margin:0;">Cadastre seu nome de usuário na Campanha pra aparecer no ranking.</p>`;
    return;
  }

  const myIndex = list.findIndex((e) => e.id === _rankingUid);
  if (myIndex >= 0) {
    meWrap.innerHTML =
      `<div class="ranking-me-label">Sua posição</div>` +
      leaderboardRowHtml(list[myIndex], myIndex + 1, true);
    return;
  }

  const rating = STATE.campaign.rating;
  const myPos = await fetchMyRankPosition(rating);
  const meEntry = {
    username: STATE.profile.username,
    nationalityFlag: STATE.profile.nationalityFlag,
    rating,
  };
  meWrap.innerHTML =
    `<div class="ranking-me-label">Sua posição</div>` +
    leaderboardRowHtml(meEntry, myPos || "?", true);
}

/* ---------- Trocar avatar em Configurações (depois de já cadastrado) ---------- */

/** Desenha o seletor de avatar da tela de Configurações, já com o avatar
 *  atual do jogador marcado. Chame de novo sempre que a tela de
 *  Configurações for aberta (o avatar pode ter mudado noutro dispositivo). */
function renderSettingsAvatarPicker() {
  const wrap = document.getElementById("settingsAvatarPicker");
  if (!wrap) return;
  if (!STATE) return; // STATE ainda não montou — quem chamou deve usar whenStateReady()
  const current = (STATE.profile && STATE.profile.avatar) || 1;
  wrap.innerHTML = avatarPickerHtml(current);
  wireAvatarPicker(wrap, async (n) => {
    STATE.profile = STATE.profile || {};
    STATE.profile.avatar = n;
    persist();
    if (STATE.profile.username) await pushProfileToFirestore(); // já cadastrado: sincroniza na hora
    if (typeof toast === "function") toast("Avatar atualizado!", "success");
    // Já atualiza os rankings visíveis, sem esperar o jogador sair e voltar pra tela.
    if (typeof renderCampaignLeaderboard === "function") renderCampaignLeaderboard();
    if (document.getElementById("rankingFullList") && typeof renderRankingScreen === "function") {
      renderRankingScreen();
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("usernameConfirmBtn");
  if (btn) btn.onclick = confirmUsername;

  const fullBtn = document.getElementById("campLeaderboardFullBtn");
  if (fullBtn) fullBtn.onclick = () => {
    showScreen("ranking");
    if (typeof renderRankingScreen === "function") renderRankingScreen(); // busca os dados na hora que a tela abre
  };

  whenStateReady(() => renderSettingsAvatarPicker());
});
