/* =========================================================
   DATA LOADER — carrega todos os arquivos JSON separados.
   Para adicionar uma Box nova: crie data/boxes/boxNNN.json
   e adicione o nome do arquivo em data/boxes/index.json.
   Nenhuma outra alteração de código é necessária.
   ========================================================= */
const GAME_DATA = {
  players: [],
  boxesRaw: [],   // definição "de fábrica" de cada box (não editada)
  formations: [],
  coaches: [],
  missions: [],
  events: {},
  store: [],
  coupons: [],   // carregado por loadCoupons() em coupons.js (data/coupons.json)
  matchPassSeason: null, // carregado de data/matchpass.json (ver js/matchpass.js)
};

async function fetchJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if(!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
  return res.json();
}

/* Raridade (cor da bola) é sempre derivada do overall do jogador —
   não depende mais do campo "rarity" salvo no players.json. Assim,
   ajustar o overall de um jogador já atualiza a bola automaticamente
   na próxima vez que o app carregar os dados. Pra mudar os cortes,
   edite só os números abaixo. */
const RARITY_THRESHOLDS = [
  { min: 90, rarity: "preta",   label: "Lendária" },
  { min: 85, rarity: "dourada", label: "Ouro" },
  { min: 80, rarity: "prata",   label: "Prata" },
  { min: 0,  rarity: "branca",  label: "Comum" },
];

function rarityForOverall(overall){
  return RARITY_THRESHOLDS.find(t => overall >= t.min);
}

function applyRarities(players){
  players.forEach(p=>{
    // Épico/Big Time (Box Ronaldo, Figo, Super Onze) já vêm com raridade
    // fixa no players.json — não pode recalcular por overall, ou vira
    // "preta" de novo (overall >=90) e quebra o sistema inteiro.
    if(p.rarity === "epico" || p.rarity === "bigtime") return;
    const r = rarityForOverall(p.overall);
    p.rarity = r.rarity;
    p.rarityLabel = r.label;
  });
}

async function loadGameData(){
  const [players, formations, coaches, missions, events, store, boxIndex, matchPass, packs, clubCups, teams] = await Promise.all([
    fetchJSON("data/players.json"),
    fetchJSON("data/formations.json"),
    fetchJSON("data/coaches.json"),
    fetchJSON("data/missions.json"),
    fetchJSON("data/events.json"),
    fetchJSON("data/store.json"),
    fetchJSON("data/boxes/index.json"),
    fetchJSON("data/matchpass.json").catch(err=>{ console.warn(err); return null; }),
    fetchJSON("data/packs.json").catch(err=>{ console.warn(err); return null; }),
    fetchJSON("data/club-cups.json").catch(err=>{ console.warn(err); return null; }),
    fetchJSON("data/teams.json").catch(err=>{ console.warn(err); return null; }),
  ]);

  applyRarities(players);

  GAME_DATA.players = players;
  GAME_DATA.formations = formations;
  GAME_DATA.coaches = coaches;
  GAME_DATA.missions = missions;
  GAME_DATA.events = events;
  GAME_DATA.store = store;
  GAME_DATA.matchPassSeason = matchPass ? matchPass.activeSeason : null;
  GAME_DATA.packs = packs ? packs.packs : [];
  GAME_DATA.clubCups = clubCups ? clubCups.cups : [];
  GAME_DATA.teams = teams; // base de continentes/campeonatos/clubes do seletor de time (js/team-select.js)

  const boxFiles = await Promise.all(
    boxIndex.map(name => fetchJSON(`data/boxes/${name}`).catch(err=>{ console.warn(err); return null; }))
  );
  GAME_DATA.boxesRaw = boxFiles.filter(Boolean);

  GAME_DATA.playersById = {};
players.forEach(p => GAME_DATA.playersById[p.id.toLowerCase()] = p);
}

function getPlayer(id){ return id ? GAME_DATA.playersById[String(id).toLowerCase()] : undefined; }
