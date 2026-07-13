/* =========================================================
   RESGATE DE CÓDIGOS (CUPOM)
   Forma de você (o dev) dar presentes (GP/Moedas) aos jogadores
   sem precisar de painel admin dentro do jogo: basta editar o
   arquivo data/coupons.json e enviar o código pro jogador.

   Cada cupom, em data/coupons.json, pode ter:
   {
     "code": "BEMVINDO10",     // o código que o jogador digita
     "title": "Presente de boas-vindas",  // opcional, aparece na Caixa de Presentes
     "desc": "Obrigado por jogar!",       // opcional
     "gp": 5000,                // opcional
     "coins": 100,               // opcional
     "targetId": null,           // opcional: se preenchido (ex: "AB12-CD34"),
                                  // só o jogador com esse ID consegue resgatar
     "expiresAt": null           // opcional: data ISO, ex "2026-12-31"
   }

   Cada ID de jogador só consegue resgatar um código específico
   uma única vez (fica salvo em STATE.redeemedCodes).
   ========================================================= */

async function loadCoupons(){
  try{
    GAME_DATA.coupons = await fetchJSON("data/coupons.json");
  }catch(e){
    console.warn("Não foi possível carregar data/coupons.json — resgate de código ficará indisponível.", e);
    GAME_DATA.coupons = [];
  }
}

function findCoupon(code){
  const norm = String(code || "").trim().toUpperCase();
  return (GAME_DATA.coupons || []).find(c => String(c.code).trim().toUpperCase() === norm);
}

function redeemCoupon(rawCode){
  const code = String(rawCode || "").trim();
  if(!code){ toast("Digite um código.", ""); return; }

  const coupon = findCoupon(code);
  if(!coupon){ toast("Código inválido.", "danger"); return; }

  if(coupon.expiresAt && Date.now() > new Date(coupon.expiresAt).getTime()){
    toast("Esse código expirou.", "danger");
    return;
  }

  const myId = getPlayerId();
  if(coupon.targetId && String(coupon.targetId).trim().toUpperCase() !== myId.toUpperCase()){
    toast("Esse código não é válido para o seu ID.", "danger");
    return;
  }

  const normCode = code.toUpperCase();
  if(STATE.redeemedCodes.includes(normCode)){
    toast("Você já resgatou esse código.", "");
    return;
  }

  STATE.redeemedCodes.push(normCode);
  addGift(
    coupon.title || "Código resgatado",
    coupon.desc || `Recompensa do código ${normCode}.`,
    coupon.gp || 0,
    coupon.coins || 0
  );
  persist();
  toast("Código resgatado! Presente adicionado à Caixa de Presentes.", "success");
}

function wireCouponRedeem(){
  const btn = document.getElementById("btnRedeemCoupon");
  const input = document.getElementById("couponCodeInput");
  if(!btn || !input) return;

  const doRedeem = ()=>{
    redeemCoupon(input.value);
    input.value = "";
  };

  btn.addEventListener("click", doRedeem);
  input.addEventListener("keydown", (e)=>{
    if(e.key === "Enter") doRedeem();
  });
}
