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
};

async function fetchJSON(path){
  const res = await fetch(path, { cache: "no-store" });
  if(!res.ok) throw new Error(`Falha ao carregar ${path}: ${res.status}`);
  return res.json();
}

async function loadGameData(){
  const [players, formations, coaches, missions, events, store, boxIndex] = await Promise.all([
    fetchJSON("data/players.json"),
    fetchJSON("data/formations.json"),
    fetchJSON("data/coaches.json"),
    fetchJSON("data/missions.json"),
    fetchJSON("data/events.json"),
    fetchJSON("data/store.json"),
    fetchJSON("data/boxes/index.json"),
  ]);

  GAME_DATA.players = players;
  GAME_DATA.formations = formations;
  GAME_DATA.coaches = coaches;
  GAME_DATA.missions = missions;
  GAME_DATA.events = events;
  GAME_DATA.store = store;

  const boxFiles = await Promise.all(
    boxIndex.map(name => fetchJSON(`data/boxes/${name}`).catch(err=>{ console.warn(err); return null; }))
  );
  GAME_DATA.boxesRaw = boxFiles.filter(Boolean);

  GAME_DATA.playersById = {};
players.forEach(p => GAME_DATA.playersById[p.id.toLowerCase()] = p);
}

function getPlayer(id){ return id ? GAME_DATA.playersById[String(id).toLowerCase()] : undefined; }
