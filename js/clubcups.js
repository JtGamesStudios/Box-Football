/* =========================================================
   COPAS DE CLUBES — eventos temáticos estilo "England"/"Brasileirão"
   do eFootball: clubes parceiros sem precisar de licença, sempre
   jogando em casa, contra times de fora sortidos. Fase de grupos
   (todos contra todos) + mata-mata até ser campeão.

   MECÂNICA CENTRAL: o time do clube escolhido é montado a partir de
   uma lista de jogadores REAIS daquele elenco (roster, por nome). Pra
   cada nome, se a pessoa já tem uma carta daquele jogador na coleção
   (qualquer edição), usa a carta dela de verdade (com o overall que
   ela tem); se não tem, entra um "jogador emprestado" genérico. Isso
   faz a força do time depender de quanto da coleção daquele clube a
   pessoa já juntou.

   ESTE ARQUIVO AINDA USA DADOS DE TESTE (data/club-cups.json com
   nomes fictícios "[TESTE]") — trocar pelos elencos reais assim que
   a liga for decidida. O motor abaixo é genérico e não muda.
   ========================================================= */

const CLUBCUP_BORROWED_OVR = 68; // overall do "jogador emprestado" quando a pessoa não tem a carta daquele nome
const CLUBCUP_POS_ORDER = ["GOL","ZAG","ZAG","LAT","LAT","VOL","VOL","MEI","PON","PON","ATA"];

function ccNormalizeName(s){
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .toUpperCase()
    .replace(/^[A-Z]\.\s*/, "") // tira inicial tipo "D. " de "D. De Gea"
    .replace(/[^A-Z\s]/g, "")
    .trim();
}

function getClubCupById(id){
  return (GAME_DATA.clubCups || []).find(c => c.id === id);
}

/* Acha, dentro da coleção da pessoa, a melhor carta (maior overall)
   cujo nome bate com o nome real do roster. Comparação frouxa (sem
   acento, ignora inicial de primeiro nome) pra pegar variações tipo
   "B. Fernandes" vs "Bruno Fernandes" vs "BRUNO FERNANDES". */
function ccFindOwnedByName(realName){
  const target = ccNormalizeName(realName);
  if(!target) return null;
  let best = null;
  (STATE.ownedPlayers || []).forEach(p=>{
    const n = ccNormalizeName(p.name);
    if(n === target || n.endsWith(" " + target) || target.endsWith(" " + n)){
      if(!best || (p.overall||0) > (best.overall||0)) best = p;
    }
  });
  return best;
}

/* Monta a escalação (formato usado por startSoccer2DMatch) pra um
   clube "casa" (com roster de nomes reais), usando cartas da coleção
   quando existem e "emprestados" genéricos quando não. */
function resolveClubLineup(club){
  return (club.roster || []).map((slot, i)=>{
    const owned = ccFindOwnedByName(slot.name);
    if(owned){
      return { number: owned.number || i+1, name: owned.name, pos: slot.pos, id: owned.id, ovr: owned.overall ?? owned.ovr ?? CLUBCUP_BORROWED_OVR, borrowed:false };
    }
    return { number: i+1, name: slot.name, pos: slot.pos, id: null, ovr: CLUBCUP_BORROWED_OVR, borrowed:true };
  });
}

function ccClubStrength(club){
  if(club.roster){
    const lineup = resolveClubLineup(club);
    return Math.round(lineup.reduce((s,p)=> s + (p.ovr||CLUBCUP_BORROWED_OVR), 0) / lineup.length);
  }
  return club.npcStrength || 65;
}

function ccAllClubs(cup){
  return [...cup.homeClubs, ...cup.opponentClubs];
}

function ccClubById(cup, id){
  return ccAllClubs(cup).find(c => c.id === id);
}

/* Simula um confronto entre 2 clubes que a pessoa NÃO está jogando
   (ex: os outros 6 jogos do próprio grupo, ou o grupo inteiro que
   ela não está). Resultado pesado pela diferença de força, com um
   tempero aleatório pra não ser sempre óbvio. */
