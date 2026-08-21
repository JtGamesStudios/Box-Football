/* =========================================================
   KONAMI CUP / MATCHDAY — evento rotativo automático.

   Regra do loop (para sempre, sem precisar mexer em nada):
     - Toda semana existem 2 janelas de evento:
         Domingo 00:00  → Quarta-feira 00:00  (3 dias)
         Quarta-feira 00:00 → Domingo 00:00   (4 dias)
     - Em cada janela, o jogo entra automaticamente com DOIS
       eventos iguais (um pagando mais em Moedas, outro pagando
       mais em GP) — mesmo padrão já usado em "Muralha de Aço".
     - Se algum clássico de CLASSIC_MATCHES cair dentro da janela
       atual, os dois eventos viram "MATCHDAY" (tema do clássico,
       banner do Matchday). Caso não tenha nenhum clássico na
       janela, os dois eventos ficam como "Konami Cup" (o padrão).
     - Isso roda sozinho, pra sempre, recalculando a cada load e
       a cada 60s pelo Live Content Watcher (main.js).

   COMO ADICIONAR UM CLÁSSICO NOVO:
   Só adicione um item no array CLASSIC_MATCHES abaixo, com a data
   (fuso Brasília) e os dois times. Nenhuma outra alteração é
   necessária — o resto é calculado sozinho.
   ========================================================= */

const CLASSIC_MATCHES = [
  { date: "2026-09-05", home: "Internazionale", away: "Napoli",         competition: "Serie A" },
  { date: "2026-09-06", home: "Juventus",        away: "Milan",          competition: "Serie A" },
  { date: "2026-09-06", home: "Everton",         away: "Manchester United", competition: "Premier League" },
  { date: "2026-09-06", home: "Arsenal",         away: "Chelsea",        competition: "Premier League" },
  { date: "2026-09-20", home: "Real Madrid",     away: "Atlético de Madrid", competition: "La Liga" },
  { date: "2026-09-13", home: "Lazio",           away: "Milan",          competition: "Serie A" },
];

/* ---------- utilidades de data (fuso de Brasília, UTC-3 fixo) ---------- */
function mdBrasiliaDateOnly(d) {
  const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
  const br = new Date(utcMs + -3 * 60 * 60000);
  return new Date(br.getFullYear(), br.getMonth(), br.getDate());
}

function mdAddDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function mdISODateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* Retorna a janela atual { start, end, startISO, endISO } no loop
   Domingo->Quarta / Quarta->Domingo, calculado a partir de "agora". */
function getCurrentMatchdayWindow(now) {
  const today = mdBrasiliaDateOnly(now || new Date());
  const day = today.getDay(); // 0=domingo ... 3=quarta ... 6=sábado
  const sinceSunday = day;
  const sinceWednesday = (day - 3 + 7) % 7;

  let start, end;
  if (sinceSunday <= sinceWednesday) {
    start = mdAddDays(today, -sinceSunday);
    end = mdAddDays(start, 3); // domingo -> quarta
  } else {
    start = mdAddDays(today, -sinceWednesday);
    end = mdAddDays(start, 4); // quarta -> domingo
  }
  return { start, end, startISO: mdISODateOnly(start), endISO: mdISODateOnly(end) };
}

/* Clássicos cuja data cai dentro da janela [start, end] (inclusive). */
function getClassicsInWindow(win) {
  return CLASSIC_MATCHES.filter(m => {
    const d = new Date(m.date + "T00:00:00");
    return d >= win.start && d <= win.end;
  });
}

/* ---------- geração dos eventos dinâmicos ---------- */
function buildMatchdayDynamicEvents(now) {
  const win = getCurrentMatchdayWindow(now || new Date());
  const classics = getClassicsInWindow(win);
  const startISO = `${win.startISO}T00:00:00`;
  const endISO = `${win.endISO}T00:00:00`;
  const idSuffix = win.startISO;

  let title, description, banner;

  if (classics.length > 0) {
    const main = classics[0];
    const extra = classics.length - 1;
    title = `MATCHDAY: ${main.home} x ${main.away}`;
    description = extra > 0
      ? `Fim de semana de clássicos! ${main.home} x ${main.away}${main.competition ? ` (${main.competition})` : ""} e mais ${extra} clássico${extra === 1 ? "" : "s"} rolando pelo mundo. Vença partidas contra o COM pra faturar prêmios.`
      : `${main.home} x ${main.away}${main.competition ? ` — ${main.competition}` : ""}. Vença partidas contra o COM pra faturar prêmios enquanto o clássico não começa.`;
    banner = "assets/banners/banner-home-matchday.jpg";
  } else {
    title = "Konami Cup";
    description = "A taça de sempre! Vença partidas contra o COM pra faturar prêmios em Moedas e GP.";
    banner = "assets/banners/banner-home-konamicup.jpg";
  }

  const base = {
    active: true,
    banner,
    start: startISO,
    end: endISO,
    mode: "default",
    goalTarget: null,
    opponentStrength: 68,
    totalChances: 8,
  };

  const coinsEvent = Object.assign({}, base, {
    id: `evt_md_${idSuffix}_coins`,
    title: `${title} — Moedas`,
    description,
    dailyAttempts: 5,
    milestones: [
      { points: 1, rewardGP: 0, rewardCoins: 80 },
      { points: 3, rewardGP: 0, rewardCoins: 150 },
      { points: 5, rewardGP: 0, rewardCoins: 250 },
      { points: 8, rewardGP: 0, rewardCoins: 500 },
    ],
  });

  const gpEvent = Object.assign({}, base, {
    id: `evt_md_${idSuffix}_gp`,
    title: `${title} — GP`,
    description,
    dailyAttempts: 5,
    milestones: [
      { points: 1, rewardGP: 3000,  rewardCoins: 20 },
      { points: 3, rewardGP: 8000,  rewardCoins: 30 },
      { points: 5, rewardGP: 15000, rewardCoins: 50 },
      { points: 8, rewardGP: 40000, rewardCoins: 100 },
    ],
  });

  return [coinsEvent, gpEvent];
}

/* Injeta (ou atualiza) os 2 eventos dinâmicos da janela atual dentro
   de GAME_DATA.events.activeEvents, sem mexer nos eventos estáticos
   do events.json. Chamado no boot() e a cada checagem do Live
   Content Watcher, pra virar de janela sozinho. */
function injectMatchdayEvents() {
  if (!GAME_DATA.events) return;
  if (!GAME_DATA.events.activeEvents) GAME_DATA.events.activeEvents = [];

  const list = GAME_DATA.events.activeEvents.filter(e => !String(e.id).startsWith("evt_md_"));
  const dynamicEvents = buildMatchdayDynamicEvents(new Date());
  GAME_DATA.events.activeEvents = list.concat(dynamicEvents);
}
