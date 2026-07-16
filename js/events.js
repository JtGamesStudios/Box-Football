/* =========================================================
   MODO DE EVENTO — desafios temporários contra o COM, usando o
   mesmo motor de partida da Campanha (matchsim.js), mas com
   condição de vitória customizada por evento (winCondition).

   Depende de funções já definidas em campaign.js:
     buildCampaignHomeLineup(), generateOpponentLineup(strength),
     applyPostMatchPlayerEffects(result)
   Por isso js/events.js precisa ser carregado DEPOIS de campaign.js
   no index.html.
   ========================================================= */

/* ---------- dados ---------- */
function getAllEvents(){
  return (GAME_DATA.events && GAME_DATA.events.activeEvents) || [];
}

function isEventInWindow(evt){
  const now = Date.now();
  const start = evt.start ? new Date(evt.start).getTime() : 0;
  const end = evt.end ? new Date(evt.end).getTime() : Infinity;
  return now >= start && now <= end;
}

function getActiveEvents(){
  return getAllEvents().filter(evt => evt.active && isEventInWindow(evt));
}

function getEvent(eventId){
  return getAllEvents().find(e => e.id === eventId) || null;
}

/* ---------- progresso salvo ---------- */
function ensureEventProgress(eventId){
  const ev = STATE.events;
  if(!(eventId in ev.points)) ev.points[eventId] = 0;
  if(!(eventId in ev.claimedMilestones)) ev.claimedMilestones[eventId] = [];
  if(!(eventId in ev.attemptsToday)) ev.attemptsToday[eventId] = { date: todayStr(), used: 0 };
  if(!(eventId in ev.history)) ev.history[eventId] = [];
  // reseta as tentativas do dia se mudou o dia
  if(ev.attemptsToday[eventId].date !== todayStr()){
    ev.attemptsToday[eventId] = { date: todayStr(), used: 0 };
  }
  return ev;
}

function ticketsLeft(evt){
  ensureEventProgress(evt.id);
  const used = STATE.events.attemptsToday[evt.id].used;
  return Math.max(0, (evt.dailyAttempts || 3) - used);
}

