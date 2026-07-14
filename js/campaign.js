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

/* Ordem de exibição por posição, pra escalação sair organizada
   (goleiro no topo, depois defesa, meio, ataque) igual ao print. */
const CAMP_POS_ORDER = ["GOL","ZAG","LAT","VOL","MEI","PON","ATA"];

/* O players.json guarda a posição em `position`, com as siglas estilo
   eFootball (GK, CB, RB, DMF, CMF, AMF, RMF, LMF, CF, SS...) — mais
   umas siglas customizadas usadas só nos jogadores "iconic" (SA, MO,
   AC, AE, AD, LWF). Esse mapa traduz qualquer uma delas pro bucket
   interno que a Campanha e o motor de partida já usam. Códigos novos
   e desconhecidos caem em "MEI" por padrão, pra nunca quebrar. */
const POSITION_BUCKET_MAP = {
  GK: "GOL",
  CB: "ZAG",
  RB: "LAT", LB: "LAT", RWB: "LAT", LWB: "LAT",
  DMF: "VOL",
  CMF: "MEI", AMF: "MEI", MO: "MEI",
  RMF: "PON", LMF: "PON", RWF: "PON", LWF: "PON", AE: "PON", AD: "PON",
  CF: "ATA", SS: "ATA", SA: "ATA", AC: "ATA",
};

function normalizePlayerPos(position){
  if(!position) return "MEI";
  return POSITION_BUCKET_MAP[String(position).toUpperCase().trim()] || "MEI";
}

/* Monta a escalação a partir do elenco ativo (Escalação). Se a pessoa
   ainda não montou um elenco, retorna null e o motor usa um time
   genérico como fallback. Jogadores suspensos (2º cartão amarelo) são
   automaticamente deixados de fora, com aviso. */
function buildCampaignHomeLineup(){
  const squad = STATE.squads.find(s => s.id === STATE.activeSquadId);
  if(!squad || !squad.assignments) return null;
  const ids = Object.values(squad.assignments).filter(Boolean);
  if(!ids.length) return null;
  let players = ids
    .map(id => STATE.ownedPlayers.find(p => p.id === id))
    .filter(Boolean);
  if(!players.length) return null;

  const suspensos = players.filter(p => p.suspendedMatchesLeft > 0);
  if(suspensos.length){
    players = players.filter(p => !(p.suspendedMatchesLeft > 0));
    toast(`Fora de combate por suspensão: ${suspensos.map(p=>p.name).join(", ")}.`, "");
  }
  if(!players.length) return null;

  players.sort((a,b) => CAMP_POS_ORDER.indexOf(normalizePlayerPos(a.position)) - CAMP_POS_ORDER.indexOf(normalizePlayerPos(b.position)));
  return players.map((p,i) => ({
    number: p.number || i + 1,
    name: p.name || "Jogador",
    pos: normalizePlayerPos(p.position),
    id: p.id,
    ovr: p.overall ?? p.ovr ?? p.rating ?? null,
  }));
}

/* ---------- Consequências entre partidas: fadiga, cartões, lesão ---------- */
function applyPostMatchPlayerEffects(result){
  const squad = STATE.squads.find(s => s.id === STATE.activeSquadId);
  const squadIds = squad && squad.assignments ? Object.values(squad.assignments).filter(Boolean) : [];
  const usedIds = new Set(result.usedHomeIds || []);

  // Quem jogou perde um pouco de condição física (fadiga acumulada)
  squadIds.forEach(id=>{
    const p = STATE.ownedPlayers.find(pl => pl.id === id);
    if(!p) return;
    if(p.condition == null) p.condition = 100;
    if(usedIds.has(id)){
      p.condition = Math.max(35, p.condition - (5 + Math.round(Math.random()*6)));
    } else {
      // quem ficou no banco/fora do time recupera um pouco
      p.condition = Math.min(100, p.condition + 8);
    }
    // quem estava suspenso já cumpriu a rodada de suspensão
    if(p.suspendedMatchesLeft > 0){
      p.suspendedMatchesLeft = Math.max(0, p.suspendedMatchesLeft - 1);
    }
  });

  // Cartões amarelos: acumular 2 gera suspensão na próxima partida
  (result.cardEvents || []).forEach(evt=>{
    if(!evt.playerId) return;
    const p = STATE.ownedPlayers.find(pl => pl.id === evt.playerId);
    if(!p) return;
    p.yellowCards = (p.yellowCards || 0) + 1;
    if(p.yellowCards >= 2){
      p.yellowCards = 0;
      p.suspendedMatchesLeft = 1;
      toast(`${p.name} levou o 2º amarelo e cumpre suspensão na próxima partida.`, "");
    }
  });

  // Lesões leves: penalizam a condição física por mais tempo
  (result.injuryEvents || []).forEach(evt=>{
    if(!evt.playerId) return;
    const p = STATE.ownedPlayers.find(pl => pl.id === evt.playerId);
    if(!p) return;
    p.condition = Math.max(20, (p.condition ?? 100) - 25);
  });

  persist();
}

/* Sobrenomes genéricos — usados só como fallback caso o players.json
   ainda não tenha carregado (GAME_DATA.players vazio). */
