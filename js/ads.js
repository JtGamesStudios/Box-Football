/* =========================================================
   BOX EXCLUSIVA DE ANÚNCIOS — uma única Box (id "box0031",
   data/boxes/box031.json, category:"eventspin") só pode ser aberta
   assistindo um anúncio recompensado até o fim. Não é comprável com
   Moedas/GP, e o botão "🎬 Assistir Anúncio" só aparece nela — nunca
   nas outras Boxes.

   Reaproveita o mesmíssimo sistema de "giro ganho" que a Big Time —
   31th Anniversary já usa pra giros de evento (STATE.boxFreeSpins,
   grantEventBoxSpin em js/state.js) — só troca a ORIGEM do giro:
   em vez de vencer partida de evento, é assistir o anúncio.
   ========================================================= */

const AD_BOX_ID = "box0031";
const AD_UNIT_ID_REWARDED = "ca-app-pub-2928120410573146/2913587845"; // Ad Unit "Premiado" do AdMob
const AD_SPIN_DAILY_LIMIT = 3; // giros grátis por anúncio, por dia

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
   Chamada real do AdMob (@capacitor-community/admob). Se o plugin
   nativo ainda não estiver instalado (ex: testando isso no navegador
   ou antes de rodar `npx cap sync android`), cai sozinho num anúncio
   SIMULADO (2s de espera) — assim o fluxo inteiro já funciona pra
   teste mesmo antes do lado nativo estar pronto.

   Conferir a versão exata do plugin instalado — os nomes dos métodos/
   eventos abaixo seguem a API mais comum do
   @capacitor-community/admob, mas podem variar entre versões.
   --------------------------------------------------------- */
async function showRewardedAd(onSuccess, onFail){
  const plugins = window.Capacitor && window.Capacitor.Plugins;

  if(!plugins || !plugins.AdMob){
    toast("🎬 (modo teste, sem AdMob nativo instalado ainda) Simulando anúncio...", "");
    setTimeout(onSuccess, 2000);
    return;
  }

  try{
    const { AdMob, RewardAdPluginEvents } = plugins;
    let rewarded = false;
    let rewardListener, dismissListener, failListener;

    const cleanup = ()=>{
      if(rewardListener) rewardListener.remove();
      if(dismissListener) dismissListener.remove();
      if(failListener) failListener.remove();
    };

    rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, ()=>{ rewarded = true; });
    dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, ()=>{
      cleanup();
      if(rewarded) onSuccess(); else onFail("Anúncio fechado antes de terminar.");
    });
    failListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err)=>{
      cleanup();
      onFail(err);
    });

    await AdMob.prepareRewardVideoAd({ adId: AD_UNIT_ID_REWARDED });
    await AdMob.showRewardVideoAd();
  } catch(e){
    onFail(e);
  }
}

/* Chamado pelo botão "🎬 Assistir Anúncio" — só existe na Box
   exclusiva (AD_BOX_ID). Só concede o giro DEPOIS que o AdMob
   confirma "Rewarded" de verdade — fechar no meio não dá giro. */
function watchAdForBoxSpin(){
  if(adSpinsRemainingToday() <= 0){
    toast("Você já usou todos os giros por anúncio de hoje. Volte amanhã!", "");
    return;
  }
  const btn = document.querySelector(`[data-ad-spin-btn="${AD_BOX_ID}"]`);
  if(btn) btn.disabled = true;

  showRewardedAd(
    ()=>{ // sucesso — anúncio assistido até o fim
      STATE.dailyAdSpins.used = adSpinsUsedToday() + 1;
      persist();
      grantEventBoxSpin(AD_BOX_ID, 1);
      toast("🎁 Giro liberado! Abrindo a Box exclusiva...", "success");
      startBoxOpen(AD_BOX_ID, "eventspin");
      renderContratarGrid("boxdraw");
      renderContratarGrid("especial");
    },
    (err)=>{ // falha (sem internet, anúncio não carregou, fechou no meio, etc.)
      if(btn) btn.disabled = false;
      console.warn("[ads] anúncio não completado:", err);
      toast("Não foi possível concluir o anúncio agora. Tenta de novo em instantes.", "");
    }
  );
}
