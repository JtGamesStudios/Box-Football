/* =========================================================
   TELA CHEIA + PAISAGEM
   Navegadores só permitem pedir fullscreen/orientação após um
   gesto do usuário (toque no botão). Por isso mostramos o overlay
   "gire o celular" com um botão — ao tocar, entramos em tela cheia
   e tentamos travar a orientação em paisagem.

   Observação importante: o iOS Safari NÃO suporta screen.orientation.lock
   (restrição da Apple). Nesses casos, o app fica em tela cheia mas o
   usuário ainda precisa girar o celular manualmente — não existe forma
   100% garantida de travar isso via navegador no iPhone. Funciona de
   forma completa (fullscreen + trava automática) no Chrome/Android.
   ========================================================= */

function enterFullscreenLandscape(){
  const el = document.documentElement;
  const reqFS = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;

  const tryLockOrientation = ()=>{
    if(screen.orientation && screen.orientation.lock){
      screen.orientation.lock("landscape").catch(()=>{ /* iOS/alguns navegadores não suportam */ });
    }
  };

  if(reqFS){
    Promise.resolve(reqFS.call(el)).then(tryLockOrientation).catch(tryLockOrientation);
  } else {
    tryLockOrientation();
  }
}

document.addEventListener("DOMContentLoaded", ()=>{
  const btn = document.getElementById("btnFullscreen");
  if(btn) btn.addEventListener("click", enterFullscreenLandscape);
});

// Se o usuário sair da tela cheia (ex: apertou "voltar"), o overlay
// volta a aparecer sozinho caso o celular ainda esteja em retrato
// (isso já é resolvido pelo @media no CSS, nenhuma ação extra necessária).
