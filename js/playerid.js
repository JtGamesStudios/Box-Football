/* =========================================================
   ID DO JOGADOR — identificador único local (por navegador)
   Gerado uma única vez e salvo FORA do save principal do jogo,
   para sobreviver mesmo se o progresso for apagado em
   Configurações (é o "documento" deste navegador — usado pra
   resgatar códigos/presentes e, no futuro, adicionar amigos).

   Não depende de nenhum outro script (roda antes de state.js),
   por isso fica em arquivo próprio.
   ========================================================= */
const PLAYER_ID_KEY = "boxclube_player_id_v1";

function generatePlayerId(){
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I pra evitar confusão visual
  function block(n){
    let s = "";
    for(let i=0;i<n;i++) s += chars[Math.floor(Math.random()*chars.length)];
    return s;
  }
  return `${block(4)}-${block(4)}`;
}

function getPlayerId(){
  try{
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if(!id){
      id = generatePlayerId();
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  }catch(e){
    // fallback se o localStorage estiver bloqueado — ID só dura a sessão atual
    if(!window.__fallbackPlayerId) window.__fallbackPlayerId = generatePlayerId();
    return window.__fallbackPlayerId;
  }
}

function fallbackCopyText(text){
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try{
    document.execCommand("copy");
    if(typeof toast === "function") toast("ID copiado!", "success");
  }catch(e){
    if(typeof toast === "function") toast("Não foi possível copiar. Copie manualmente: " + text, "");
  }
  document.body.removeChild(ta);
}

function copyPlayerId(){
  const id = getPlayerId();
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(id)
      .then(()=>{ if(typeof toast === "function") toast("ID copiado!", "success"); })
      .catch(()=> fallbackCopyText(id));
  } else {
    fallbackCopyText(id);
  }
}
