/* =========================================================
   MISSÕES — objetivos, progresso e recompensas
   ========================================================= */
function updateMissionProgress(type, ballKey, value){
  GAME_DATA.missions
    .filter(m=> m.type===type && (!ballKey || m.ball===ballKey))
    .forEach(m=>{
      if(!STATE.missionsProgress[m.id]) STATE.missionsProgress[m.id] = { progress:0, claimed:false };
      STATE.missionsProgress[m.id].progress = value;
    });
  persist();
  const homeM = document.getElementById("homeMissions");
  if(homeM) homeM.textContent = Object.values(STATE.missionsProgress).filter(p=>p.claimed).length;
  const homeS = document.getElementById("homeStreak");
  if(homeS) homeS.textContent = STATE.stats.loginStreak;
}

function claimMission(id){
  const mission = GAME_DATA.missions.find(m=>m.id===id);
  const prog = STATE.missionsProgress[id];
  if(!mission || !prog || prog.claimed || prog.progress < mission.target) return;
  prog.claimed = true;
  addGift(mission.description, "Recompensa por completar a missão.", mission.rewardGP, mission.rewardCoins);
  persist();
  toast("Missão concluída! Recompensa na Caixa de Presentes.", "success");
  renderMissions();
}

function renderMissions(){
  const wrap = document.getElementById("missionsList");
  wrap.innerHTML = GAME_DATA.missions.map(m=>{
    const prog = STATE.missionsProgress[m.id] || { progress:0, claimed:false };
    const pct = Math.min(100, Math.round((prog.progress / m.target)*100));
    const done = prog.progress >= m.target;
    const rewardTxt = [
      m.rewardGP ? `${m.rewardGP.toLocaleString("pt-BR")} GP` : null,
      m.rewardCoins ? `${m.rewardCoins.toLocaleString("pt-BR")} Moedas` : null,
    ].filter(Boolean).join(" + ");
    return `
    <div class="mission-item">
      <div class="mission-info">
        <div class="mission-desc">${m.description}</div>
        <div class="mission-track"><div class="fill" style="width:${pct}%"></div></div>
        <div class="mission-prog-txt">${Math.min(prog.progress, m.target)}/${m.target}</div>
      </div>
      <div style="text-align:right;">
        <div class="mission-reward" style="color:var(--gold);">${rewardTxt}</div>
        ${prog.claimed
          ? `<span style="font-size:11.5px;color:var(--turf);">Resgatada ✓</span>`
          : `<button class="btn btn-sm ${done?"btn-primary":""}" ${done?"":"disabled"} onclick="claimMission('${m.id}')">${done?"Resgatar":"Em progresso"}</button>`}
      </div>
    </div>`;
  }).join("");
}
