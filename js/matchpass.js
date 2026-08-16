/* =========================================================
   MATCH PASS — temporada de níveis por XP, 3 trilhas em paralelo
   (Grátis / Passe Prata / Passe Ouro), inspirado no "Match Pass"
   do eFootball. Sobe de nível jogando QUALQUER partida do jogo
   (campanha, Modo de Evento, Arena 2D, Vôlei de Praia — vitória
   vale mais XP que derrota, ver addMatchPassXP em js/state.js).

   PvP "Jogo c/ amigo" (js/online.js) NÃO dá XP de propósito, pra
   evitar duas contas combinarem resultado só pra farmar nível.

   Dados de configuração: data/matchpass.json (GAME_DATA.matchPassSeason).
   Pra editar preços, XP por vitória, recompensas de cada nível/trilha
   etc., basta editar esse JSON — nenhuma mudança de código é necessária.
   ========================================================= */

const MP_REWARD_ICON = {
  coins: "◆",
  gp: "$",
  boxSpin: "🎁",
  playerId: "🃏",
  none: "—",
};

function mpRewardLabel(reward){
  if(!reward || reward.type === "none") return "—";
  return reward.label || `${MP_REWARD_ICON[reward.type] || ""} ${reward.amount || ""}`.trim();
}

function mpDaysLeft(season){
  if(!season || !season.end) return null;
  const ms = new Date(season.end).getTime() - Date.now();
  if(ms <= 0) return 0;
  return Math.ceil(ms / (1000*60*60*24));
}

function renderMatchPass(){
  const root = document.getElementById("matchPassRoot");
  if(!root) return;
  const season = GAME_DATA.matchPassSeason;

  if(!season){
    root.innerHTML = `<p class="page-sub">Match Pass indisponível no momento.</p>`;
    return;
  }

  const live = isMatchPassSeasonLive(season);
  const mp = ensureMatchPassState();
  const level = currentMatchPassLevel();
  const xpIntoLevel = (mp.xp || 0) - (level * season.xpPerLevel);
  const xpForNext = level >= season.totalLevels ? 0 : season.xpPerLevel;
  const pct = xpForNext ? Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100)) : 100;
  const daysLeft = mpDaysLeft(season);

  if(!live){
    root.innerHTML = `
      <div class="mp-offline-card">
        <div class="mp-offline-title">🎫 ${season.title}</div>
        <p class="page-sub" style="margin:6px 0 0;">
          ${season.active
            ? `Essa temporada começa em ${new Date(season.start).toLocaleDateString("pt-BR")} e vai até ${new Date(season.end).toLocaleDateString("pt-BR")}. Volte nessa data!`
            : `Nenhuma temporada ativa no momento. Fique de olho nas Informações para o anúncio da próxima.`}
        </p>
      </div>`;
    return;
  }

  const claimableCount = ["free","tier2","tier3"].reduce((acc, tier)=>{
    if(tier !== "free" && !mp[tier === "tier2" ? "purchasedTier2" : "purchasedTier3"]) return acc;
    for(let l=1; l<=level; l++){ if(!mp.claimed[tier].includes(l)) acc++; }
    return acc;
  }, 0);

  root.innerHTML = `
    <div class="mp-header">
      <div class="mp-header-top">
        <div class="mp-title">🎫 ${season.title}</div>
        ${daysLeft !== null ? `<div class="mp-days-left">Termina em ${daysLeft} dia${daysLeft===1?"":"s"}</div>` : ""}
      </div>
      <div class="mp-level-row">
        <span class="mp-level-badge">Nível ${level}<span class="mp-level-max">/${season.totalLevels}</span></span>
        <div class="mp-xp-bar"><div class="mp-xp-fill" style="width:${pct}%"></div></div>
        <span class="mp-xp-txt">${level >= season.totalLevels ? "MÁXIMO" : `${xpIntoLevel}/${xpForNext} XP`}</span>
      </div>
      <div class="mp-tiers-row">
        <button class="btn btn-block ${mp.purchasedTier2 ? "btn-disabled-owned" : "btn-primary"}" ${mp.purchasedTier2?"disabled":""} onclick="mpBuyTier('tier2')">
          ${mp.purchasedTier2 ? `✓ ${season.tier2Name}` : `Desbloquear ${season.tier2Name} — ◆ ${season.priceTier2}`}
        </button>
        <button class="btn btn-block ${mp.purchasedTier3 ? "btn-disabled-owned" : "btn-gold"}" ${mp.purchasedTier3?"disabled":""} onclick="mpBuyTier('tier3')">
          ${mp.purchasedTier3 ? `✓ ${season.tier3Name}` : `Desbloquear ${season.tier3Name} — ◆ ${season.priceTier3}`}
        </button>
      </div>
      ${claimableCount > 0 ? `<button class="btn btn-primary btn-block" style="margin-top:10px;" onclick="mpClaimAll()">🎁 Resgatar tudo (${claimableCount})</button>` : ""}
    </div>

    <div class="mp-track-scroll">
      <div class="mp-track" id="mpTrack">
        ${mpRenderRow(season, mp, level, "tier3", season.tier3Name, "mp-row-gold")}
        ${mpRenderRow(season, mp, level, "tier2", season.tier2Name, "mp-row-silver")}
        ${mpRenderRow(season, mp, level, "free", "Grátis", "mp-row-free")}
        <div class="mp-track-levels">
          <div class="mp-row-label" style="background:transparent;"></div>
          <div class="mp-row-cells">
          ${season.levels.map(l=>`<div class="mp-level-node ${l.level<=level?"reached":""} ${l.level===level?"current":""}">${l.level}</div>`).join("")}
          </div>
        </div>
      </div>
    </div>
  `;

  // auto-scroll até o nível atual
  requestAnimationFrame(()=>{
    const track = document.getElementById("mpTrack");
    const nodes = track ? track.querySelectorAll(".mp-cell, .mp-level-node") : [];
    if(track && nodes.length){
      const idx = Math.max(0, level - 2);
      const cellW = 74;
      track.closest(".mp-track-scroll").scrollLeft = idx * cellW;
    }
  });
}

