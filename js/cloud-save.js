/* =========================================================
   CLOUD SAVE — espelha o save completo (SAVE_KEY) no Firestore
   =========================================================
   Pré-requisito da migração pro app: além do ranking (players/{uid}),
   agora o save INTEIRO do jogador também é salvo na nuvem, na coleção
   "saves", document(uid) — usando o mesmo uid da sessão anônima atual
   (o mesmo uid já usado em js/ranking.js).

   Guardamos o save como uma STRING JSON num único campo ("save"), em
   vez de gravar STATE direto como objeto Firestore — assim evitamos
   problemas de campos com nomes/estruturas que o Firestore não aceita
   bem (ex: chaves dinâmicas de boxId, valores undefined etc.) e o
   documento fica simples de ler/escrever por inteiro.

   Depende de js/ranking.js (usa initRanking() e o SDK compat do
   Firebase já inicializado por ele). Erro de rede/auth nunca trava o
   jogo — mesmo padrão silencioso de ranking.js.
   ========================================================= */

const CLOUD_SAVE_DEBOUNCE_MS = 4000; // "debounce de alguns segundos" pedido

function cloudSaveLog(...args) {
  console.log("[cloud-save]", ...args);
}

/** Sobe o SAVE_KEY atual (objeto STATE já serializado) pro Firestore,
 *  no uid da sessão anônima (ou vinculada) atual. Nunca lança erro pra
 *  fora — se falhar (sem internet, sem auth etc.), só desiste quieto. */
async function saveStateToCloud() {
  try {
    if (typeof initRanking !== "function") return;
    const ready = await initRanking();
    if (!ready) return;

    const user = firebase.auth().currentUser;
    if (!user) return;

    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;

    await firebase.firestore().collection("saves").doc(user.uid).set(
      {
        save: raw,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    cloudSaveLog("Falha ao subir save pra nuvem:", err.message);
  }
}

/** Busca o save completo salvo na nuvem pra um uid específico.
 *  Retorna o objeto já desserializado, ou null se não existir / falhar. */
async function loadStateFromCloud(uid) {
  try {
    if (!uid) return null;
    if (typeof initRanking !== "function") return null;
    const ready = await initRanking();
    if (!ready) return null;

    const doc = await firebase.firestore().collection("saves").doc(uid).get();
    if (!doc.exists) return null;

    const data = doc.data();
    if (!data || !data.save) return null;

    return JSON.parse(data.save);
  } catch (err) {
    cloudSaveLog("Falha ao buscar save da nuvem:", err.message);
    return null;
  }
}

/* ---------- Debounce: chamado toda vez que state.js salva localmente ---------- */
let _cloudSaveTimer = null;
function scheduleCloudSave() {
  clearTimeout(_cloudSaveTimer);
  _cloudSaveTimer = setTimeout(saveStateToCloud, CLOUD_SAVE_DEBOUNCE_MS);
}
