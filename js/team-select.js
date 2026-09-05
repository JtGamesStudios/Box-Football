/* =========================================================
   SELETOR DE TIME — igual ao fluxo do eFootball que você mandou:
   Continente -> Campeonato -> Clube -> Confirmar.

   Depende de: data/teams.json carregado em GAME_DATA.teams (ver
   LEIA-ME — precisa de uma linha em js/data.js pra isso), e dos
   elementos #uiTimeBase / #uiNomeTime / #uiAbrev / #uiEstadio /
   #uiCidade que já estão no index.html.

   Salva a escolha em STATE.clubProfile e persiste — é só
   identidade/visual (nome, escudo, estádio, cidade), não mexe em
   coleção de cartas nem escalação.
   ========================================================= */

function teamselOverlay(){
  let overlay = document.getElementById("teamselOverlay");
  if(!overlay){
    overlay = document.createElement("div");
    overlay.id = "teamselOverlay";
    overlay.className = "teamsel-overlay hidden";
    document.body.appendChild(overlay);
  }
  return overlay;
}

function teamselClose(){
  teamselOverlay().classList.add("hidden");
}

/* ---------------- Passo 1: continentes ---------------- */
function openTeamSelectContinents(){
  const data = (typeof GAME_DATA !== "undefined" && GAME_DATA.teams) ? GAME_DATA.teams : null;
  if(!data){ toast("Base de times ainda não carregada.", ""); return; }

  const overlay = teamselOverlay();
  overlay.innerHTML = `
    <div class="teamsel-panel">
      <div class="teamsel-title">Selecionar time</div>
      ${data.continents.map(c => `
        <div class="teamsel-row" onclick="openTeamSelectLeagues('${c.id}')">
          <span class="tr-name">${c.name}</span>
          <span class="tr-chevron">›</span>
        </div>
      `).join("")}
      <button class="teamsel-back" onclick="teamselClose()">Voltar</button>
    </div>`;
  overlay.classList.remove("hidden");
}

/* ---------------- Passo 2: campeonatos do continente ---------------- */
function openTeamSelectLeagues(continentId){
  const data = GAME_DATA.teams;
  const continent = data.continents.find(c => c.id === continentId);
  if(!continent) return;

  const overlay = teamselOverlay();
  overlay.innerHTML = `
    <div class="teamsel-panel">
      <div class="teamsel-title">Selecionar time</div>
      ${continent.leagues.length === 0
        ? `<p style="text-align:center;color:#888;padding:20px 0;">Nenhum campeonato cadastrado ainda nessa região.</p>`
        : continent.leagues.map(l => `
          <div class="teamsel-row" onclick="openTeamSelectClubs('${continentId}','${l.id}')">
            <img src="${l.logo}" alt="" onerror="this.style.visibility='hidden'">
            <span class="tr-name">${l.name}</span>
            <span class="tr-chevron">›</span>
          </div>
        `).join("")}
      <button class="teamsel-back" onclick="openTeamSelectContinents()">Voltar</button>
    </div>`;
  overlay.classList.remove("hidden");
}

/* ---------------- Passo 3: clubes do campeonato ---------------- */
let _teamselPending = null;

function openTeamSelectClubs(continentId, leagueId){
  const data = GAME_DATA.teams;
  const continent = data.continents.find(c => c.id === continentId);
  const league = continent && continent.leagues.find(l => l.id === leagueId);
  if(!league) return;

  _teamselPending = null;

  const overlay = teamselOverlay();
  overlay.innerHTML = `
    <div class="teamsel-panel">
      <div class="teamsel-title">${league.name}</div>
      ${league.clubs.length === 0
        ? `<p style="text-align:center;color:#888;padding:20px 0;">Nenhum clube cadastrado ainda nesse campeonato.</p>`
        : league.clubs.map(club => `
          <div class="teamsel-row" onclick="teamselPick('${continentId}','${leagueId}','${club.id}')" id="teamselRow-${club.id}">
            <img src="${club.badge}" alt="" onerror="this.style.visibility='hidden'">
            <span class="tr-name">${club.name}</span>
          </div>
        `).join("")}
      <button class="teamsel-confirm" onclick="teamselConfirm('${continentId}','${leagueId}')">Confirmar</button>
      <button class="teamsel-back" onclick="openTeamSelectLeagues('${continentId}')">Voltar</button>
    </div>`;
  overlay.classList.remove("hidden");
}

function teamselPick(continentId, leagueId, clubId){
  _teamselPending = clubId;
  document.querySelectorAll(".teamsel-row").forEach(r=> r.style.background = "");
  const row = document.getElementById(`teamselRow-${clubId}`);
  if(row) row.style.background = "#dce8fb";
}

/* ---------------- Confirmar: salva e escreve nos campos ---------------- */
function teamselConfirm(continentId, leagueId){
  if(!_teamselPending){ toast("Escolha um time antes de confirmar.", ""); return; }
  const data = GAME_DATA.teams;
  const continent = data.continents.find(c => c.id === continentId);
  const league = continent.leagues.find(l => l.id === leagueId);
  const club = league.clubs.find(c => c.id === _teamselPending);
  if(!club) return;

  STATE.clubProfile = {
    continentId, leagueId, clubId: club.id,
    name: club.name, badge: club.badge,
    stadium: club.stadium, city: club.city,
  };
  persist();
  renderUserInfoScreen();
  teamselClose();
  toast(`Time base definido: ${club.name}`, "success");
}

/* ---------------- Preenche a tela "Informações de usuário" ---------------- */
function renderUserInfoScreen(){
  const cp = STATE.clubProfile;
  const set = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value; };
  if(!cp){
    set("uiTimeBase", "Não selecionado");
    set("uiNomeTime", "—");
    set("uiAbrev", "—");
    set("uiEstadio", "—");
    set("uiCidade", "—");
    return;
  }
  set("uiTimeBase", cp.name);
  set("uiNomeTime", cp.name);
  set("uiAbrev", cp.name.slice(0,3).toUpperCase());
  set("uiEstadio", cp.stadium);
  set("uiCidade", cp.city);
}