const CPU_SURNAMES = [
  "Silva","Souza","Oliveira","Pereira","Costa","Rodrigues","Almeida",
  "Nascimento","Lima","Araújo","Ribeiro","Carvalho","Gomes","Martins",
  "Rocha","Dias","Monteiro","Cardoso","Teixeira","Correia","Barros",
  "Freitas","Moraes","Pinto",
];
const CPU_POS_ORDER = ["GOL","ZAG","ZAG","LAT","LAT","VOL","VOL","MEI","PON","PON","ATA"];

/* Inverte o POSITION_BUCKET_MAP (definido mais acima): de cada bucket
   interno (GOL/ZAG/...) pra lista de siglas reais do players.json que
   pertencem a ele. Assim dá pra sortear um GK de verdade pro "GOL",
   um CB pro "ZAG" etc. */
const BUCKET_TO_POSITIONS = Object.entries(POSITION_BUCKET_MAP).reduce((acc, [code, bucket])=>{
  (acc[bucket] = acc[bucket] || []).push(code);
  return acc;
}, {});

/* Converte a força do adversário (escala 0-99 usada no motor de
   partida) pro overall aproximado dos jogadores no players.json
   (escala ~55-101). Divisões mais altas => adversário sorteia
   jogadores de overall mais alto; divisões baixas => elenco mais fraco. */
function targetOverallForStrength(strength){
  return clamp(Math.round(55 + (strength - 30) * (101 - 55) / (99 - 30)), 55, 101);
}

/* Escolhe, dentro de um grupo de jogadores, um com overall próximo do
   alvo (sorteando entre os mais próximos, pra não repetir sempre o
   mesmo craque quando várias posições miram overalls parecidos). */
function pickPlayerNearOverall(pool, targetOverall, usedIds){
  let candidates = pool.filter(p => !usedIds.has(p.id));
  if(!candidates.length) candidates = pool;
  if(!candidates.length) return null;
  candidates = [...candidates].sort((a,b)=>
    Math.abs((a.overall ?? 70) - targetOverall) - Math.abs((b.overall ?? 70) - targetOverall));
  const top = candidates.slice(0, Math.min(6, candidates.length));
  const pick = top[Math.floor(Math.random() * top.length)];
  usedIds.add(pick.id);
  return pick;
}

/* Fallback só pra quando não há players.json carregado ainda. */
function generateOpponentLineupFallback(){
  const shuffled = [...CPU_SURNAMES].sort(() => Math.random() - 0.5);
  return CPU_POS_ORDER.map((pos,i) => ({
    number: i + 1,
    name: shuffled[i % shuffled.length],
    pos,
  }));
}

/* Monta a escalação do adversário sorteando jogadores REAIS do
   players.json (via GAME_DATA.players), respeitando a posição de
   cada vaga e mirando um overall coerente com a força do adversário
   daquela partida — assim, times fracos não têm zagueiro de 98 e
   times fortes não têm atacante de 65. */
function generateOpponentLineup(opponentStrength){
  const pool = (typeof GAME_DATA !== "undefined" && GAME_DATA.players && GAME_DATA.players.length)
    ? GAME_DATA.players
    : null;
  if(!pool) return generateOpponentLineupFallback();

  const targetOverall = targetOverallForStrength(opponentStrength ?? 60);
  const usedIds = new Set();

  return CPU_POS_ORDER.map((bucket, i) => {
    const codes = BUCKET_TO_POSITIONS[bucket] || [];
    const bucketPool = pool.filter(p => codes.includes(String(p.position || "").toUpperCase().trim()));
    const player = pickPlayerNearOverall(bucketPool.length ? bucketPool : pool, targetOverall, usedIds);
    if(!player){
      return { number: i + 1, name: CPU_SURNAMES[i % CPU_SURNAMES.length], pos: bucket };
    }
    return {
      number: i + 1,
      name: player.name,
      pos: bucket,
      id: player.id,
      ovr: player.overall,
      club: player.club,
    };
  });
}

function startCampaignMatch(){
  const c = STATE.campaign;
  const tier = getDivisionTier(c.rating);
  const diff = CAMP_DIFFICULTIES.find(d => d.id === c.difficulty) || CAMP_DIFFICULTIES[1];

  const playerStrength = Math.min(99, Math.max(35, Math.round(40 + c.rating / 40)));
  const variance = diff.variance + Math.round((Math.random() * 16) - 8);
  const opponentStrength = Math.min(99, Math.max(30, playerStrength + variance));

  const homeLineup = buildCampaignHomeLineup();
  if(!homeLineup) toast("Você ainda não montou uma escalação — usando time genérico. Ajuste em Game Plan.", "");

  startMatch({
    competitionLabel: `Campanha — ${tier.name}`,
    title: `Campanha — ${tier.name}`,
    homeTeamName: "Meu Clube",
    awayTeamName: "Adversário Online",
    homeLineup,
    awayLineup: generateOpponentLineup(opponentStrength),
    playerStrength,
    opponentStrength,
    totalChances: 8,
    // sem winCondition custom = motor usa o padrão (mais gols vence)
    onComplete: (result) => {
      applyCampaignResult(result);
      applyPostMatchPlayerEffects(result);
      renderCampaign();
      const msg = result.result === "win" ? "Vitória! Rating atualizado."
                : result.result === "draw" ? "Empate. Rating atualizado."
                : "Derrota. Rating atualizado.";
      toast(msg, result.result === "loss" ? "" : "success");
    }
  });
}