function ccSimulateMatch(strengthA, strengthB){
  const diff = strengthA - strengthB;
  const baseA = 1.3 + diff * 0.035;
  const baseB = 1.3 - diff * 0.035;
  const rnd = (lambda)=>{
    // Poisson aproximado simples, suficiente pra um placar de futebol
    let l = Math.exp(-Math.max(0.15, lambda)), k = 0, p = 1;
    do { k++; p *= Math.random(); } while(p > l);
    return Math.max(0, k - 1);
  };
  return { homeGoals: rnd(baseA), awayGoals: rnd(baseB) };
}

/* ---------- estado persistido ---------- */
function ccState(cupId){
  STATE.clubCups = STATE.clubCups || {};
  if(!STATE.clubCups[cupId]) STATE.clubCups[cupId] = { stage: "pick", homeClubId: null };
  return STATE.clubCups[cupId];
}

function ccResetCup(cupId){
  STATE.clubCups = STATE.clubCups || {};
  STATE.clubCups[cupId] = { stage: "pick", homeClubId: null };
  persist();
}

/* Monta os 2 grupos de 4 (o clube escolhido entra no Grupo A) e
   simula de cara todos os confrontos que não envolvem a pessoa —
   os outros 3 jogos do Grupo A e os 6 jogos inteiros do Grupo B. */
function ccPickHomeClub(cupId, clubId){
  const cup = getClubCupById(cupId);
  const club = ccClubById(cup, clubId);
  if(!cup || !club) return;

  const opponents = cup.opponentClubs.slice(0, 7);
  const groupA = [clubId, opponents[0].id, opponents[1].id, opponents[2].id];
  const groupB = [opponents[3].id, opponents[4].id, opponents[5].id, opponents[6].id];

  const s = ccState(cupId);
  s.stage = "groups";
  s.homeClubId = clubId;
  s.groups = { A: groupA, B: groupB };
  s.matches = {}; // key "idA_idB" -> {homeGoals, awayGoals, played}
  s.knockout = null;
  s.badgeClaimed = s.badgeClaimed || false;

  // gera todos os confrontos dos 2 grupos (todos contra todos)
  [s.groups.A, s.groups.B].forEach(group=>{
    for(let i=0;i<group.length;i++){
      for(let j=i+1;j<group.length;j++){
        const key = `${group[i]}__${group[j]}`;
        s.matches[key] = { home: group[i], away: group[j], played: false, homeGoals:0, awayGoals:0 };
      }
    }
  });

  // simula tudo que não envolve o clube escolhido
  Object.values(s.matches).forEach(m=>{
    if(m.home === clubId || m.away === clubId) return;
    const cA = ccClubById(cup, m.home), cB = ccClubById(cup, m.away);
    const r = ccSimulateMatch(ccClubStrength(cA), ccClubStrength(cB));
    m.homeGoals = r.homeGoals; m.awayGoals = r.awayGoals; m.played = true;
  });

  persist();
}

function ccGroupStandings(cup, s, groupKey){
  const ids = s.groups[groupKey];
  const table = ids.map(id=>({ id, club: ccClubById(cup, id), pts:0, gf:0, ga:0, played:0 }));
  Object.values(s.matches).forEach(m=>{
    if(!m.played) return;
    if(!ids.includes(m.home) || !ids.includes(m.away)) return;
    const rowH = table.find(t=>t.id===m.home), rowA = table.find(t=>t.id===m.away);
    rowH.gf += m.homeGoals; rowH.ga += m.awayGoals; rowH.played++;
    rowA.gf += m.awayGoals; rowA.ga += m.homeGoals; rowA.played++;
    if(m.homeGoals > m.awayGoals) rowH.pts += 3;
    else if(m.homeGoals < m.awayGoals) rowA.pts += 3;
    else { rowH.pts += 1; rowA.pts += 1; }
  });
  table.sort((a,b)=> b.pts - a.pts || (b.gf-b.ga) - (a.gf-a.ga) || b.gf - a.gf);
  return table;
}

