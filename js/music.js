/* =========================================================
   MÚSICA DE FUNDO
   - Toca uma playlist em loop pelas telas do jogo.
   - Pausa quando a animação de abertura de Box começa (girando/
     revelando).
   - Ao fechar a tela da Box ("Voltar" ou depois de abrir mais
     de uma), troca pra outra faixa da playlist.
   - Controlada pelo switch "Música de fundo" em Configurações,
     e guardada em STATE.settings.music (true/false).

   IMPORTANTE: troque os caminhos abaixo pelos arquivos de música
   reais do projeto (mp3/ogg), em assets/audio/music/.
   ========================================================= */
const MUSIC_TRACKS = [
  "assets/audio/music/track1.mp3",
  "assets/audio/music/track2.mp3",
  "assets/audio/music/track3.mp3",
  "assets/audio/music/track4.mp3",
];

let _musicAudio = null;
let _musicTrackIndex = -1;

function initMusic(){
  if(STATE.settings.music === undefined){
    STATE.settings.music = true; // padrão: música ligada
    persist();
  }

  _musicAudio = new Audio();
  _musicAudio.volume = 0.55;
  _musicAudio.addEventListener("ended", playNextTrack);

  playNextTrack();

  // Navegadores bloqueiam autoplay com som até o usuário interagir
  // com a página pelo menos uma vez. Se o play() inicial for barrado,
  // destrava assim que o jogador tocar em qualquer lugar.
  document.addEventListener("pointerdown", function unlockOnce(){
    if(STATE.settings.music && _musicAudio && _musicAudio.paused){
      _musicAudio.play().catch(()=>{});
    }
    document.removeEventListener("pointerdown", unlockOnce);
  }, { once:true });
}

function pickNextTrackIndex(){
  if(MUSIC_TRACKS.length <= 1) return 0;
  let next;
  do{ next = Math.floor(Math.random()*MUSIC_TRACKS.length); } while(next === _musicTrackIndex);
  return next;
}

function playNextTrack(){
  if(!_musicAudio || MUSIC_TRACKS.length===0) return;
  _musicTrackIndex = pickNextTrackIndex();
  _musicAudio.src = MUSIC_TRACKS[_musicTrackIndex];
  if(STATE.settings.music){
    _musicAudio.play().catch(()=>{}); // ignora bloqueio de autoplay, o unlock cuida disso
  }
}

function pauseMusic(){
  if(_musicAudio) _musicAudio.pause();
}

// Chamado ao sair da tela da Box: troca pra outra faixa da playlist,
// igual ao "quando saía tocava outra".
function resumeMusicWithNextTrack(){
  playNextTrack();
}

function setMusicEnabled(enabled){
  STATE.settings.music = enabled;
  persist();
  if(enabled){
    if(_musicAudio) _musicAudio.play().catch(()=>{});
  } else {
    pauseMusic();
  }
}
