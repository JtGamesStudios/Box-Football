/* =========================================================
   PAINEL ADMINISTRATIVO — ativar/desativar e editar Boxes
   ========================================================= */
function renderAdminPanel(){
  const wrap = document.getElementById("adminBoxList");
  wrap.innerHTML = GAME_DATA.boxesRaw.map(raw=>{
    const box = getEffectiveBox(raw.id);
    return `
    <div class="admin-box-row" style="flex-direction:column;align-items:stretch;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <strong>${box.name} <span style="color:var(--text-muted);font-weight:400;">(${raw.id})</span></strong>
        <label class="switch">
          <input type="checkbox" ${box.active?"checked":""} onchange="adminSetField('${raw.id}','active', this.checked)">
          <span class="slider"></span>
        </label>
      </div>
      <div class="admin-form">
        <div>
          <label>Nome</label>
          <input type="text" id="adm-name-${raw.id}" value="${box.name.replace(/"/g,'&quot;')}">
        </div>
        <div>
          <label>Banner</label>
          <select id="adm-banner-${raw.id}">
            <option value="banner-emerald" ${box.banner==="banner-emerald"?"selected":""}>Verde (Emerald)</option>
            <option value="banner-violet" ${box.banner==="banner-violet"?"selected":""}>Roxo (Violet)</option>
            <option value="banner-crimson" ${box.banner==="banner-crimson"?"selected":""}>Vermelho (Crimson)</option>
          </select>
        </div>
        <div>
          <label>Preço em GP</label>
          <input type="number" id="adm-gp-${raw.id}" value="${box.priceGP}">
        </div>
        <div>
          <label>Preço em Moedas</label>
          <input type="number" id="adm-coins-${raw.id}" value="${box.priceCoins}">
        </div>
        <div style="grid-column:1/-1;">
          <label>Descrição</label>
          <textarea id="adm-desc-${raw.id}" rows="2">${box.description}</textarea>
        </div>
        <div style="grid-column:1/-1;">
          <label>IDs de jogadores nessa Box (separados por vírgula)</label>
          <textarea id="adm-players-${raw.id}" rows="2">${box.allPlayerIds.join(", ")}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-primary btn-sm" onclick="adminSaveBox('${raw.id}')">Salvar alterações</button>
        <button class="btn btn-sm btn-danger" onclick="adminResetOverrides('${raw.id}')">Restaurar padrão</button>
      </div>
    </div>`;
  }).join("");
}

function adminSetField(boxId, field, value){
  STATE.adminOverrides[boxId] = STATE.adminOverrides[boxId] || {};
  STATE.adminOverrides[boxId][field] = value;
  persist();
  toast(`Box atualizada.`, "success");
  renderContratarGrid();
  renderBoxesScreen();
}

function adminSaveBox(boxId){
  const name = document.getElementById(`adm-name-${boxId}`).value.trim();
  const banner = document.getElementById(`adm-banner-${boxId}`).value;
  const priceGP = parseInt(document.getElementById(`adm-gp-${boxId}`).value, 10) || 0;
  const priceCoins = parseInt(document.getElementById(`adm-coins-${boxId}`).value, 10) || 0;
  const description = document.getElementById(`adm-desc-${boxId}`).value.trim();
  const playerIds = document.getElementById(`adm-players-${boxId}`).value
    .split(",").map(s=>s.trim()).filter(Boolean);

  STATE.adminOverrides[boxId] = Object.assign({}, STATE.adminOverrides[boxId], {
    name, banner, priceGP, priceCoins, description, playerIds
  });
  persist();
  toast("Box salva com sucesso!", "success");
  renderContratarGrid();
  renderBoxesScreen();
}

function adminResetOverrides(boxId){
  if(!confirm("Restaurar essa Box para os valores originais do arquivo JSON?")) return;
  delete STATE.adminOverrides[boxId];
  persist();
  renderAdminPanel();
  renderContratarGrid();
  renderBoxesScreen();
  toast("Box restaurada ao padrão.", "success");
}