function ccNextUserMatch(cup, s){
  if(s.stage === "groups"){
    const pending = Object.values(s.matches).find(m => !m.played && (m.home === s.homeClubId || m.away === s.homeClubId));
    return pending || null;
  }
  if(s.stage === "knockout" && s.knockout){
    const k = s.knockout;
    if(k.semi && !k.semi.played && (k.semi.home === s.homeClubId || k.semi.away === s.homeClubId)) return k.semi;
    if(k.final && !k.final.played && (k.final.home === s.homeClubId || k.final.away === s.homeClubId)) return k.final;
  }
  return null;
}

/* Depois que a pessoa joga sua partida (via soccer2d), registra o
   placar e avança a fase automaticamente quando for o caso. */
function ccRecordUserMatch(cupId, match, homeGoals, awayGoals){
  const cup = getClubCupById(cupId);
  const s = ccState(cupId);

  if(s.stage === "groups"){
    const key = `${match.home}__${match.away}`;
    s.matches[key].homeGoals = homeGoals; s.matches[key].awayGoals = awayGoals; s.matches[key].played = true;

    const groupsDone = Object.values(s.matches).every(m => m.played);
    if(groupsDone) ccAdvanceToKnockout(cup, s);
  } else if(s.stage === "knockout"){
    if(s.knockout.semi && s.knockout.semi.home===match.home && s.knockout.semi.away===match.away){
      s.knockout.semi.homeGoals=homeGoals; s.knockout.semi.awayGoals=awayGoals; s.knockout.semi.played=true;
      ccResolveSemifinal(cup, s);
    } else if(s.knockout.final && s.knockout.final.home===match.home && s.knockout.final.away===match.away){
      s.knockout.final.homeGoals=homeGoals; s.knockout.final.awayGoals=awayGoals; s.knockout.final.played=true;
      ccResolveFinal(cup, s);
    }
  }
  persist();
}

function ccAdvanceToKnockout(cup, s){
  const stA = ccGroupStandings(cup, s, "A");
  const stB = ccGroupStandings(cup, s, "B");
  const semifinalists = [stA[0].id, stA[1].id, stB[0].id, stB[1].id];

  if(!semifinalists.includes(s.homeClubId)){
    s.stage = "eliminated";
    return;
  }

  s.stage = "knockout";
  // cruzamento clássico: 1ºA x 2ºB, 1ºB x 2ºA
  const pairs = [[stA[0].id, stB[1].id], [stB[0].id, stA[1].id]];
  const myPair = pairs.find(p => p.includes(s.homeClubId));
  const otherPair = pairs.find(p => p !== myPair);

  s.knockout = {
    semi: { home: myPair[0], away: myPair[1], played:false, homeGoals:0, awayGoals:0 },
    otherSemi: { home: otherPair[0], away: otherPair[1], played:false, homeGoals:0, awayGoals:0 },
    final: null,
  };

  // a outra semifinal (que a pessoa não disputa) já é resolvida na hora
  const cA = ccClubById(cup, otherPair[0]), cB = ccClubById(cup, otherPair[1]);
  const r = ccSimulateMatch(ccClubStrength(cA), ccClubStrength(cB));
  s.knockout.otherSemi.homeGoals = r.homeGoals; s.knockout.otherSemi.awayGoals = r.awayGoals; s.knockout.otherSemi.played = true;
  // empate na simulação automática não pode ficar sem campeão — desempata na sorte
  if(r.homeGoals === r.awayGoals){
    s.knockout.otherSemi[Math.random()<0.5 ? "homeGoals":"awayGoals"] += 1;
  }
}

function ccResolveSemifinal(cup, s){
  const k = s.knockout;
  let myGoals = k.semi.home===s.homeClubId ? k.semi.homeGoals : k.semi.awayGoals;
  let oppGoals = k.semi.home===s.homeClubId ? k.semi.awayGoals : k.semi.homeGoals;

  if(myGoals === oppGoals){
    // empate: decide na sorte (pênaltis "abstratos"), avisa no toast
    if(Math.random() < 0.5) myGoals += 1; else oppGoals += 1;
    toast("Empate na semifinal — decidido nos pênaltis!", "");
  }

  if(myGoals < oppGoals){
    s.stage = "eliminated";
    return;
  }

  const winnerOther = k.otherSemi.homeGoals > k.otherSemi.awayGoals ? k.otherSemi.home : k.otherSemi.away;
  s.knockout.final = { home: s.homeClubId, away: winnerOther, played:false, homeGoals:0, awayGoals:0 };
}