function formatEventTimeLeft(evt){
  const end = evt.end ? new Date(evt.end).getTime() : null;
  if(!end) return null;
  const diff = end - Date.now();
  if(diff <= 0) return "Encerrado";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if(days > 0) return `${days}d ${hours}h restantes`;
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${mins}min restantes`;
}

/* ---------- condição de vitória por evento ---------- */
function buildEventWinCondition(evt){
  return function(score){
    if(evt.mode === "goals"){
      const success = score.home >= (evt.goalTarget || 1);
      return { result: success ? "win" : "loss" };
    }
    if(evt.mode === "cleanSheet"){
      const success = score.away === 0 && score.home > 0;
      return { result: success ? "win" : "loss" };
    }
    // default: só vitória normal conta
    if(score.home > score.away) return { result: "win" };
    if(score.home < score.away) return { result: "loss" };
    return { result: "draw" };
  };
}

function eventObjectiveLabel(evt){
  if(evt.mode === "goals") return `Marque ${evt.goalTarget}+ gols na partida`;
  if(evt.mode === "cleanSheet") return "Vença sem sofrer gols";
  return "Vença a partida";
}

/* ---------- marcos de recompensa ---------- */
function checkEventMilestones(evt){
  ensureEventProgress(evt.id);
  const points = STATE.events.points[evt.id];
  const claimed = STATE.events.claimedMilestones[evt.id];
  (evt.milestones || []).forEach(m=>{
    if(points >= m.points && !claimed.includes(m.points)){
      claimed.push(m.points);
      addGift(`${evt.title} — ${m.points} vitória(s)`, "Recompensa de marco do Modo de Evento.", m.rewardGP, m.rewardCoins);
    }
  });
  persist();
}

/* ---------- jogar ---------- */
function startEventMatch(eventId){
  const evt = getEvent(eventId);
  if(!evt) return;
  ensureEventProgress(eventId);

  if(ticketsLeft(evt) <= 0){
    toast("Sem tentativas hoje. Volte amanhã para mais tickets.", "");
    return;
  }

  const homeLineup = (typeof buildCampaignHomeLineup === "function") ? buildCampaignHomeLineup() : null;
  if(!homeLineup) toast("Você ainda não montou uma escalação — usando time genérico. Ajuste em Game Plan.", "");

  const awayLineup = (typeof generateOpponentLineup === "function")
    ? generateOpponentLineup(evt.opponentStrength)
    : null;

  const playerStrength = Math.min(99, Math.max(35,
    homeLineup && homeLineup.length
      ? Math.round(homeLineup.reduce((s,p)=> s + (p.ovr || 65), 0) / homeLineup.length)
      : 65));

  const matchCfg = {
    competitionLabel: `Modo de Evento — ${evt.title}`,
    title: evt.title,
    homeTeamName: "Meu Clube",
    awayTeamName: "COM",
    homeLineup,
    awayLineup,
    playerStrength,
    opponentStrength: evt.opponentStrength,
    totalChances: evt.totalChances || 8,
    winCondition: buildEventWinCondition(evt),
    onComplete: (result) => {
      STATE.events.attemptsToday[evt.id].used += 1;

      if(typeof applyPostMatchPlayerEffects === "function") applyPostMatchPlayerEffects(result);

      const success = result.result === "win";
      if(success) STATE.events.points[evt.id] += 1;

      STATE.events.history[evt.id].unshift({
        date: Date.now(),
        score: `${result.homeGoals}-${result.awayGoals}`,
        result: result.result,
      });
      STATE.events.history[evt.id] = STATE.events.history[evt.id].slice(0, 20);

      persist();
      if(success) checkEventMilestones(evt);

      toast(success ? "Objetivo do evento cumprido! Ponto de evento conquistado." : "Não foi dessa vez — tente novamente.", success ? "success" : "");
      renderEventoScreen();
    }
  };

  // Eventos podem marcar "engine":"arcade" ou "engine":"penalty" em
  // data/events.json para usar o Modo Arcade (js/arcade.js) ou o Modo
  // Pênaltis (js/penalty.js) em vez do motor de QTE padrão (matchsim.js).
  if(evt.engine === "arcade" && typeof startArcadeMatch === "function"){
    startArcadeMatch(matchCfg);
  } else if(evt.engine === "penalty" && typeof startPenaltyMatch === "function"){
    startPenaltyMatch(matchCfg);
  } else if(evt.engine === "soccer2d" && typeof startSoccer2DMatch === "function"){
    startSoccer2DMatch(Object.assign({ difficulty: evt.difficulty || "normal", matchSeconds: evt.matchSeconds || 60 }, matchCfg));
  } else {
    startMatch(matchCfg);
  }
}

/* ---------- tela ---------- */
function renderEventoScreen(){
  const wrap = document.getElementById("eventoList");
  if(!wrap) return;

  const events = getActiveEvents();
  if(!events.length){
    wrap.innerHTML = `<div class="empty-state"><div class="big">🏆</div>Nenhum evento ativo no momento. Volte em breve!</div>`;
    return;
  }

  wrap.innerHTML = events.map(evt=>{
    ensureEventProgress(evt.id);
    const points = STATE.events.points[evt.id];
    const milestones = evt.milestones || [];
    const maxPoints = milestones.length ? milestones[milestones.length - 1].points : 1;
    const pct = Math.min(100, Math.round((points / maxPoints) * 100));
    const tickets = ticketsLeft(evt);
    const timeLeft = formatEventTimeLeft(evt);

    const milestoneChips = milestones.map(m=>{
      const done = points >= m.points;
      const rewardTxt = [m.rewardGP ? `${m.rewardGP.toLocaleString("pt-BR")} GP` : null, m.rewardCoins ? `${m.rewardCoins} Moedas` : null].filter(Boolean).join(" + ");
      return `<div class="event-milestone ${done ? "done" : ""}">
        <span class="event-milestone-pts">${m.points}</span>
        <span class="event-milestone-reward">${rewardTxt}</span>
        ${done ? '<span class="event-milestone-check">✓</span>' : ""}
      </div>`;
    }).join("");

    return `
    <div class="event-card">
      <div class="event-banner" style="background-image:url('${evt.banner}')">
        <div class="event-banner-shade"></div>
        <div class="event-banner-body">
          <div class="event-title">${evt.title}</div>
          ${timeLeft ? `<div class="event-timeleft">${timeLeft}</div>` : ""}
        </div>
      </div>
      <div class="event-body">
        <p class="event-desc">${evt.description}</p>
        <div class="event-objective">🎯 ${eventObjectiveLabel(evt)}</div>

        <div class="box-progress" style="margin:10px 0;">
          <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
          <span>${points}/${maxPoints}</span>
        </div>

        <div class="event-milestones">${milestoneChips}</div>

        <div class="event-actions">
          <span class="event-tickets">${tickets}/${evt.dailyAttempts} tentativas hoje</span>
          <button class="btn btn-primary" ${tickets<=0?"disabled":""} onclick="startEventMatch('${evt.id}')">Jogar ›</button>
        </div>
      </div>
    </div>`;
  }).join("");
}
