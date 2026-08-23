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

/* ---------- eventos "externos" (jogar num site parceiro OU num emulador local) ---------- */
// engine "external"  -> abre um site parceiro num iframe
// engine "emulator"  -> roda um emulador (EmulatorJS) direto no nosso frame, sem site de terceiros
function isTimedPlayEngine(evt){
  return evt.engine === "external" || evt.engine === "emulator";
}

function ensureExternalTimer(eventId){
  if(!STATE.events.externalTimers) STATE.events.externalTimers = {};
  if(!(eventId in STATE.events.externalTimers)) STATE.events.externalTimers[eventId] = null;
  return STATE.events.externalTimers;
}

// retorna { state: "idle" | "running" | "ready", remainingMs }
function externalTimerStatus(evt){
  ensureExternalTimer(evt.id);
  const startedAt = STATE.events.externalTimers[evt.id];
  if(!startedAt) return { state: "idle" };
  const durationMs = (evt.durationMinutes || 30) * 60000;
  const elapsed = Date.now() - startedAt;
  if(elapsed >= durationMs) return { state: "ready" };
  return { state: "running", remainingMs: durationMs - elapsed };
}

function formatCountdown(ms){
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildMilestoneChipsHtml(evt){
  ensureEventProgress(evt.id);
  const points = STATE.events.points[evt.id];
  const milestones = evt.milestones || [];
  return milestones.map(m=>{
    const done = points >= m.points;
    const rewardTxt = [
      m.rewardGP ? `${m.rewardGP.toLocaleString("pt-BR")} GP` : null,
      m.rewardCoins ? `${m.rewardCoins} Moedas` : null,
      m.rewardBoxSpinCount ? `🎁 ${m.rewardBoxSpinCount} giro${m.rewardBoxSpinCount===1?"":"s"} na Box` : null,
    ].filter(Boolean).join(" + ");
    return `<div class="event-milestone ${done ? "done" : ""}">
      <span class="event-milestone-pts">${m.points}</span>
      <span class="event-milestone-reward">${rewardTxt}</span>
      ${done ? '<span class="event-milestone-check">✓</span>' : ""}
    </div>`;
  }).join("");
}

/* ---------- helper: aviso de download (ex.: ROM de emulador ~500MB) ---------- */
function eventDownloadWarningText(evt){
  if(!evt.downloadSizeMB) return null;
  return `📥 Este evento baixa cerca de <strong>${evt.downloadSizeMB}MB</strong> de arquivos no seu dispositivo na primeira vez que você jogar. Recomendado usar Wi‑Fi.`;
}
function eventDownloadBadgeText(evt){
  if(!evt.downloadSizeMB) return null;
  return `📥 ~${evt.downloadSizeMB}MB`;
}

/* ---------- submenu (modal de detalhes do evento) — capa cheia + marcos + (se for o caso) frame do jogo ---------- */
function ensureEventDetailModal(){
  let modal = document.getElementById("eventDetailModal");
  if(modal) return modal;

  modal = document.createElement("div");
  modal.id = "eventDetailModal";
  modal.className = "event-play-overlay hidden";
  modal.innerHTML = `
    <div class="event-play-inner">
      <div class="event-play-banner">
        <div class="event-play-banner-shade"></div>
        <button type="button" class="event-play-close" aria-label="Fechar">✕</button>
        <div class="event-play-banner-body">
          <div class="event-play-title"></div>
          <div class="event-play-timeleft"></div>
        </div>
      </div>
      <div class="event-play-content">
        <p class="event-play-desc"></p>
        <div class="event-play-download-warning hidden"></div>
        <div class="event-play-objective"></div>

        <div class="box-progress" style="margin:10px 0;">
          <div class="progress-track"><div class="progress-fill event-play-progress-fill" style="width:0%"></div></div>
          <span class="event-play-progress-label"></span>
        </div>

        <div class="event-play-milestones-label">Recompensas</div>
        <div class="event-play-milestones"></div>

        <div class="event-play-frame-wrap hidden">
          <iframe class="event-play-frame event-play-iframe" src="" loading="lazy" allow="fullscreen; autoplay" allowfullscreen></iframe>
          <div class="event-play-frame event-play-emulator hidden" id="eventEmulatorMount"></div>
        </div>
        <div class="event-play-fallback event-play-fallback-external hidden">
          Se o jogo não carregar aqui dentro, <a class="event-play-opentab" href="#" target="_blank" rel="noopener">abra em uma nova aba ↗</a>.
        </div>
        <div class="event-play-fallback event-play-fallback-emulator hidden">
          Rodando localmente com EmulatorJS — nenhum site de terceiros é aberto. Se a ROM não estiver disponível, avisamos aqui.
        </div>

        <div class="event-play-actions">
          <span class="event-play-timer"></span>
          <button type="button" class="btn btn-primary event-play-action"></button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.querySelector(".event-play-close").onclick = closeEventDetailModal;
  modal.addEventListener("click", (e)=>{ if(e.target === modal) closeEventDetailModal(); });

  return modal;
}

function closeEventDetailModal(){
  const modal = document.getElementById("eventDetailModal");
  if(!modal) return;
  modal.classList.add("hidden");
  // pausa o site parceiro ao fechar, pra não ficar rodando escondido
  const iframe = modal.querySelector(".event-play-iframe");
  if(iframe) iframe.src = "about:blank";
  // desliga o emulador local (se estava rodando), sem deixar áudio tocando escondido
  teardownLocalEmulator();
}

function openEventDetailModal(eventId){
  const evt = getEvent(eventId);
  if(!evt) return;
  ensureEventProgress(eventId);
  ensureExternalTimer(eventId);

  const modal = ensureEventDetailModal();
  modal.dataset.eventId = eventId;
  modal.querySelector(".event-play-banner").style.backgroundImage = `url('${evt.banner}')`;
  modal.querySelector(".event-play-title").textContent = evt.title;
  const timeLeft = formatEventTimeLeft(evt);
  modal.querySelector(".event-play-timeleft").textContent = timeLeft || "";
  modal.querySelector(".event-play-desc").textContent = evt.description;
  modal.querySelector(".event-play-objective").textContent = `🎯 ${eventObjectiveLabel(evt)}`;

  const warningEl = modal.querySelector(".event-play-download-warning");
  const warningTxt = eventDownloadWarningText(evt);
  if(warningTxt){
    warningEl.innerHTML = warningTxt;
    warningEl.classList.remove("hidden");
  } else {
    warningEl.classList.add("hidden");
  }

  const points = STATE.events.points[evt.id];
  const milestones = evt.milestones || [];
  const maxPoints = milestones.length ? milestones[milestones.length - 1].points : 1;
  const pct = Math.min(100, Math.round((points / maxPoints) * 100));
  modal.querySelector(".event-play-progress-fill").style.width = `${pct}%`;
  modal.querySelector(".event-play-progress-label").textContent = `${points}/${maxPoints}`;
  modal.querySelector(".event-play-milestones").innerHTML = buildMilestoneChipsHtml(evt);

  const frameWrap = modal.querySelector(".event-play-frame-wrap");
  const iframe = modal.querySelector(".event-play-iframe");
  const emuMount = modal.querySelector(".event-play-emulator");
  const fbExternal = modal.querySelector(".event-play-fallback-external");
  const fbEmulator = modal.querySelector(".event-play-fallback-emulator");

  if(isTimedPlayEngine(evt)){
    frameWrap.classList.remove("hidden");
    if(evt.engine === "emulator"){
      iframe.classList.add("hidden");
      iframe.src = "about:blank";
      fbExternal.classList.add("hidden");
      emuMount.classList.remove("hidden");
      fbEmulator.classList.remove("hidden");
      setupLocalEmulator(evt, emuMount);
    } else {
      emuMount.classList.add("hidden");
      fbEmulator.classList.add("hidden");
      iframe.classList.remove("hidden");
      fbExternal.classList.remove("hidden");
      if(iframe.src !== evt.externalUrl) iframe.src = evt.externalUrl;
      modal.querySelector(".event-play-opentab").href = evt.externalUrl;
    }
  } else {
    // eventos "normais" (arcade/pênaltis/2D/etc.) não precisam de frame —
    // só mostramos o resumo + botão de jogar, sem site/emulador embutido.
    frameWrap.classList.add("hidden");
    fbExternal.classList.add("hidden");
    fbEmulator.classList.add("hidden");
    iframe.src = "about:blank";
    teardownLocalEmulator();
  }

  updateEventDetailModalAction(evt);
  modal.classList.remove("hidden");

  if(externalTimerStatus(evt).state === "running" && !_externalTimerInterval){
    _externalTimerInterval = setInterval(tickExternalTimers, 1000);
  }
}

/* ---------- emulador local (EmulatorJS), sem site de terceiros ---------- */
// Roda o jogo dentro do nosso próprio frame usando o EmulatorJS,
// que a gente hospeda em assets/emulatorjs/data (js/css/localização).
// Só os "núcleos" (o motor de emulação em si, ex.: pcsx_rearmed) podem
// ser baixados de um CDN neutro caso não estejam vendorizados localmente
// em assets/emulatorjs/data/cores — isso é padrão do próprio projeto
// EmulatorJS e NÃO abre nenhum site/jogo de terceiros na tela.
// A ROM do jogo (assets/roms/...) precisa ser fornecida por você.
// loader.js já lê as variáveis window.EJS_* e cria window.EJS_emulator
// sozinho (não precisamos chamar "new EmulatorJS(...)" na mão). Por isso
// cada vez que o modal abre a gente reinjeta o <script> pra ele rodar de
// novo com a config atual.
function injectEmulatorLoaderScript(){
  return new Promise((resolve, reject) => {
    const old = document.getElementById("ejsLoaderScript");
    if(old) old.remove();
    const script = document.createElement("script");
    script.id = "ejsLoaderScript";
    script.src = "assets/emulatorjs/data/loader.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Falha ao carregar o EmulatorJS local (assets/emulatorjs/data/loader.js)."));
    document.body.appendChild(script);
  });
}

async function setupLocalEmulator(evt, mountEl){
  const cfg = evt.emulator || {};
  mountEl.innerHTML = "";
  teardownLocalEmulator(false);

  if(!cfg.gameUrl){
    mountEl.innerHTML = `<div class="event-emulator-msg">Configuração do emulador incompleta neste evento (falta emulator.gameUrl em data/events.json).</div>`;
    return;
  }

  // checa se o arquivo da ROM existe antes de inicializar o emulador,
  // pra dar uma mensagem clara em vez de o EmulatorJS travar tentando
  // baixar um arquivo que não existe
  try{
    const head = await fetch(cfg.gameUrl, { method: "HEAD" });
    if(!head.ok) throw new Error("not found");
  } catch(e){
    mountEl.innerHTML = `<div class="event-emulator-msg">
      ROM não encontrada em <code>${cfg.gameUrl}</code>.<br>
      Adicione o arquivo do jogo nessa pasta (veja assets/roms/LEIA-ME.txt) — não incluímos ROMs de jogos no projeto.
    </div>`;
    return;
  }

  const playDiv = document.createElement("div");
  playDiv.id = "eventEmulatorGame";
  mountEl.appendChild(playDiv);

  window.EJS_player = "#eventEmulatorGame";
  window.EJS_core = cfg.core || cfg.system || "psx";
  window.EJS_pathtodata = "assets/emulatorjs/data/";
  window.EJS_gameUrl = cfg.gameUrl;
  window.EJS_gameName = cfg.gameName || evt.title;
  window.EJS_biosUrl = cfg.biosUrl || "";
  window.EJS_startOnLoaded = true;
  window.EJS_language = "pt-BR";

  try{
    await injectEmulatorLoaderScript();
  } catch(err){
    mountEl.innerHTML = `<div class="event-emulator-msg">Não foi possível iniciar o emulador: ${err.message}</div>`;
  }
}

function teardownLocalEmulator(clearMount){
  if(window.EJS_emulator){
    try{ window.EJS_emulator.callEvent && window.EJS_emulator.callEvent("exit"); }catch(e){}
    window.EJS_emulator = undefined;
  }
  if(clearMount !== false){
    const mount = document.getElementById("eventEmulatorMount");
    if(mount) mount.innerHTML = "";
  }
}

function updateEventDetailModalAction(evt){
  const modal = document.getElementById("eventDetailModal");
  if(!modal || modal.dataset.eventId !== evt.id) return;

  const tickets = ticketsLeft(evt);
  const timerEl = modal.querySelector(".event-play-timer");
  const btn = modal.querySelector(".event-play-action");

  if(!isTimedPlayEngine(evt)){
    // eventos "normais": o botão só inicia a partida (motor de campanha/arcade/etc.)
    timerEl.textContent = tickets > 0 ? `${tickets}/${evt.dailyAttempts} tentativa(s) hoje` : "Sem tentativas hoje";
    btn.textContent = "Jogar ▶";
    btn.disabled = tickets <= 0;
    btn.onclick = () => { closeEventDetailModal(); startEventMatch(evt.id); };
    return;
  }

  const status = externalTimerStatus(evt);
  if(status.state === "running"){
    timerEl.textContent = `⏱ ${formatCountdown(status.remainingMs)} restantes`;
    btn.textContent = "Jogando… (aguarde o cronômetro)";
    btn.disabled = true;
    btn.onclick = null;
  } else if(status.state === "ready"){
    timerEl.textContent = "Tempo completo! ✅";
    btn.textContent = "Resgatar recompensa 🎁";
    btn.disabled = false;
    btn.onclick = () => { claimExternalEventReward(evt.id); closeEventDetailModal(); };
  } else {
    timerEl.textContent = tickets > 0 ? `${tickets}/${evt.dailyAttempts} jogada(s) hoje` : "Sem jogadas hoje";
    btn.textContent = "Começar a jogar (inicia o cronômetro) ▶";
    btn.disabled = tickets <= 0;
    btn.onclick = () => beginExternalEventTimer(evt.id);
  }
}

function beginExternalEventTimer(eventId){
  const evt = getEvent(eventId);
  if(!evt) return;
  ensureEventProgress(eventId);
  ensureExternalTimer(eventId);

  if(ticketsLeft(evt) <= 0){
    toast("Sem tentativas hoje. Volte amanhã pra jogar de novo.", "");
    return;
  }
  if(externalTimerStatus(evt).state !== "idle") return;

  STATE.events.externalTimers[eventId] = Date.now();
  persist();
  toast(`Cronômetro iniciado! Jogue por ${evt.durationMinutes || 30} minutos e volte aqui pra resgatar.`, "success");
  updateEventDetailModalAction(evt);
  renderEventoScreen();

  if(!_externalTimerInterval) _externalTimerInterval = setInterval(tickExternalTimers, 1000);
}

function claimExternalEventReward(eventId){
  const evt = getEvent(eventId);
  if(!evt) return;
  ensureEventProgress(eventId);
  ensureExternalTimer(eventId);

  const status = externalTimerStatus(evt);
  if(status.state !== "ready"){
    toast("Ainda não deu o tempo. Continue jogando no site!", "");
    return;
  }

  STATE.events.attemptsToday[evt.id].used += 1;
  STATE.events.points[evt.id] += 1;
  STATE.events.externalTimers[evt.id] = null;
  STATE.events.history[evt.id].unshift({ date: Date.now(), score: "-", result: "win" });
  STATE.events.history[evt.id] = STATE.events.history[evt.id].slice(0, 20);

  persist();
  checkEventMilestones(evt);
  toast("Recompensa resgatada! Obrigado por jogar.", "success");
  renderEventoScreen();
}

// atualiza os cronômetros na tela (e no modal, se estiver aberto) sem
// precisar re-renderizar tudo a cada segundo
let _externalTimerInterval = null;
function tickExternalTimers(){
  const screenEl = document.getElementById("screen-evento");
  const evtoScreenActive = !!screenEl && screenEl.classList.contains("active");
  const modal = document.getElementById("eventDetailModal");
  const modalOpen = !!modal && !modal.classList.contains("hidden");

  if(!evtoScreenActive && !modalOpen){
    clearInterval(_externalTimerInterval);
    _externalTimerInterval = null;
    return;
  }

  const externalEvents = getActiveEvents().filter(isTimedPlayEngine);
  let anyRunning = false;
  externalEvents.forEach(evt=>{
    const status = externalTimerStatus(evt);
    if(status.state === "running"){
      anyRunning = true;
      const card = document.querySelector(`.event-card[onclick*="${evt.id}"] .event-card-meta`);
      if(card) card.textContent = `⏱ ${formatCountdown(status.remainingMs)} restantes`;
      if(modalOpen && modal.dataset.eventId === evt.id) updateEventDetailModalAction(evt);
    } else if(status.state === "ready"){
      // acabou de virar — re-renderiza o card e/ou o modal pra trocar o botão pra "Resgatar"
      if(evtoScreenActive) renderEventoScreen();
      if(modalOpen && modal.dataset.eventId === evt.id) updateEventDetailModalAction(evt);
    }
  });
  if(!anyRunning){
    clearInterval(_externalTimerInterval);
    _externalTimerInterval = null;
  }
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
  if(evt.engine === "external") return `Jogue ${evt.durationMinutes || 30} minutos no site parceiro`;
  if(evt.engine === "emulator") return `Jogue ${evt.durationMinutes || 30} minutos no emulador`;
  if(evt.mode === "goals") return `Marque ${evt.goalTarget}+ gols na partida`;
  if(evt.mode === "cleanSheet") return "Vença sem sofrer gols";
  return "Vença a partida";
}

/* ---------- marcos de recompensa ----------
   Além de GP/Moedas, um marco pode conceder giro(s) numa Box
   category:"eventspin" (ex: Box Big Time), usando os campos opcionais
   "rewardBoxSpinBoxId" + "rewardBoxSpinCount" no marco (em
   data/events.json). O giro cai direto no saldo da Box (ver
   grantEventBoxSpin em js/state.js) — não passa pela Caixa de
   Presentes, já que não é GP/Moedas. */
function checkEventMilestones(evt){
  ensureEventProgress(evt.id);
  const points = STATE.events.points[evt.id];
  const claimed = STATE.events.claimedMilestones[evt.id];
  (evt.milestones || []).forEach(m=>{
    if(points >= m.points && !claimed.includes(m.points)){
      claimed.push(m.points);
      if(m.rewardGP || m.rewardCoins){
        addGift(`${evt.title} — ${m.points} vitória(s)`, "Recompensa de marco do Modo de Evento.", m.rewardGP, m.rewardCoins);
      }
      if(m.rewardBoxSpinBoxId && m.rewardBoxSpinCount){
        grantEventBoxSpin(m.rewardBoxSpinBoxId, m.rewardBoxSpinCount);
        const spinBox = (typeof getEffectiveBox === "function") ? getEffectiveBox(m.rewardBoxSpinBoxId) : null;
        toast(`🎁 Giro ganho na Box ${spinBox ? spinBox.name : m.rewardBoxSpinBoxId}!`, "success");
      }
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
      addMatchPassXP(result.result);

      if(typeof applyPostMatchPlayerEffects === "function") applyPostMatchPlayerEffects(result);

      // O motor Arena 2D (soccer2d.js) não recebe winCondition — ele
      // sempre devolve o resultado "cru" comparando o placar. Pra
      // eventos com mode "goals"/"cleanSheet" continuarem funcionando
      // do mesmo jeito com esse motor, recalculamos o resultado aqui
      // a partir do placar final usando a mesma regra dos outros motores.
      const outcome = (evt.engine === "soccer2d" || evt.engine === "beachvolley")
        ? buildEventWinCondition(evt)({ home: result.homeGoals, away: result.awayGoals }).result
        : result.result;

      const success = outcome === "win";
      if(success) STATE.events.points[evt.id] += 1;

      STATE.events.history[evt.id].unshift({
        date: Date.now(),
        score: `${result.homeGoals}-${result.awayGoals}`,
        result: outcome,
      });
      STATE.events.history[evt.id] = STATE.events.history[evt.id].slice(0, 20);

      persist();
      if(success) checkEventMilestones(evt);

      toast(success ? "Objetivo do evento cumprido! Ponto de evento conquistado." : "Não foi dessa vez — tente novamente.", success ? "success" : "");
      renderEventoScreen();
    }
  };

  // Eventos podem marcar "engine":"arcade", "engine":"penalty",
  // "engine":"soccer2d" ou "engine":"beachvolley" em data/events.json
  // para usar o Modo Arcade (js/arcade.js), o Modo Pênaltis
  // (js/penalty.js), o Modo Arena 2D (js/soccer2d.js) ou o Modo
  // Vôlei de Praia (js/beachvolley.js) em vez do motor de QTE
  // padrão (matchsim.js).
  if(evt.engine === "arcade" && typeof startArcadeMatch === "function"){
    startArcadeMatch(matchCfg);
  } else if(evt.engine === "penalty" && typeof startPenaltyMatch === "function"){
    startPenaltyMatch(matchCfg);
  } else if(evt.engine === "soccer2d" && typeof startSoccer2DMatch === "function"){
    startSoccer2DMatch(Object.assign({}, matchCfg, {
      difficulty: evt.difficulty || "normal",
      matchSeconds: evt.matchSeconds || 90,
    }));
  } else if(evt.engine === "beachvolley" && typeof startBeachVolleyMatch === "function"){
    startBeachVolleyMatch(Object.assign({}, matchCfg, {
      difficulty: evt.difficulty || "normal",
      pointsToWin: evt.pointsToWin || 7,
    }));
  } else {
    startMatch(matchCfg);
  }
}

/* ---------- tela ---------- */
function renderEventoScreen(){
  const wrap = document.getElementById("eventoList");
  if(!wrap) return;

  const events = getActiveEvents();
  const activeClubCups = (typeof getActiveClubCups === "function") ? getActiveClubCups() : [];
  if(!events.length && !activeClubCups.length){
    wrap.innerHTML = `<div class="empty-state"><div class="big">🏆</div>Nenhum evento ativo no momento. Volte em breve!</div>`;
    return;
  }

  wrap.innerHTML = events.map(evt=>{
    ensureEventProgress(evt.id);
    const tickets = ticketsLeft(evt);
    const timeLeft = formatEventTimeLeft(evt);
    const downloadBadge = eventDownloadBadgeText(evt);

    // resumo curtinho no rodapé do card — o resto (descrição, prêmios,
    // marcos, jogar) só aparece no submenu, ao clicar no card.
    let metaText;
    if(isTimedPlayEngine(evt)){
      const extStatus = externalTimerStatus(evt);
      if(extStatus.state === "running") metaText = `⏱ ${formatCountdown(extStatus.remainingMs)} restantes`;
      else if(extStatus.state === "ready") metaText = "Recompensa pronta 🎁";
      else metaText = tickets > 0 ? `${tickets}/${evt.dailyAttempts} jogada(s) hoje` : "Sem jogadas hoje";
    } else {
      metaText = tickets > 0 ? `${tickets}/${evt.dailyAttempts} tentativa(s) hoje` : "Sem tentativas hoje";
    }

    return `
    <button type="button" class="event-card" onclick="openEventDetailModal('${evt.id}')">
      <div class="event-card-banner" style="background-image:url('${evt.banner}')">
        <div class="event-card-shade"></div>
        ${downloadBadge ? `<div class="event-download-badge">${downloadBadge}</div>` : ""}
        <div class="event-card-body">
          <div class="event-title">${evt.title}</div>
          ${timeLeft ? `<div class="event-timeleft">${timeLeft}</div>` : ""}
        </div>
      </div>
      <div class="event-card-footer">
        <span class="event-card-meta">${metaText}</span>
        <span class="event-card-cta">Ver detalhes ›</span>
      </div>
    </button>`;
  }).join("") + renderClubCupEventCards();

  // liga o cronômetro ao vivo (mm:ss) se houver algum evento externo rodando
  clearInterval(_externalTimerInterval);
  _externalTimerInterval = null;
  const hasRunningExternal = events.some(e => isTimedPlayEngine(e) && externalTimerStatus(e).state === "running");
  if(hasRunningExternal){
    _externalTimerInterval = setInterval(tickExternalTimers, 1000);
  }
}
