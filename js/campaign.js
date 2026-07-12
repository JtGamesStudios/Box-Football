/* =========================================================
   CAMPANHA — tela de divisão/rating (igual ao print do eFootball),
   usa o motor compartilhado (matchsim.js) com a config PADRÃO
   (vencer = fazer mais gols).
   ========================================================= */

let DIVISIONS_DATA = null;

async function ensureDivisionsData(){
  if(DIVISIONS_DATA) return DIVISIONS_DATA;
  const res = await fetch("data/divisions.json");
  DIVISIONS_DATA = await res.json();
  return DIVISIONS_DATA;
}

function getDivisionTier(rating){
  const tiers = DIVISIONS_DATA.tiers;
  return tiers.find(t => rating >= t.minRating && rating <= t.maxRating) || tiers[tiers.length - 1];
}

function fmtDate(ms){
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}

function campaignPhaseLabel(){
  const c = STATE.campaign;
  const end = c.phaseStart + (DIVISIONS_DATA.phaseLengthDays || 35) * 86400000;
  return `${fmtDate(c.phaseStart)} - ${fmtDate(end)}`;
}

/* Estimativa só para exibição (não há servidor real de ranking) */
function estimateRanking(rating){
  return Math.max(1, Math.round(2600000 / Math.max(1, rating)));
}

/* Fecha a fase (temporada) se o prazo já passou: paga recompensa da
   divisão em que o clube terminou e zera Wins/Draws/Losses. */
function checkCampaignPhase(){
  const c = STATE.campaign;
  const phaseLengthMs = (DIVISIONS_DATA.phaseLengthDays || 35) * 86400000;
  if(Date.now() - c.phaseStart < phaseLengthMs) return;

  const tier = getDivisionTier(c.rating);
  const reward = (DIVISIONS_DATA.seasonRewards || {})[tier.id] || { gp: 0, coins: 0 };
  addGift(`Recompensa de fase — ${tier.name}`, `Você terminou a fase na ${tier.name}.`, reward.gp, reward.coins);

  c.wins = 0; c.draws = 0; c.losses = 0;
  c.phaseStart = Date.now();
  persist();
  toast(`Fase encerrada! Recompensa da ${tier.name} na Caixa de Presentes.`, "success");
}

async function renderCampaign(){
  await ensureDivisionsData();
  checkCampaignPhase();

  const c = STATE.campaign;
  const tier = getDivisionTier(c.rating);

  const badge = document.getElementById("campDivisionBadge");
  if(badge){ badge.style.background = tier.color; badge.textContent = tier.shortLabel; }

  const setText = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  setText("campDivisionName", tier.name);
  setText("campPhaseLabel", `Fase: ${campaignPhaseLabel()}`);
  setText("campRating", c.rating.toLocaleString("pt-BR"));
  setText("campRanking", estimateRanking(c.rating).toLocaleString("pt-BR"));
  setText("campWins", c.wins);
  setText("campDraws", c.draws);
  setText("campLosses", c.losses);

  const total = c.wins + c.draws + c.losses;
  const winRate = total > 0 ? Math.round((c.wins / total) * 100) : 0;
  setText("campWinRate", winRate + "%");

  renderCampaignHistory();
}

/* ---------- ELO simplificado ---------- */
function applyCampaignResult(result){
  const c = STATE.campaign;
  const K = 24;
  const scoreMap = { win: 1, draw: 0.5, loss: 0 };
  const actual = scoreMap[result.result];
  const expected = 0.5; // matchmaking já busca adversários de força parecida
  let delta = Math.round(K * (actual - expected) * 2);
  if(result.result === "win")  delta = Math.max(delta, 14);
  if(result.result === "loss") delta = Math.min(delta, -10);
  if(result.result === "draw") delta = Math.max(-4, Math.min(4, delta));

  c.rating = Math.max(0, c.rating + delta);
  if(result.result === "win") c.wins++;
  else if(result.result === "draw") c.draws++;
  else c.losses++;

  c.matchHistory.unshift({
    date: Date.now(),
    score: `${result.homeGoals}-${result.awayGoals}`,
    result: result.result,
    ratingDelta: delta,
  });
  c.matchHistory = c.matchHistory.slice(0, 30);
  persist();
}

function renderCampaignHistory(){
  const wrap = document.getElementById("campHistoryList");
  if(!wrap) return;
  const c = STATE.campaign;
  if(!c.matchHistory.length){
    wrap.innerHTML = `<p class="page-sub" style="margin:0;">Nenhuma partida jogada ainda.</p>`;
    return;
  }
  wrap.innerHTML = c.matchHistory.map(m=>{
    const cls = m.result === "win" ? "win" : m.result === "draw" ? "draw" : "loss";
    const label = m.result === "win" ? "V" : m.result === "draw" ? "E" : "D";
    const sign = m.ratingDelta >= 0 ? "+" : "";
    return `<div class="camp-history-row">
      <span class="camp-history-badge ${cls}">${label}</span>
      <span class="camp-history-score">${m.score}</span>
      <span class="camp-history-date">${fmtDate(m.date)}</span>
      <span class="camp-history-delta ${cls}">${sign}${m.ratingDelta}</span>
    </div>`;
  }).join("");
}

function toggleCampHistory(){
  const wrap = document.getElementById("campHistoryWrap");
  if(!wrap) return;
  const open = wrap.classList.toggle("open");
  if(open) renderCampaignHistory();
}

/* ---------- Matchmaking Settings (dificuldade do CPU) ---------- */
const CAMP_DIFFICULTIES = [
  { id: "facil",  label: "Fácil",   variance: -10 },
  { id: "normal", label: "Normal",  variance: 0 },
  { id: "dificil",label: "Difícil", variance: 10 },
];

function cycleCampDifficulty(){
  const c = STATE.campaign;
  const idx = CAMP_DIFFICULTIES.findIndex(d => d.id === c.difficulty);
  const next = CAMP_DIFFICULTIES[(idx + 1) % CAMP_DIFFICULTIES.length];
  c.difficulty = next.id;
  persist();
  toast(`Matchmaking ajustado para: ${next.label}`, "");
}

/* ---------- Iniciar partida (config PADRÃO do motor compartilhado) ---------- */
function startCampaignMatch(){
  const c = STATE.campaign;
  const tier = getDivisionTier(c.rating);
  const diff = CAMP_DIFFICULTIES.find(d => d.id === c.difficulty) || CAMP_DIFFICULTIES[1];

  const playerStrength = Math.min(99, Math.max(35, Math.round(40 + c.rating / 40)));
  const variance = diff.variance + Math.round((Math.random() * 16) - 8);
  const opponentStrength = Math.min(99, Math.max(30, playerStrength + variance));

  startMatch({
    title: `Campanha — ${tier.name}`,
    homeTeamName: "Meu Clube",
    awayTeamName: "Adversário Online",
    playerStrength,
    opponentStrength,
    totalChances: 8,
    // sem winCondition custom = motor usa o padrão (mais gols vence)
    onComplete: (result) => {
      applyCampaignResult(result);
      renderCampaign();
      const msg = result.result === "win" ? "Vitória! Rating atualizado."
                : result.result === "draw" ? "Empate. Rating atualizado."
                : "Derrota. Rating atualizado.";
      toast(msg, result.result === "loss" ? "" : "success");
    }
  });
}
