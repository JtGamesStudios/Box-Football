/* =========================================================
   JOGO C/ AMIGO — PvP online em tempo real
   Reaproveita o Firebase/Firestore já usado pelo ranking.js
   (mesmo projeto, mesmo login anônimo) como "servidor" — não
   existe backend próprio, tudo roda direto do navegador.

   Coleções novas no Firestore:
     pvpProfiles/{playerId}  -> { nickname, updatedAt }
        Só serve pra alguém conseguir achar o apelido de um ID
        antes de virarem amigos.

     pvpInvites/{playerId}   -> { pending: {roomCode, fromId, fromName, createdAt} | null }
        "Caixa de entrada" de convite direto (1 por vez) — quem
        desafia um amigo da lista escreve aqui.

     pvpRooms/{roomCode}     -> {
        hostId, hostName, hostLineup, hostStrength,
        guestId, guestName, guestLineup, guestStrength,
        status: "waiting" | "playing" | "finished" | "cancelled",
        turnQueue: ["home"|"away", ...]   (ponto de vista do HOST),
        chances: { "0": {isGoal,message}, "1": {...}, ... }
      }
     Cada lance só é escrito por quem realmente jogou ele — o outro
     lado só lê (onSnapshot), por isso não precisa de servidor.

   IMPORTANTE: as regras do Firestore do projeto precisam permitir
   leitura/escrita nessas 3 coleções (do jeito que o projeto já
   confia no login anônimo pra tudo mais). Ver nota no final do
   arquivo se aparecer erro de permissão no console.
   ========================================================= */

const PVP_ENABLED = true; // deixe false pra desligar a tela em produção até confirmar as regras do Firestore
const PVP_TOTAL_CHANCES = 8;

let _pvpDb = null;
let _pvpLobbyUnsub = null;
let _pvpMatchUnsub = null;
let _pvpCurrentRoomCode = null;

function pvpLog(...args){ console.log("[pvp]", ...args); }

/* ---------- Bootstrap: Firestore (reaproveita o login anônimo do ranking.js) ---------- */
async function ensurePvpDb(){
  if(_pvpDb) return _pvpDb;
  try{
    const ready = typeof initRanking === "function" ? await initRanking() : false;
    if(!ready || typeof firebase === "undefined") return null;
    _pvpDb = firebase.firestore();
    return _pvpDb;
  }catch(e){
    pvpLog("Firestore indisponível:", e.message);
    return null;
  }
}

function myNickname(){
  return (STATE.profile && STATE.profile.username) || "Jogador";
}

function ensureLocalPvpState(){
  if(!STATE.pvp) STATE.pvp = { friends: [], history: [] };
  if(!Array.isArray(STATE.pvp.friends)) STATE.pvp.friends = [];
  if(!Array.isArray(STATE.pvp.history)) STATE.pvp.history = [];
}

