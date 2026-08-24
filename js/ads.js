/* =========================================================
   GIRO GRÁTIS POR ANÚNCIO — assiste um anúncio recompensado e
   ganha 1 giro grátis numa Box (sem gastar Moedas/GP).

   ESTE ARQUIVO TEM UM ANÚNCIO "DE MENTIRA" (showRewardedAd abaixo
   só espera 2s e já chama sucesso) — funciona pra testar o fluxo
   inteiro (botão, contador diário, giro concedido) sem precisar do
   AdMob configurado ainda. Quando o plugin @capacitor-community/admob
   estiver instalado no projeto Android, troca SÓ a função
   showRewardedAd() por baixo — o resto (botão, contador, integração
   com as Boxes) não muda nada.
   ========================================================= */

const AD_SPIN_DAILY_LIMIT = 3; // giros grátis por anúncio, por dia, pra toda a conta (não por Box)

function todayKey(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function adSpinsUsedToday(){
  STATE.dailyAdSpins = STATE.dailyAdSpins || { date: null, used: 0 };
  if(STATE.dailyAdSpins.date !== todayKey()){
    STATE.dailyAdSpins.date = todayKey();
    STATE.dailyAdSpins.used = 0;
  }
  return STATE.dailyAdSpins.used;
}

function adSpinsRemainingToday(){
  return Math.max(0, AD_SPIN_DAILY_LIMIT - adSpinsUsedToday());
}

/* ---------------------------------------------------------
   PLACEHOLDER — troca isso pela chamada real do AdMob quando o
   plugin estiver instalado no lado nativo. Exemplo de como fica
   com @capacitor-community/admob (deixa comentado de referência):

   async function showRewardedAd(onSuccess, onFail){
     const { AdMob, RewardAdPluginEvents } = window.Capacitor.Plugins;
     try {
       await AdMob.prepareRewardVideoAd({ adId: "SEU_AD_UNIT_ID_AQUI" });
       AdMob.addListener(RewardAdPluginEvents.Rewarded, () => onSuccess());
       AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => onFail());
       await AdMob.showRewardVideoAd();
     } catch(e){ onFail(e); }
   }
   --------------------------------------------------------- */
function showRewardedAd(onSuccess, onFail){
  toast("🎬 Carregando anúncio (simulado — troque por AdMob real)...", "");
  setTimeout(()=>{
    onSuccess();
  }, 2000);
}

/* Chamado pelo botão "🎬 Assistir Anúncio" nas Boxes. Só concede o
   giro DEPOIS que o anúncio confirma que foi assistido até o fim
   (onSuccess) — nunca antes, pra não dar pra pular o anúncio e
   ganhar de graça. */
function watchAdForBoxSpin(boxId){
  if(adSpinsRemainingToday() <= 0){
    toast("Você já usou todos os giros por anúncio de hoje. Volte amanhã!", "");
    return;
  }
  const btn = document.querySelector(`[data-ad-spin-btn="${boxId}"]`);
  if(btn) btn.disabled = true;

  showRewardedAd(
    ()=>{ // sucesso — anúncio assistido até o fim
      STATE.dailyAdSpins.used = adSpinsUsedToday() + 1;
      persist();
      toast("🎁 Giro liberado! Abrindo a Box...", "success");
      startBoxOpen(boxId, "ad");
      renderContratarGrid("boxdraw");
      renderContratarGrid("especial");
    },
    ()=>{ // falha (sem internet, anúncio não carregou, etc.)
      if(btn) btn.disabled = false;
      toast("Não foi possível carregar o anúncio agora. Tenta de novo em instantes.", "");
    }
  );
}