function ccResolveFinal(cup, s){
  const k = s.knockout.final;
  let myGoals = k.home===s.homeClubId ? k.homeGoals : k.awayGoals;
  let oppGoals = k.home===s.homeClubId ? k.awayGoals : k.homeGoals;

  if(myGoals === oppGoals){
    if(Math.random() < 0.5) myGoals += 1; else oppGoals += 1;
    toast("Empate na final — decidido nos pênaltis!", "");
  }

  if(myGoals < oppGoals){
    s.stage = "eliminated";
    return;
  }

  s.stage = "champion";
  grantCurrency(0, cup.rewardCoins || 0);
  toast(`🏆 CAMPEÃO! +${(cup.rewardCoins||0).toLocaleString("pt-BR")} Moedas!`, "success");

  if(cup.rewardBadgeId && !s.badgeClaimed){
    s.badgeClaimed = true;
    addGift(
      `${cup.rewardBadgeIcon || "🏆"} Insígnia: ${cup.rewardBadgeLabel}`,
      `Conquistada ao ser campeão de "${cup.title}".`,
      0, 0,
      { id: cup.rewardBadgeId, icon: cup.rewardBadgeIcon || "🏆", label: cup.rewardBadgeLabel }
    );
  }
}

/* ---------- disparo da partida (reaproveita o motor Arena 2D) ---------- */
function ccPlayMatch(cupId, match){
  const cup = getClubCupById(cupId);
  const s = ccState(cupId);
  const isHome = match.home === s.homeClubId;
  const myClub = ccClubById(cup, s.homeClubId);
  const oppId = isHome ? match.away : match.home;
  const oppClub = ccClubById(cup, oppId);

  const homeLineup = resolveClubLineup(myClub);
  const awayLineup = oppClub.roster ? resolveClubLineup(oppClub) : generateOpponentLineup(oppClub.npcStrength || cup.opponentStrength || 65);

  startSoccer2DMatch({
    competitionLabel: cup.title,
    homeTeamName: myClub.name,
    awayTeamName: oppClub.name,
    homeLineup,
    awayLineup,
    onComplete: (result)=>{
      // o motor Arena 2D sempre entrega o placar do lado "home" da
      // PARTIDA (a pessoa é sempre o lado "home" visualmente), então
      // convertemos de volta pro home/away do CONFRONTO no grupo.
      const homeGoals = isHome ? result.homeGoals : result.awayGoals;
      const awayGoals = isHome ? result.awayGoals : result.homeGoals;
      ccRecordUserMatch(cupId, match, homeGoals, awayGoals);
      renderClubCupsScreen();
    },
  });
}

/* ---------- tela ---------- */
function renderClubCupsScreen(){
  const wrap = document.getElementById("clubcupsList");
  if(!wrap) return;
  const cups = (GAME_DATA.clubCups || []).filter(c => c.active);

  if(!cups.length){
    wrap.innerHTML = `<div class="empty-state"><div class="big">🏆</div>Nenhuma Copa de Clubes disponível no momento.</div>`;
    return;
  }

  wrap.innerHTML = cups.map(cup => renderClubCupCard(cup)).join("");

  wrap.querySelectorAll("[data-pick-club]").forEach(btn=>{
    btn.onclick = ()=>{ ccPickHomeClub(btn.dataset.cupId, btn.dataset.pickClub); renderClubCupsScreen(); };
  });
  wrap.querySelectorAll("[data-play-match]").forEach(btn=>{
    btn.onclick = ()=>{
      const cup = getClubCupById(btn.dataset.cupId);
      const s = ccState(btn.dataset.cupId);
      const match = ccNextUserMatch(cup, s);
      if(match) ccPlayMatch(btn.dataset.cupId, match);
    };
  });
  wrap.querySelectorAll("[data-reset-cup]").forEach(btn=>{
    btn.onclick = ()=>{ ccResetCup(btn.dataset.cupId); renderClubCupsScreen(); };
  });
}

