/* =========================================================
   TELA CHEIA + PAISAGEM
   Navegadores só permitem pedir fullscreen/orientação após um
   gesto do usuário (toque no botão). Por isso mostramos o overlay
   "gire o celular" com um botão — ao tocar, entramos em tela cheia
   e tentamos travar a orientação em paisagem.

   Observação importante: o iOS Safari NÃO suporta screen.orientation.lock
   (restrição da Apple), e versões mais antigas nem suportam Fullscreen API
   pra elementos comuns (só <video>). Nesses casos, não dá pra exigir tela
   cheia de verdade — senão o aviso ficaria preso pra sempre. Por isso,
   se o navegador não suporta a Fullscreen API, a classe "fs-unsupported"
   é adicionada e o CSS passa a exigir só a orientação paisagem nesses casos.

   O estado real de "está em tela cheia" é espelhado numa classe no <html>
   (is-fullscreen), atualizada pelo evento fullscreenchange — o CSS usa
   essa classe (mais confiável entre navegadores mobile do que confiar só
   na pseudo-classe :fullscreen).
   ========================================================= */
(function(){
  const html = document.documentElement;

  function getFullscreenElement(){
    return document.fullscreenElement || document.webkitFullscreenElement ||
           document.mozFullScreenElement || document.msFullscreenElement || null;
  }

  function supportsFullscreen(){
    return !!(html.requestFullscreen || html.webkitRequestFullscreen ||
              html.mozRequestFullScreen || html.msRequestFullscreen);
  }

  if(!supportsFullscreen()){
    html.classList.add("fs-unsupported");
  }

  function syncFullscreenClass(){
    html.classList.toggle("is-fullscreen", !!getFullscreenElement());
  }

  ["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"]
    .forEach(evt => document.addEventListener(evt, syncFullscreenClass));

  // Sincroniza também ao girar/redimensionar, caso algum navegador
  // altere o estado sem disparar o evento acima.
  window.addEventListener("resize", syncFullscreenClass);
  syncFullscreenClass();

  function tryLockOrientation(){
    if(screen.orientation && screen.orientation.lock){
      screen.orientation.lock("landscape").catch(()=>{ /* iOS/alguns navegadores não suportam */ });
    }
  }

  function enterFullscreenLandscape(){
    const reqFS = html.requestFullscreen || html.webkitRequestFullscreen ||
                  html.mozRequestFullScreen || html.msRequestFullscreen;

    if(reqFS){
      Promise.resolve(reqFS.call(html))
        .then(()=>{ syncFullscreenClass(); tryLockOrientation(); })
        .catch(()=>{ syncFullscreenClass(); tryLockOrientation(); });
    } else {
      tryLockOrientation();
    }

    // Rede de segurança: alguns navegadores/webviews mobile (in-app
    // browser do Instagram/WhatsApp, Android WebView mais antigo etc.)
    // confirmam o fullscreen de forma inconsistente — o evento
    // fullscreenchange às vezes não dispara, deixando o aviso preso
    // mesmo com o usuário já tendo confirmado a intenção ao clicar.
    // Se depois de meio segundo o navegador ainda não reportou o
    // fullscreen "de verdade", liberamos o aviso do mesmo jeito.
    setTimeout(()=>{
      if(!getFullscreenElement()) dismissRotateOverlay();
    }, 600);
  }

  // "Continuar sem tela cheia" — sem isso, em navegadores que não
  // suportam Fullscreen API (iOS Safari) ou que negam o lock de
  // orientação, o overlay nunca teria uma saída manual.
  function dismissRotateOverlay(){
    html.classList.add("rotate-dismissed");
    try{ sessionStorage.setItem("rotateDismissed","1"); }catch(e){}
  }

  try{
    if(sessionStorage.getItem("rotateDismissed")==="1") html.classList.add("rotate-dismissed");
  }catch(e){}

  document.addEventListener("DOMContentLoaded", ()=>{
    const btn = document.getElementById("btnFullscreen");
    if(btn) btn.addEventListener("click", enterFullscreenLandscape);

    const skipBtn = document.getElementById("btnSkipRotate");
    if(skipBtn) skipBtn.addEventListener("click", dismissRotateOverlay);
  });
})();

// Se o usuário sair da tela cheia (ex: apertou "voltar"), o overlay
// volta a aparecer sozinho caso o celular ainda esteja em retrato ou
// fora da tela cheia — o CSS reage automaticamente à classe is-fullscreen.
