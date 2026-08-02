/* =========================================================
   ESCALAÇÃO — formação, campo, banco de reservas, não
   relacionados, capitão, técnico
   ========================================================= */
let selectedPlayerId = null;
const RESERVES_CAP = 7; // tamanho do banco de reservas (igual ao padrão de jogos de clube)

function normalizeSquad(squad){
  if(!Array.isArray(squad.reserves)) squad.reserves = [];
  // remove duplicados e ids que já viraram titulares (evita estado inconsistente
  // de saves antigos, de antes de existir banco de reservas separado)
  const starterIds = new Set(Object.values(squad.assignments || {}));
  const seen = new Set();
  squad.reserves = squad.reserves.filter(id=>{
    if(starterIds.has(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, RESERVES_CAP);
  return squad;
}

function ensureDefaultSquad(){
  if(STATE.squads.length===0){
    const formation = GAME_DATA.formations[0];
    const squad = {
      id: "sq" + Date.now(),
      name: "Elenco Principal",
      formationId: formation.id,
      coachId: GAME_DATA.coaches[0].id,
      captainSlot: null,
      assignments: {},
      reserves: [],
    };
    STATE.squads.push(squad);
    STATE.activeSquadId = squad.id;
    persist();
  }
  if(!STATE.activeSquadId || !STATE.squads.find(s=>s.id===STATE.activeSquadId)){
    STATE.activeSquadId = STATE.squads[0].id;
    persist();
  }
  STATE.squads.forEach(normalizeSquad);
}

function getActiveSquad(){
  ensureDefaultSquad();
  return STATE.squads.find(s=>s.id===STATE.activeSquadId);
}

function renderEscalacao(){
  ensureDefaultSquad();
  const squad = getActiveSquad();

  const formationSel = document.getElementById("formationSelect");
  formationSel.innerHTML = GAME_DATA.formations.map(f=>`<option value="${f.id}" ${f.id===squad.formationId?"selected":""}>${f.name}</option>`).join("");
  formationSel.onchange = ()=>{ squad.formationId = formationSel.value; squad.assignments = {}; squad.captainSlot=null; persist(); renderEscalacao(); };

  const coachSel = document.getElementById("coachSelect");
  coachSel.innerHTML = GAME_DATA.coaches.map(c=>`<option value="${c.id}" ${c.id===squad.coachId?"selected":""}>${c.nationalityFlag} ${c.name} (${c.bonus})</option>`).join("");
  coachSel.onchange = ()=>{ squad.coachId = coachSel.value; persist(); renderEscalacao(); };

  const squadSel = document.getElementById("squadSlotSelect");
  squadSel.innerHTML = STATE.squads.map(s=>`<option value="${s.id}" ${s.id===squad.id?"selected":""}>${s.name}</option>`).join("");
  squadSel.onchange = ()=>{ STATE.activeSquadId = squadSel.value; persist(); renderEscalacao(); };

  renderSquadIdentity(squad);
  renderPitch(squad);
  renderReserves(squad);
  renderUnrelated(squad);
  updateTeamStats(squad);
}

function renderSquadIdentity(squad){
  const coach = GAME_DATA.coaches.find(c=>c.id===squad.coachId);
  const formation = GAME_DATA.formations.find(f=>f.id===squad.formationId);
  const avatarEl = document.getElementById("coachAvatarBadge");
  const nameEl = document.getElementById("coachNameDisplay");
  const bonusEl = document.getElementById("coachBonusDisplay");
  const formBadgeEl = document.getElementById("formationBadge");
  if(coach){
    if(avatarEl) avatarEl.textContent = coach.nationalityFlag || "🧑‍💼";
    if(nameEl) nameEl.textContent = coach.name;
    if(bonusEl) bonusEl.textContent = `${coach.style} · ${coach.bonus}`;
  }
  if(formBadgeEl) formBadgeEl.textContent = formation ? formation.name : "—";
}

function renderPitch(squad){
  const formation = GAME_DATA.formations.find(f=>f.id===squad.formationId);
  const pitch = document.getElementById("pitch");
  pitch.innerHTML = `
    <div class="pitch-line" style="left:8%;right:8%;top:50%;height:0;"></div>
    <div class="pitch-line" style="left:30%;right:30%;top:38%;height:24%;border-radius:50%;"></div>
    <div class="pitch-line" style="left:4%;right:4%;top:4%;bottom:4%;"></div>
  `;
  formation.slots.forEach(slot=>{
    const playerId = squad.assignments[slot.id];
    const player = playerId ? getOwnedPlayerById(playerId) : null;
    const div = document.createElement("div");
    div.className = "pitch-slot"
      + (player ? ` filled${player.rarity ? " rarity-"+player.rarity : ""}` : "")
      + (squad.captainSlot===slot.id ? " captain" : "");
    div.style.left = slot.x + "%";
    div.style.top = (100 - slot.y) + "%";
    div.dataset.slotId = slot.id;
    if(player){
      div.style.backgroundImage = `url('${player.image || "assets/players/default.png"}')`;
      div.innerHTML = `
        <span class="slot-pos-label">${player.position}</span>
        <span class="slot-ovr-badge">${player.overall}</span>`;
    } else {
      div.innerHTML = `<div class="slot-role">${slot.role}</div>`;
    }
    makeDraggable(div, {
      type: "slot",
      id: slot.id,
      squad,
      getPlayer: ()=> player,
      onTap: ()=> onSlotClick(squad, slot, player),
    });
    pitch.appendChild(div);
  });
}

/* ---------------- ARRASTAR E SOLTAR (mouse + toque) ----------------
   Funciona por cima do clique normal: se o ponteiro se mover além de
   um pequeno limiar, vira arraste; se não, dispara o onTap (o clique
   de sempre). Assim continua dando pra selecionar/tocar normalmente
   e também dá pra arrastar o jogador até a posição certa no campo. */
const DRAG_THRESHOLD = 6;
let _drag = null; // { type:'reserve'|'unrelated'|'slot', sourceId, squad, ghost }

function makeDraggable(el, { type, id, squad, getPlayer, onTap }){
  el.addEventListener("pointerdown", (e)=>{
    if(e.button !== undefined && e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    let active = false, moved = false;

    function onMove(ev){
      if(!active){
        if(Math.abs(ev.clientX-startX) > DRAG_THRESHOLD || Math.abs(ev.clientY-startY) > DRAG_THRESHOLD){
          moved = true;
          const player = getPlayer();
          if(player){
            active = true;
            beginDrag(type, id, squad, player, ev);
          }
        }
        return;
      }
      ev.preventDefault();
      updateDragGhostPos(ev);
      updateDragHover(ev);
    }
    function onUp(ev){
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if(active) endDrag(ev);
      else if(!moved && onTap) onTap();
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}

function createGhost(player, x, y){
  const g = document.createElement("div");
  g.className = "drag-ghost";
  g.style.backgroundImage = `url('${(player && player.image) || "assets/players/default.png"}')`;
  g.style.left = x + "px";
  g.style.top = y + "px";
  g.innerHTML = `<span class="drag-ghost-ovr">${player ? player.overall : ""}</span>`;
  document.body.appendChild(g);
  return g;
}

function beginDrag(type, sourceId, squad, player, evt){
  _drag = { type, sourceId, squad, ghost: createGhost(player, evt.clientX, evt.clientY) };
  document.body.classList.add("dragging-cards");
}

function updateDragGhostPos(evt){
  if(_drag && _drag.ghost){
    _drag.ghost.style.left = evt.clientX + "px";
    _drag.ghost.style.top = evt.clientY + "px";
  }
}

function updateDragHover(evt){
  document.querySelectorAll(".pitch-slot.drop-hover").forEach(el=>el.classList.remove("drop-hover"));
  const el = document.elementFromPoint(evt.clientX, evt.clientY);
  const slotEl = el && el.closest(".pitch-slot");
  if(slotEl) slotEl.classList.add("drop-hover");
}

function endDrag(evt){
  if(!_drag) return;
  const { type, sourceId, squad, ghost } = _drag;
  const el = document.elementFromPoint(evt.clientX, evt.clientY);
  const slotEl = el && el.closest(".pitch-slot");
  const reserveZone = el && el.closest("#reserveList");
  const unrelatedZone = el && el.closest("#unrelatedList");

  if(slotEl && slotEl.dataset.slotId){
    const targetId = slotEl.dataset.slotId;
    if(type === "reserve" || type === "unrelated"){
      // vira titular: some do banco/não relacionados e ocupa a posição
      squad.reserves = squad.reserves.filter(id=>id!==sourceId);
      Object.keys(squad.assignments).forEach(k=>{ if(squad.assignments[k]===sourceId) delete squad.assignments[k]; });
      squad.assignments[targetId] = sourceId;
      persist();
    } else if(type === "slot" && targetId !== sourceId){
      const fromPlayer = squad.assignments[sourceId];
      const toPlayer = squad.assignments[targetId];
      if(toPlayer) squad.assignments[sourceId] = toPlayer; else delete squad.assignments[sourceId];
      squad.assignments[targetId] = fromPlayer;
      persist();
    }
  } else if(reserveZone){
    if(type === "slot"){
      // sai do campo e vira reserva (se ainda houver vaga no banco)
      const playerId = squad.assignments[sourceId];
      delete squad.assignments[sourceId];
      if(squad.captainSlot === sourceId) squad.captainSlot = null;
      if(squad.reserves.length < RESERVES_CAP) squad.reserves.push(playerId);
      persist();
    } else if(type === "unrelated"){
      if(squad.reserves.length < RESERVES_CAP){
        squad.reserves.push(sourceId);
        persist();
      } else {
        toast(`Banco de reservas já está cheio (${RESERVES_CAP}/${RESERVES_CAP}).`, "");
      }
    }
  } else if(unrelatedZone){
    if(type === "slot"){
      // sai do campo direto pra fora do jogo
      delete squad.assignments[sourceId];
      if(squad.captainSlot === sourceId) squad.captainSlot = null;
      persist();
    } else if(type === "reserve"){
      squad.reserves = squad.reserves.filter(id=>id!==sourceId);
      persist();
    }
  }

  document.querySelectorAll(".pitch-slot.drop-hover").forEach(el=>el.classList.remove("drop-hover"));
  ghost.remove();
  document.body.classList.remove("dragging-cards");
  _drag = null;
  renderEscalacao();
}

function getOwnedPlayerById(id){
  return STATE.ownedPlayers.find(p=>p.id===id);
}

function onSlotClick(squad, slot, currentPlayer){
  if(selectedPlayerId){
    // remove o jogador selecionado de qualquer outra posição já ocupada e do banco de reservas
    Object.keys(squad.assignments).forEach(k=>{ if(squad.assignments[k]===selectedPlayerId) delete squad.assignments[k]; });
    squad.reserves = squad.reserves.filter(id=>id!==selectedPlayerId);
    squad.assignments[slot.id] = selectedPlayerId;
    selectedPlayerId = null;
    persist();
    renderEscalacao();
    return;
  }
  if(currentPlayer){
    squad.captainSlot = squad.captainSlot===slot.id ? null : slot.id;
    persist();
    renderPitch(squad);
    updateTeamStats(squad);
  } else {
    toast("Selecione um jogador do banco de reservas ou dos não relacionados primeiro.", "");
  }
}

function renderReserves(squad){
  const list = document.getElementById("reserveList");
  const countEl = document.getElementById("reserveCount");
  if(countEl) countEl.textContent = `(${squad.reserves.length}/${RESERVES_CAP})`;

  if(squad.reserves.length===0){
    list.innerHTML = `<div class="empty-state"><div class="big">🪑</div>Banco vazio. Toque em ➕ num jogador de "Não Relacionados" pra colocar no banco.</div>`;
    return;
  }

  const players = squad.reserves.map(getOwnedPlayerById).filter(Boolean);
  list.innerHTML = players.map(p=>{
    const isSelected = selectedPlayerId===p.id;
    return `<div class="bench-item ${isSelected?'selected':''}" data-player-id="${p.id}">
      <span class="mini-avatar ${p.rarity?'rarity-'+p.rarity:''}" style="background-image:url('${p.image || "assets/players/default.png"}')"></span>
      <span class="bench-pos">${p.position}</span>
      <span style="flex:1;">${p.name}</span>
      <span style="color:var(--text-muted);">${p.overall}</span>
      <button class="bench-squad-btn" data-demote-id="${p.id}" title="Tirar do banco">➖</button>
    </div>`;
  }).join("");

  list.querySelectorAll(".bench-item").forEach(el=>{
    const playerId = el.dataset.playerId;
    const player = STATE.ownedPlayers.find(p=>p.id===playerId);
    makeDraggable(el, {
      type: "reserve",
      id: playerId,
      squad,
      getPlayer: ()=> player,
      onTap: ()=> selectPlayer(playerId),
    });
  });
  list.querySelectorAll("[data-demote-id]").forEach(btn=>{
    btn.addEventListener("pointerdown", e=> e.stopPropagation());
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      const id = btn.dataset.demoteId;
      squad.reserves = squad.reserves.filter(pid=>pid!==id);
      if(selectedPlayerId===id) selectedPlayerId = null;
      persist();
      renderEscalacao();
    });
  });
}

function renderUnrelated(squad){
  const list = document.getElementById("unrelatedList");
  if(STATE.ownedPlayers.length===0){
    list.innerHTML = `<div class="empty-state"><div class="big">⚽</div>Contrate jogadores na aba Contratar para montar seu time.</div>`;
    return;
  }

  const starterIds = new Set(Object.values(squad.assignments));
  const reserveIds = new Set(squad.reserves);
  const players = STATE.ownedPlayers
    .filter(p=> !starterIds.has(p.id) && !reserveIds.has(p.id))
    .slice()
    .sort((a,b)=> b.overall - a.overall);

  if(players.length===0){
    list.innerHTML = `<div class="empty-state"><div class="big">✅</div>Todo o elenco já está entre titulares e reservas.</div>`;
    return;
  }

  const reservesFull = squad.reserves.length >= RESERVES_CAP;
  list.innerHTML = players.map(p=>{
    const isSelected = selectedPlayerId===p.id;
    return `<div class="bench-item ${isSelected?'selected':''}" data-player-id="${p.id}">
      <span class="mini-avatar ${p.rarity?'rarity-'+p.rarity:''}" style="background-image:url('${p.image || "assets/players/default.png"}')"></span>
      <span class="bench-pos">${p.position}</span>
      <span style="flex:1;">${p.name}</span>
      <span style="color:var(--text-muted);">${p.overall}</span>
      <button class="bench-squad-btn" data-promote-id="${p.id}" title="Colocar no banco de reservas" ${reservesFull?"disabled":""}>➕</button>
    </div>`;
  }).join("");

  list.querySelectorAll(".bench-item").forEach(el=>{
    const playerId = el.dataset.playerId;
    const player = STATE.ownedPlayers.find(p=>p.id===playerId);
    makeDraggable(el, {
      type: "unrelated",
      id: playerId,
      squad,
      getPlayer: ()=> player,
      onTap: ()=> selectPlayer(playerId),
    });
  });
  list.querySelectorAll("[data-promote-id]").forEach(btn=>{
    btn.addEventListener("pointerdown", e=> e.stopPropagation());
    btn.addEventListener("click", e=>{
      e.stopPropagation();
      if(squad.reserves.length >= RESERVES_CAP){
        toast(`Banco de reservas já está cheio (${RESERVES_CAP}/${RESERVES_CAP}).`, "");
        return;
      }
      const id = btn.dataset.promoteId;
      squad.reserves.push(id);
      if(selectedPlayerId===id) selectedPlayerId = null;
      persist();
      renderEscalacao();
    });
  });
}

function selectPlayer(id){
  selectedPlayerId = selectedPlayerId===id ? null : id;
  toast(selectedPlayerId ? "Agora clique numa posição do campo." : "Seleção cancelada.", "");
  renderReserves(getActiveSquad());
  renderUnrelated(getActiveSquad());
}

function updateTeamStats(squad){
  const ids = Object.values(squad.assignments);
  const players = ids.map(getOwnedPlayerById).filter(Boolean);
  const overall = players.length ? Math.round(players.reduce((s,p)=>s+p.overall,0)/players.length) : 0;
  let force = players.reduce((s,p)=>s+p.overall,0);
  if(squad.captainSlot && squad.assignments[squad.captainSlot]) force += 5;
  document.getElementById("teamOverall").textContent = overall;
  document.getElementById("teamForce").textContent = force;

  // "Espírito do time": indicador visual (não afeta o motor de partida) que reflete
  // o quão completa/organizada está a escalação — cresce com titulares escalados
  // e ganha um empurrão extra quando há um capitão definido.
  const formation = GAME_DATA.formations.find(f=>f.id===squad.formationId);
  const totalSlots = formation ? formation.slots.length : 11;
  const filled = players.length;
  let spirit = Math.round((filled/totalSlots)*100);
  spirit = filled>=totalSlots && squad.captainSlot ? 100 : Math.max(0, spirit - (squad.captainSlot?0:3));
  const spiritEl = document.getElementById("teamSpirit");
  if(spiritEl) spiritEl.textContent = spirit;

  const formLabelEl = document.getElementById("teamFormationLabel");
  if(formLabelEl) formLabelEl.textContent = formation ? formation.name : "—";
}

document.getElementById("btnSaveSquad").addEventListener("click", ()=>{
  persist();
  toast("Elenco salvo!", "success");
});
document.getElementById("btnNewSquad").addEventListener("click", ()=>{
  const name = prompt("Nome do novo elenco:", "Novo Elenco " + (STATE.squads.length+1));
  if(!name) return;
  const formation = GAME_DATA.formations[0];
  const squad = { id:"sq"+Date.now(), name, formationId:formation.id, coachId:GAME_DATA.coaches[0].id, captainSlot:null, assignments:{}, reserves:[] };
  STATE.squads.push(squad);
  STATE.activeSquadId = squad.id;
  persist();
  renderEscalacao();
  toast("Novo elenco criado!", "success");
});