function mpRenderRow(season, mp, level, tier, label, rowClass){
  const purchased = tier === "free" || mp[tier === "tier2" ? "purchasedTier2" : "purchasedTier3"];
  const cells = season.levels.map(l=>{
    const reward = l[tier];
    const reached = l.level <= level;
    const claimed = mp.claimed[tier].includes(l.level);
    const claimable = purchased && reached && !claimed && reward && reward.type !== "none";
    const state = claimed ? "claimed" : claimable ? "claimable" : !purchased ? "locked-tier" : reached ? "empty" : "locked";
    return `<div class="mp-cell ${state}" ${claimable ? `onclick="mpClaim(${l.level},'${tier}')"` : ""} title="${label} — Nível ${l.level}: ${mpRewardLabel(reward)}">
      <span class="mp-cell-icon">${claimed ? "✓" : (reward && reward.type !== "none" ? (MP_REWARD_ICON[reward.type]||"") : "")}</span>
      ${reward && reward.type !== "none" && !claimed ? `<span class="mp-cell-amt">${reward.amount || ""}</span>` : ""}
    </div>`;
  }).join("");
  return `<div class="mp-track-row ${rowClass}"><div class="mp-row-label">${label}</div><div class="mp-row-cells">${cells}</div></div>`;
}

function mpBuyTier(tier){
  if(purchaseMatchPassTier(tier)) renderMatchPass();
}

function mpClaim(level, tier){
  if(claimMatchPassReward(level, tier)){
    toast(`🎁 Resgatado: ${mpRewardLabel(GAME_DATA.matchPassSeason.levels.find(l=>l.level===level)[tier])}`, "success");
    renderMatchPass();
    syncTopBadges();
  }
}

function mpClaimAll(){
  const n = claimAllMatchPassRewards();
  if(n > 0){ toast(`🎁 ${n} recompensa${n===1?"":"s"} resgatada${n===1?"":"s"}!`, "success"); }
  renderMatchPass();
  syncTopBadges();
}