/* Publica (upsert) nosso apelido, pra amigos conseguirem te achar pelo ID */
async function publishMyPvpProfile(){
  const db = await ensurePvpDb();
  if(!db || !STATE.profile || !STATE.profile.username) return;
  try{
    await db.collection("pvpProfiles").doc(getPlayerId()).set({
      nickname: myNickname(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }catch(e){ pvpLog("Falha ao publicar perfil:", e.message); }
}

/* ---------- Amigos (lista local, guardada no seu save) ---------- */
async function pvpAddFriend(rawId){
  const id = (rawId || "").trim().toUpperCase();
  if(!id) return;
  ensureLocalPvpState();
  if(id === getPlayerId()){ toast("Esse é o seu próprio ID 🙂", ""); return; }
  if(STATE.pvp.friends.some(f => f.id === id)){ toast("Esse amigo já está na sua lista.", ""); return; }

  const db = await ensurePvpDb();
  if(!db){ toast("Sem conexão com o servidor agora. Tente de novo.", ""); return; }

  try{
    const doc = await db.collection("pvpProfiles").doc(id).get();
    if(!doc.exists){
      toast("ID não encontrado. Peça pro seu amigo abrir 'Jogo c/ amigo' primeiro.", "");
      return;
    }
    const nickname = (doc.data() || {}).nickname || "Jogador";
    STATE.pvp.friends.push({ id, nickname });
    persist();
    toast(`${nickname} adicionado à sua lista!`, "success");
    renderAmigoScreen();
  }catch(e){
    toast("Não deu pra buscar esse ID agora. Tente de novo.", "");
  }
}

function pvpRemoveFriend(id){
  ensureLocalPvpState();
  STATE.pvp.friends = STATE.pvp.friends.filter(f => f.id !== id);
  persist();
  renderAmigoScreen();
}

/* ---------- Escalação / força usadas na sala (reaproveita a Campanha) ---------- */
function pvpBuildLineup(){
  return (typeof buildCampaignHomeLineup === "function") ? buildCampaignHomeLineup() : null;
}
function pvpLineupStrength(lineup){
  if(!lineup || !lineup.length) return 65;
  const withOvr = lineup.filter(p => p.ovr != null);
  if(!withOvr.length) return 65;
  const avg = withOvr.reduce((s,p) => s + p.ovr, 0) / withOvr.length;
  return Math.max(30, Math.min(99, Math.round(avg)));
}
function pvpGenerateTurnQueue(hostStrength, guestStrength){
  const hStr = Math.max(1, hostStrength || 65);
  const gStr = Math.max(1, guestStrength || 65);
  const hShare = hStr / (hStr + gStr);
  const q = [];
  for(let i = 0; i < PVP_TOTAL_CHANCES; i++) q.push(Math.random() < hShare ? "home" : "away");
  return q;
}

/* ---------- Código de sala ---------- */
function pvpGenerateRoomCode(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for(let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/* Cria uma sala como anfitrião e retorna o código */
async function pvpCreateRoom(){
  const db = await ensurePvpDb();
  if(!db){ toast("Sem conexão com o servidor de PvP agora.", ""); return null; }
  const code = pvpGenerateRoomCode();
  const lineup = pvpBuildLineup();
  const strength = pvpLineupStrength(lineup);
  try{
    await db.collection("pvpRooms").doc(code).set({
      hostId: getPlayerId(),
      hostName: myNickname(),
      hostLineup: lineup || null,
      hostStrength: strength,
      guestId: null,
      guestName: null,
      guestLineup: null,
      guestStrength: null,
      status: "waiting",
      turnQueue: null,
      chances: {},
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return code;
  }catch(e){
    pvpLog("Falha ao criar sala:", e.message);
    toast("Não deu pra criar a sala agora. Tente de novo.", "");
    return null;
  }
}

/* Entra numa sala existente como convidado — gera o turnQueue e destrava o início */
async function pvpJoinRoom(rawCode){
  const code = (rawCode || "").trim().toUpperCase();
  if(!code) return null;
  const db = await ensurePvpDb();
  if(!db){ toast("Sem conexão com o servidor de PvP agora.", ""); return null; }

  const roomRef = db.collection("pvpRooms").doc(code);
  try{
    const snap = await roomRef.get();
    if(!snap.exists){ toast("Sala não encontrada. Confira o código.", ""); return null; }
    const data = snap.data();
    if(data.status !== "waiting"){ toast("Essa sala já começou ou foi encerrada.", ""); return null; }
    if(data.hostId === getPlayerId()){ toast("Você não pode entrar na sua própria sala 🙂", ""); return null; }

    const lineup = pvpBuildLineup();
    const strength = pvpLineupStrength(lineup);
    const turnQueue = pvpGenerateTurnQueue(data.hostStrength, strength);

    await roomRef.update({
      guestId: getPlayerId(),
      guestName: myNickname(),
      guestLineup: lineup || null,
      guestStrength: strength,
      status: "playing",
      turnQueue,
    });
    return code;
  }catch(e){
    pvpLog("Falha ao entrar na sala:", e.message);
    toast("Não deu pra entrar nessa sala agora. Tente de novo.", "");
    return null;
  }
}

/* ---------- Convite direto pra um amigo da lista ---------- */
async function pvpChallengeFriend(friend){
  const db = await ensurePvpDb();
  if(!db){ toast("Sem conexão com o servidor de PvP agora.", ""); return; }
  const code = await pvpCreateRoom();
  if(!code) return;
  try{
    await db.collection("pvpInvites").doc(friend.id).set({
      pending: { roomCode: code, fromId: getPlayerId(), fromName: myNickname(), createdAt: Date.now() },
    });
  }catch(e){ pvpLog("Falha ao enviar convite (sala ainda funciona por código):", e.message); }
  pvpEnterLobby(code, true, friend.nickname);
}

async function pvpCheckIncomingInvite(){
  const db = await ensurePvpDb();
  if(!db) return null;
  try{
    const doc = await db.collection("pvpInvites").doc(getPlayerId()).get();
    const data = doc.exists ? doc.data() : null;
    return (data && data.pending) ? data.pending : null;
  }catch(e){ return null; }
}

async function pvpClearIncomingInvite(){
  const db = await ensurePvpDb();
  if(!db) return;
  try{ await db.collection("pvpInvites").doc(getPlayerId()).set({ pending: null }, { merge: true }); }
  catch(e){ /* silencioso */ }
}

async function pvpAcceptInvite(invite){
  await pvpClearIncomingInvite();
  const code = await pvpJoinRoom(invite.roomCode);
  if(code) pvpEnterLobby(code, false, invite.fromName);
  else renderAmigoScreen();
}

async function pvpDeclineInvite(){
  await pvpClearIncomingInvite();
  renderAmigoScreen();
}

/* ---------- Sala de espera (lobby) ---------- */
function ensurePvpLobbyOverlay(){
  if(document.getElementById("pvpLobbyOverlay")) return;
  const div = document.createElement("div");
  div.className = "prematch-overlay hidden";
  div.id = "pvpLobbyOverlay";
  div.innerHTML = `
    <div class="prematch-inner pvp-lobby-inner">
      <div class="prematch-comp-banner">Jogo c/ amigo</div>
      <div class="pvp-lobby-code" id="pvpLobbyCode">-----</div>
      <div class="pvp-lobby-status" id="pvpLobbyStatus">Aguardando...</div>
      <button class="btn btn-ghost btn-block" id="pvpLobbyCancelBtn">Cancelar</button>
    </div>`;
  document.body.appendChild(div);
  document.getElementById("pvpLobbyCancelBtn").onclick = pvpCancelLobby;
}

function pvpEnterLobby(code, isHost, opponentHint){
  ensurePvpLobbyOverlay();
  document.getElementById("pvpLobbyCode").textContent = code;
  document.getElementById("pvpLobbyStatus").textContent = isHost
    ? (opponentHint ? `Convite enviado pra ${opponentHint}. Ou compartilhe o código acima.` : "Compartilhe esse código com seu amigo...")
    : "Entrando na sala...";
  document.getElementById("pvpLobbyOverlay").classList.remove("hidden");

  const db = _pvpDb;
  const roomRef = db.collection("pvpRooms").doc(code);
  _pvpCurrentRoomCode = code;

  _pvpLobbyUnsub = roomRef.onSnapshot((snap)=>{
    if(!snap.exists){
      toast("A sala foi encerrada.", "");
      pvpCloseLobby();
      return;
    }
    const data = snap.data();
    if(data.status === "cancelled"){
      toast("A sala foi cancelada.", "");
      pvpCloseLobby();
      return;
    }
    if(data.status === "playing" && data.turnQueue){
      document.getElementById("pvpLobbyOverlay").classList.add("hidden");
      if(_pvpLobbyUnsub){ _pvpLobbyUnsub(); _pvpLobbyUnsub = null; }
      pvpLaunchMatch(code, isHost, data);
    }
  }, (err)=>{
    pvpLog("Erro no lobby:", err.message);
  });
}

function pvpCancelLobby(){
  if(_pvpCurrentRoomCode && _pvpDb){
    _pvpDb.collection("pvpRooms").doc(_pvpCurrentRoomCode).update({ status: "cancelled" }).catch(()=>{});
  }
  pvpCloseLobby();
}

function pvpCloseLobby(){
  if(_pvpLobbyUnsub){ _pvpLobbyUnsub(); _pvpLobbyUnsub = null; }
  const overlay = document.getElementById("pvpLobbyOverlay");
  if(overlay) overlay.classList.add("hidden");
  _pvpCurrentRoomCode = null;
}

/* ---------- A partida em si: traduz o turnQueue pro nosso ponto de vista
   e liga o motor (matchsim.js) no modo online ---------- */
function pvpLaunchMatch(code, isHost, roomData){
  const db = _pvpDb;
  const roomRef = db.collection("pvpRooms").doc(code);
  const localSide = isHost ? "home" : "away";
  const rawQueue = roomData.turnQueue || [];
  const localQueue = rawQueue.map(s => (s === localSide) ? "home" : "away");

  const homeLineup   = isHost ? roomData.hostLineup   : roomData.guestLineup;
  const awayLineup   = isHost ? roomData.guestLineup  : roomData.hostLineup;
  const homeStrength = isHost ? roomData.hostStrength : roomData.guestStrength;
  const awayStrength = isHost ? roomData.guestStrength: roomData.hostStrength;
  const homeName = isHost ? (roomData.hostName || "Você")  : (roomData.guestName || "Você");
  const awayName = isHost ? (roomData.guestName || "Amigo"): (roomData.hostName || "Amigo");

  const chanceCache = {};
  const waiters = {};

  _pvpMatchUnsub = roomRef.onSnapshot((snap)=>{
    const data = snap.data();
    if(!data || !data.chances) return;
    Object.keys(data.chances).forEach(idxStr=>{
      const idx = Number(idxStr);
      if(chanceCache[idx]) return; // já processado
      chanceCache[idx] = data.chances[idxStr];
      if(waiters[idx]){
        const cb = waiters[idx];
        delete waiters[idx];
        cb(chanceCache[idx]);
      }
    });
  }, (err)=> pvpLog("Erro na partida:", err.message));

  startMatch({
    competitionLabel: "Jogo c/ amigo — Online",
    title: "Jogo c/ amigo",
    homeTeamName: homeName,
    awayTeamName: awayName,
    homeLineup,
    awayLineup,
    playerStrength: homeStrength || 65,
    opponentStrength: awayStrength || 65,
    totalChances: rawQueue.length || PVP_TOTAL_CHANCES,
    turnQueue: localQueue,
    online: true,
    onLocalChance: (idx, result)=>{
      roomRef.update({ [`chances.${idx}`]: result }).catch((e)=> pvpLog("Falha ao sincronizar lance:", e.message));
    },
    onWaitRemoteChance: (idx, cb)=>{
      if(chanceCache[idx]){ cb(chanceCache[idx]); return; }
      waiters[idx] = cb;
    },
    onComplete: (result)=>{
      if(_pvpMatchUnsub){ _pvpMatchUnsub(); _pvpMatchUnsub = null; }
      roomRef.update({ status: "finished" }).catch(()=>{});
      pvpRecordHistory(awayName, result);
      showScreen("amigo");
    },
  });
}

function pvpRecordHistory(opponentName, result){
  ensureLocalPvpState();
  STATE.pvp.history.unshift({
    opponent: opponentName,
    score: `${result.homeGoals} - ${result.awayGoals}`,
    result: result.result,
    date: Date.now(),
  });
  STATE.pvp.history = STATE.pvp.history.slice(0, 15);
  persist();
}

/* ---------- Tela "Jogo c/ amigo" ---------- */
async function renderAmigoScreen(){
  ensureLocalPvpState();

  const inviteWrap = document.getElementById("amigoInviteCard");
  if(!PVP_ENABLED){
    if(inviteWrap){
      inviteWrap.classList.remove("hidden");
      inviteWrap.innerHTML = `<div class="pvp-invite-text">O Jogo c/ amigo está em manutenção rápida — volte daqui a pouco. ⚙️</div>`;
    }
    ["amigoCreateRoomBtn","amigoJoinRoomBtn","amigoAddFriendBtn"].forEach(id=>{
      const btn = document.getElementById(id);
      if(btn) btn.disabled = true;
    });
    const listEl = document.getElementById("amigoFriendList");
    if(listEl) listEl.innerHTML = "";
    const histEl = document.getElementById("amigoHistoryList");
    if(histEl) histEl.innerHTML = "";
    return;
  }

  const idEl = document.getElementById("amigoPlayerId");
  if(idEl) idEl.textContent = getPlayerId();

  if(inviteWrap){
    inviteWrap.classList.add("hidden");
    if(STATE.profile && STATE.profile.username){
      publishMyPvpProfile();
      const invite = await pvpCheckIncomingInvite();
      if(invite){
        inviteWrap.classList.remove("hidden");
        inviteWrap.innerHTML = `
          <div class="pvp-invite-text"><strong>${invite.fromName}</strong> te desafiou para uma partida!</div>
          <div class="pvp-invite-actions">
            <button class="btn btn-primary btn-sm" id="amigoAcceptInviteBtn">Aceitar</button>
            <button class="btn btn-ghost btn-sm" id="amigoDeclineInviteBtn">Recusar</button>
          </div>`;
        document.getElementById("amigoAcceptInviteBtn").onclick = ()=> pvpAcceptInvite(invite);
        document.getElementById("amigoDeclineInviteBtn").onclick = pvpDeclineInvite;
      }
    }
  }

  const listEl = document.getElementById("amigoFriendList");
  if(listEl){
    if(!STATE.pvp.friends.length){
      listEl.innerHTML = `<p class="page-sub" style="margin:0;">Você ainda não adicionou nenhum amigo. Peça o ID dele e adicione abaixo.</p>`;
    } else {
      listEl.innerHTML = STATE.pvp.friends.map(f => `
        <div class="pvp-friend-row">
          <div class="pvp-friend-info">
            <span class="pvp-friend-name">${f.nickname}</span>
            <span class="pvp-friend-id">${f.id}</span>
          </div>
          <div class="pvp-friend-actions">
            <button class="btn btn-primary btn-sm" data-challenge="${f.id}">Desafiar</button>
            <button class="btn btn-ghost btn-sm" data-remove="${f.id}">Remover</button>
          </div>
        </div>`).join("");
      listEl.querySelectorAll("[data-challenge]").forEach(btn=>{
        btn.onclick = ()=>{
          const friend = STATE.pvp.friends.find(f => f.id === btn.dataset.challenge);
          if(friend) pvpChallengeStart(friend);
        };
      });
      listEl.querySelectorAll("[data-remove]").forEach(btn=>{
        btn.onclick = ()=> pvpRemoveFriend(btn.dataset.remove);
      });
    }
  }

  const histEl = document.getElementById("amigoHistoryList");
  if(histEl){
    if(!STATE.pvp.history.length){
      histEl.innerHTML = `<p class="page-sub" style="margin:0;">Nenhuma partida online ainda.</p>`;
    } else {
      histEl.innerHTML = STATE.pvp.history.map(h => `
        <div class="pvp-history-row ${h.result}">
          <span>${h.opponent}</span>
          <span>${h.score}</span>
          <span>${h.result === "win" ? "Vitória" : h.result === "draw" ? "Empate" : "Derrota"}</span>
        </div>`).join("");
    }
  }
}

/* Garante que o jogador tem apelido cadastrado (reaproveita o popup do Ranking)
   antes de qualquer ação online — evita duelo com nome "Jogador" pra todo mundo. */
function pvpRequireUsername(){
  if(STATE.profile && STATE.profile.username) return true;
  if(typeof maybeShowUsernamePopup === "function") maybeShowUsernamePopup();
  toast("Cadastre seu nome de jogador primeiro (popup acima) e tente de novo.", "");
  return false;
}

function pvpChallengeStart(friend){
  if(!pvpRequireUsername()) return;
  pvpChallengeFriend(friend);
}

function pvpCreateRoomFlow(){
  if(!pvpRequireUsername()) return;
  pvpCreateRoom().then(code => { if(code) pvpEnterLobby(code, true, null); });
}

function pvpJoinRoomFlow(){
  if(!pvpRequireUsername()) return;
  const input = document.getElementById("amigoJoinCodeInput");
  const code = input ? input.value : "";
  if(!code || !code.trim()){ toast("Digite o código da sala.", ""); return; }
  pvpJoinRoom(code).then(joined => {
    if(joined){ if(input) input.value = ""; pvpEnterLobby(joined, false, null); }
  });
}

function pvpAddFriendFlow(){
  const input = document.getElementById("amigoAddFriendInput");
  const id = input ? input.value : "";
  pvpAddFriend(id).then(()=>{ if(input) input.value = ""; });
}

/* ---------- NOTA SOBRE REGRAS DO FIRESTORE ----------
   Se o convite/sala não funcionar e o console mostrar erro de
   "permission-denied", é preciso liberar leitura/escrita nas
   coleções novas nas regras do Firestore do projeto
   (box-football-2021), por exemplo:

   match /pvpProfiles/{id}  { allow read, write: if request.auth != null; }
   match /pvpInvites/{id}   { allow read, write: if request.auth != null; }
   match /pvpRooms/{id}     { allow read, write: if request.auth != null; }
   ========================================================= */
