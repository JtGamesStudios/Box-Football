/* =========================================================
   ESCALAÇÃO — formação, campo, banco, capitão, técnico
   ========================================================= */
let selectedBenchPlayerId = null;

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
    };
    STATE.squads.push(squad);
    STATE.activeSquadId = squad.id;
    persist();
  }
  if(!STATE.activeSquadId || !STATE.squads.find(s=>s.id===STATE.activeSquadId)){
    STATE.activeSquadId = STATE.squads[0].id;
    persist();
  }
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

  renderPitch(squad);
  renderBench(squad);
  updateTeamStats(squad);
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
let _drag = null; // { type:'bench'|'slot', id, squad, ghost }

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
  const benchZone = el && el.closest("#benchList");

  if(slotEl && slotEl.dataset.slotId){
    const targetId = slotEl.dataset.slotId;
    if(type === "bench"){
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
  } else if(type === "slot" && benchZone){
    delete squad.assignments[sourceId];
    persist();
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
  if(selectedBenchPlayerId){
    // remove o jogador selecionado de qualquer outra posição já ocupada
    Object.keys(squad.assignments).forEach(k=>{ if(squad.assignments[k]===selectedBenchPlayerId) delete squad.assignments[k]; });
    squad.assignments[slot.id] = selectedBenchPlayerId;
    selectedBenchPlayerId = null;
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
    toast("Selecione um jogador do banco primeiro.", "");
  }
}

function renderBench(squad){
  const list = document.getElementById("benchList");
  if(STATE.ownedPlayers.length===0){
    list.innerHTML = `<div class="empty-state"><div class="big">⚽</div>Contrate jogadores na aba Contratar para montar seu time.</div>`;
    return;
  }
  const assignedIds = new Set(Object.values(squad.assignments));
  list.innerHTML = STATE.ownedPlayers
    .slice()
    .sort((a,b)=> b.overall - a.overall)
    .map(p=>{
      const isSelected = selectedBenchPlayerId===p.id;
      const isAssigned = assignedIds.has(p.id);
      return `<div class="bench-item" data-player-id="${p.id}" style="${isSelected?'border-color:var(--turf);':''} ${isAssigned?'opacity:.55;':''}">
        <span class="mini-avatar ${p.rarity?'rarity-'+p.rarity:''}" style="background-image:url('${p.image || "assets/players/default.png"}')"></span>
        <span class="bench-pos">${p.position}</span>
        <span style="flex:1;">${p.name}</span>
        <span style="color:var(--text-muted);">${p.overall}</span>
        ${isAssigned? '<span style="font-size:10px;color:var(--turf);">EM CAMPO</span>':''}
      </div>`;
    }).join("");

  list.querySelectorAll(".bench-item").forEach(el=>{
    const playerId = el.dataset.playerId;
    const player = STATE.ownedPlayers.find(p=>p.id===playerId);
    makeDraggable(el, {
      type: "bench",
      id: playerId,
      squad,
      getPlayer: ()=> player,
      onTap: ()=> selectBenchPlayer(playerId),
    });
  });
}

function selectBenchPlayer(id){
  selectedBenchPlayerId = selectedBenchPlayerId===id ? null : id;
  toast(selectedBenchPlayerId ? "Agora clique numa posição do campo." : "Seleção cancelada.", "");
  renderBench(getActiveSquad());
}

function updateTeamStats(squad){
  const ids = Object.values(squad.assignments);
  const players = ids.map(getOwnedPlayerById).filter(Boolean);
  const overall = players.length ? Math.round(players.reduce((s,p)=>s+p.overall,0)/players.length) : 0;
  let force = players.reduce((s,p)=>s+p.overall,0);
  if(squad.captainSlot && squad.assignments[squad.captainSlot]) force += 5;
  document.getElementById("teamOverall").textContent = overall;
  document.getElementById("teamForce").textContent = force;
}

document.getElementById("btnSaveSquad").addEventListener("click", ()=>{
  persist();
  toast("Elenco salvo!", "success");
});
document.getElementById("btnNewSquad").addEventListener("click", ()=>{
  const name = prompt("Nome do novo elenco:", "Novo Elenco " + (STATE.squads.length+1));
  if(!name) return;
  const formation = GAME_DATA.formations[0];
  const squad = { id:"sq"+Date.now(), name, formationId:formation.id, coachId:GAME_DATA.coaches[0].id, captainSlot:null, assignments:{} };
  STATE.squads.push(squad);
  STATE.activeSquadId = squad.id;
  persist();
  renderEscalacao();
  toast("Novo elenco criado!", "success");
});