function renderClubCupCard(cup){
  const s = ccState(cup.id);

  if(s.stage === "pick"){
    return `
    <div class="pack-card">
      <div class="pack-header" style="background-image:url('${cup.banner}')">
        <div><div class="pack-subtitle">${cup.league}</div><div class="pack-title">${cup.title}</div></div>
      </div>
      <div class="pack-body" style="flex-direction:column;">
        <div class="pack-squad-label">Escolha o clube que vai representar:</div>
        <div class="clubcup-pick-grid">
          ${cup.homeClubs.map(c => `
            <button class="btn btn-primary" data-pick-club="${c.id}" data-cup-id="${cup.id}">${c.name}</button>
          `).join("")}
        </div>
      </div>
    </div>`;
  }

  const myClub = ccClubById(cup, s.homeClubId);

  if(s.stage === "eliminated"){
    return `
    <div class="pack-card">
      <div class="pack-header" style="background-image:url('${cup.banner}')">
        <div><div class="pack-subtitle">${cup.league}</div><div class="pack-title">${cup.title}</div></div>
      </div>
      <div class="pack-body" style="flex-direction:column; align-items:center; text-align:center;">
        <div style="font-size:15px; font-weight:700; margin:10px 0;">😔 ${myClub.name} foi eliminado.</div>
        <button class="btn btn-primary" data-reset-cup data-cup-id="${cup.id}">Tentar novamente</button>
      </div>
    </div>`;
  }

  if(s.stage === "champion"){
    return `
    <div class="pack-card">
      <div class="pack-header" style="background-image:url('${cup.banner}')">
        <div><div class="pack-subtitle">${cup.league}</div><div class="pack-title">${cup.title}</div></div>
      </div>
      <div class="pack-body" style="flex-direction:column; align-items:center; text-align:center;">
        <div style="font-size:20px; margin:6px 0;">🏆</div>
        <div style="font-size:15px; font-weight:700;">${myClub.name} é CAMPEÃO!</div>
        <div class="page-sub" style="margin:4px 0 12px;">+${(cup.rewardCoins||0).toLocaleString("pt-BR")} Moedas concedidas. Insígnia te espera na Caixa de Presentes.</div>
        <button class="btn btn-primary" data-reset-cup data-cup-id="${cup.id}">Jogar novamente</button>
      </div>
    </div>`;
  }

  const match = ccNextUserMatch(cup, s);
  const stageLabel = s.stage === "groups" ? "Fase de Grupos" : (match && match===s.knockout.final ? "Final" : "Semifinal");

  return `
  <div class="pack-card">
    <div class="pack-header" style="background-image:url('${cup.banner}')">
      <div><div class="pack-subtitle">${cup.league} — ${myClub.name}</div><div class="pack-title">${cup.title}</div></div>
    </div>
    <div class="pack-body" style="flex-direction:column;">
      ${s.stage === "groups" ? `
        <div class="pack-squad-label">Grupo A</div>
        ${renderClubCupTable(ccGroupStandings(cup, s, "A"), s.homeClubId)}
        <div class="pack-squad-label" style="margin-top:10px;">Grupo B</div>
        ${renderClubCupTable(ccGroupStandings(cup, s, "B"), s.homeClubId)}
      ` : `<div class="pack-squad-label">${stageLabel}</div>`}
      ${match
        ? `<button class="btn btn-primary" style="margin-top:12px;" data-play-match data-cup-id="${cup.id}">▶ Jogar ${stageLabel === "Fase de Grupos" ? "próxima partida do grupo" : stageLabel}</button>`
        : `<div class="page-sub" style="margin-top:12px;">Aguardando resultado...</div>`}
    </div>
  </div>`;
}

function renderClubCupTable(table, myId){
  return `<table class="clubcup-table"><thead><tr><th>Clube</th><th>P</th><th>SG</th></tr></thead><tbody>
    ${table.map(r => `<tr class="${r.id===myId ? "clubcup-me":""}"><td>${r.club.name}</td><td>${r.pts}</td><td>${r.gf-r.ga}</td></tr>`).join("")}
  </tbody></table>`;
}
