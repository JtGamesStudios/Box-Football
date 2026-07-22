/* =========================================================
   TRANSFER LIMIT — limite mensal de transferências de save
   =========================================================
   Toda vez que uma ação baixa o save da nuvem e SOBRESCREVE o save
   local (ex: "entrar com uma conta Google já vinculada em outro
   aparelho" no site, ou "Transferir dados" no app) isso conta como
   UMA transferência. Vincular a conta Google pela primeira vez (sem
   sobrescrever nada) NÃO conta.

   Coleção Firestore: transferLimits/{uid} → { mes: "YYYY-MM", contagem }

   O reset é automático: se o "mes" salvo no doc for diferente do mês
   atual, a contagem é tratada como 0 — não precisa de job/cron algum.
   ========================================================= */

const TRANSFER_MONTHLY_LIMIT = 10; // altere aqui se o limite mudar

function transferLimitLog(...args) {
  console.log("[transfer-limit]", ...args);
}

function currentMonthStr(d) {
  d = d || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Primeiro dia do mês seguinte ao mês informado ("YYYY-MM"), usado só
 *  pra exibir "reseta em [data]" pro jogador. */
function firstDayOfNextMonth(mesStr) {
  const [y, m] = mesStr.split("-").map(Number);
  return new Date(y, m, 1); // m (0-indexado) já é o mês seguinte
}

/** Verifica se `uid` ainda pode fazer uma transferência este mês.
 *  Retorna { permitido, restantes, resetaEm }. Em caso de falha de
 *  rede/auth, libera por padrão (permitido:true) pra não travar o
 *  jogador por causa de uma falha nossa — a contagem real só é gravada
 *  em incrementTransferCount(). */
async function checkTransferLimit(uid) {
  const fallback = { permitido: true, restantes: TRANSFER_MONTHLY_LIMIT, resetaEm: null };
  try {
    if (!uid) return fallback;
    if (typeof initRanking !== "function") return fallback;
    const ready = await initRanking();
    if (!ready) return fallback;

    const mesAtual = currentMonthStr();
    const ref = firebase.firestore().collection("transferLimits").doc(uid);
    const doc = await ref.get();

    let contagem = 0;
    if (doc.exists) {
      const data = doc.data();
      if (data && data.mes === mesAtual) contagem = data.contagem || 0;
      // mês diferente do salvo => considera 0 (reset automático)
    }

    const restantes = Math.max(0, TRANSFER_MONTHLY_LIMIT - contagem);
    return {
      permitido: contagem < TRANSFER_MONTHLY_LIMIT,
      restantes,
      resetaEm: firstDayOfNextMonth(mesAtual),
    };
  } catch (err) {
    transferLimitLog("Falha ao checar limite de transferências:", err.message);
    return fallback;
  }
}

/** Soma 1 na contagem do mês atual pra `uid` (cria o doc se não existir,
 *  reseta a contagem se o mês salvo for de um mês anterior). Chame
 *  SEMPRE logo depois de uma transferência bem-sucedida (sobrescrita do
 *  save local com dados vindos da nuvem). */
async function incrementTransferCount(uid) {
  try {
    if (!uid) return;
    if (typeof initRanking !== "function") return;
    const ready = await initRanking();
    if (!ready) return;

    const mesAtual = currentMonthStr();
    const ref = firebase.firestore().collection("transferLimits").doc(uid);

    await firebase.firestore().runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      let contagem = 0;
      if (doc.exists) {
        const data = doc.data();
        if (data && data.mes === mesAtual) contagem = data.contagem || 0;
      }
      tx.set(ref, { mes: mesAtual, contagem: contagem + 1 }, { merge: true });
    });
  } catch (err) {
    transferLimitLog("Falha ao incrementar contagem de transferências:", err.message);
  }
}

/** Formata a data de reset num texto simples em pt-BR, pras mensagens
 *  de limite atingido (ex: "1 de agosto de 2026"). */
function formatResetDate(date) {
  if (!date) return "no início do próximo mês";
  try {
    return date.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
  } catch (e) {
    return "no início do próximo mês";
  }
}
