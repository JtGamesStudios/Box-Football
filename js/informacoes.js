/* =========================================================
   INFORMAÇÕES — avisos e notícias do jogo
   =========================================================
   Tela separada das Missões: só é acessada pelo ícone de mensagens
   no topo (ver TOP_ICONS em js/nav.js). As Missões continuam
   acessíveis apenas pelo card "Missões" do Club House.

   Cada item de INFO_ITEMS aparece na lista com a data e, se ainda
   não tiver sido lido, uma bolinha azul ao lado. Ao clicar, abre o
   conteúdo completo em um modal e o item é marcado como lido
   (STATE.readInfoIds). O ícone de mensagens no topo mostra uma seta
   vermelha (id="infoBadgeArrow") sempre que existir pelo menos um
   item ainda não lido; ela some ao ler tudo e volta a aparecer
   sozinha assim que um novo item for adicionado aqui (id novo).

   Pra publicar um novo aviso/notícia, basta adicionar um objeto novo
   no topo do array INFO_ITEMS, com um "id" único.
   ========================================================= */

const INFO_ITEMS = [
{
    id: "boxes-epic-and-konami-cup-2026-09-03",
    date: "03/09/2026",
    title: "🏆 3 novas Boxes Epic (chegada escalonada) + evento Konami Cup / Matchday!",
    preview: "Spanish League (03/09), Netherlands (06/09) e Brazil 1994 (10/09) — e um evento novo entra no ar toda semana.",
    body: [
      "Chegam 3 Boxes Epic novas, cada uma com 3 cartas principais, em datas diferentes:",
      "🇪🇸 03/09 às 23h — Spanish League: Roberto Carlos, F. Torres e R. van der Vaart.",
      "🇳🇱 06/09 às 23h — Netherlands: M. van Basten, F. Rijkaard e R. Gullit.",
      "🇧🇷 10/09 às 23h — Brazil 1994: Romário, Cafu e Bebeto.",
      "As 3 Boxes ficam disponíveis até 13/09 às 23h.",
      "🏆 Novidade: o evento Konami Cup agora é rotativo e entra sozinho todo domingo e toda quarta-feira, sempre com prêmios em Moedas e GP — sem precisar esperar a equipe agendar manualmente.",
      "⚽ Quando houver um clássico rolando pelo futebol mundial (Real Madrid x Atlético de Madrid, Inter x Napoli, Juventus x Milan, Everton x Manchester United, Arsenal x Chelsea, entre outros), o Konami Cup vira um Matchday temático daquele jogo — com banner especial e os mesmos prêmios.",
      "📅 Sobre a Grande Atualização (animações de abertura para Iconics, Big Times e Legends + músicas originais + Nova Temporada do Match Pass): ela chega dia 13/09, domingo, às 23h — logo depois dessas 3 Boxes Epic. Fica ligado!",
    ],
  },
{
    id: "big-update-2026-09-03",
    date: "20/08/2026",
    title: "🎬 Grande Atualização ADIADA para 13/09 às 23h",
    preview: "Animações para todos os Iconics, Big Times e Legends, músicas originais e Nova Temporada do Match Pass — nova data: 13/09.",
    body: [
      "⚠️ Atualização deste aviso: a Grande Atualização foi adiada de 03/09 para o dia 13/09 às 23h, pra dar tempo das novas Boxes Epic (Spanish League, Netherlands e Brazil 1994) rodarem até lá.",
      "Prepare o clube: no dia 13/09 às 23h chega uma das maiores atualizações do Box-Football até agora.",
      "🎬 Animações exclusivas de abertura para TODOS os cards Iconic Moments, Big Time e Legends que chegarem ao jogo a partir dessa data.",
      "🎵 Todas as músicas originais das cutscenes ficam disponíveis no jogo.",
      "🏆 Nova Temporada do Match Pass — trilha mais longa, com premiação reformulada e muito mais prêmios.",
      "Estimativa de tamanho do download: cerca de 1 GB. Fique de olho no app pra baixar assim que a atualização for liberada!",
    ],
  },
{
    id: "big-update-2026-09",
    date: "16/08/2026",
    title: "Grande Atualização chegando dia 16/08!",
    preview: "Box Nostalgia Vol.1, Box Big Time 30th Anniversary, Box R. Higuita e os eventos Brazil France / Brazil Legends.",
    body: [
      "Prepare o clube: no dia 16/08 chega uma atualização grande, com 3 Boxes novas e 2 eventos exclusivos do Brasil.",
      " Box Nostalgia Vol.1 — traz R. Baggio, Adriano e G. Piqué.",
      " Box Big Time — 30th Anniversary — 12 lendas, com um total de 8 giros grátis.",
      " Box R. Higuita — carta Epic do lendário goleiro colombiano.",
      " Eventos Brazil France e Brazil Legends — vença partidas contra o COM pra acumular pontos e desbloquear seus giros grátis na Box Big Time, além de recompensas em Moedas.",
    ],
  },
{
    id: "battle-cards-mode-2026-08",
    date: "28/07/2026",
    title: "⚔️ Novo Modo: Batalha de Cartas (Battle Cards)!",
    preview: "Desafie níveis e chefes com os 5 mais fortes do seu elenco. Lançamento dia 02/08 às 23h!",
    body: [
      "Prepare-se para uma nova forma de jogar! Está chegando o modo Batalha de Cartas (Battle Cards), trazendo novos desafios e recompensas para o seu clube.",
      "Para disputar as partidas, o sistema selecionará automaticamente os 5 jogadores mais fortes do seu elenco atual. Monte um time forte para ter a melhor formação possível!",
      "O evento é dividido em níveis de dificuldade progressiva, terminando em um desafio contra o Chefe Final (Boss). Vença o chefe para zerar o evento e garantir recompensas exclusivas.",
      "⚠️ Nota sobre a versão Mobile: Identificamos que a versão para celular está apresentando alguns bugs nas escalações. Nossa equipe já está trabalhando para corrigir essa falha o mais rápido possível.",
      "O modo Batalha de Cartas estará disponível oficialmente no dia 02/08 às 23h. Prepare seu elenco!"
    ],
  },
  {
    id: "app-download-apk-2026-07",
    date: "24/07/2026",
    title: "📲 O app já está disponível pra baixar!",
    preview: "Baixe o Box-Football Mobile agora e jogue direto pelo app.",
    body: [
      "O aplicativo do Box-Football já está pronto! A partir de 30/07 às 23h não vai ser mais possível jogar pelo navegador — só pelo app.",
      "Seu progresso é vinculado à sua conta Google: ao abrir o app pela primeira vez e entrar com a mesma conta que você já vinculou, tudo (fichas, plantel, moedas e todo o resto) é transferido automaticamente, sem precisar recriar nada.",
      "Toque no botão abaixo pra baixar o APK agora. Assim que o download terminar, o próprio Android já vai te oferecer a instalação.",
    ],
    action: { type: "download", label: "⬇️ Baixar o app agora", url: "assets/app/box-clube.apk", filename: "box-clube.apk" },
  },
  {
    id: "app-launch-migration-2026-07",
    date: "22/07/2026",
    title: "🚨 IMPORTANTE: Box-Football está chegando ao aplicativo!",
    preview: "Lançamento do app em 30/07 às 23h — vincule sua conta Google pra não perder o progresso.",
    body: [
      "No dia 30/07 às 23h, o Box-Football dará um grande passo com o lançamento do aplicativo oficial. A partir desse momento, você poderá continuar sua jornada em uma nova experiência, com melhorias de desempenho, mais estabilidade e novos recursos.",
      "Para garantir que você não perca nenhum progresso, será necessário realizar a transferência da sua conta do navegador para o aplicativo. Todo o seu progresso será mantido durante a migração.",
      "Isso inclui suas moedas GP e Coins, todos os jogadores que você já possui no elenco, os jogadores que já foram removidos das boxes para evitar repetições, seus times criados, formações, técnicos e escalações.",
      "Também serão transferidos o progresso das missões, recompensas já resgatadas, presentes pendentes, presentes recebidos, cupons já utilizados, informações do perfil, nacionalidade, progresso do Modo Campanha, estatísticas de vitórias, empates e derrotas, dificuldade escolhida, histórico de partidas, progresso dos eventos, pontos acumulados, marcos resgatados, tentativas diárias, configurações de som, vibração e redução de movimento, além de todas as estatísticas da sua conta, como quantidade de boxes abertas, bolas recebidas por raridade, GP gasto e sequência de login diário.",
      "Se você joga com amigos, seus amigos adicionados e o histórico das partidas PvP também continuarão disponíveis no aplicativo.",
      "Para realizar a transferência, antes do lançamento do aplicativo, entre em Configurações e toque em \"Vincular conta Google\". Isso associa o seu progresso atual a uma conta Google, sem precisar guardar nenhum código.",
      "Quando o aplicativo estiver disponível no dia 30/07 às 23h, basta abrir o Box-Football Mobile e entrar com a mesma conta Google que você vinculou pelo navegador. Após a confirmação, todos os seus dados serão carregados automaticamente e você poderá continuar exatamente de onde parou.",
      "É importante lembrar que o ID único do navegador, aquele código criado localmente e exibido na inicialização do jogo, não será transferido. Esse identificador pertence apenas ao navegador ou dispositivo onde você joga atualmente e continuará sendo independente. Ao instalar o aplicativo, um novo ID de dispositivo será criado automaticamente, mas isso não afetará sua conta, seus jogadores ou seu progresso.",
      "A transferência existe para garantir que a mudança do navegador para o aplicativo seja segura e simples. Seu clube, seus jogadores, suas conquistas e toda sua evolução continuarão com você nessa nova fase do Box-Football.",
      "Vincule sua conta Google e esteja pronto para o lançamento do aplicativo no dia 30/07 às 23h!",
    ],
    action: { label: "🔄 Vincular conta Google agora", nav: "config" },
  },
];

function isInfoItemRead(id){
  return !!(STATE.readInfoIds && STATE.readInfoIds.includes(id));
}

function markInfoItemRead(id){
  if(!STATE.readInfoIds) STATE.readInfoIds = [];
  if(!STATE.readInfoIds.includes(id)){
    STATE.readInfoIds.push(id);
    persist();
  }
}

/* Mostra/esconde a seta vermelha no ícone de mensagens do topo,
   sempre que existir algum item em INFO_ITEMS ainda não lido. */
function updateInfoBadge(){
  const badge = document.getElementById("infoBadgeArrow");
  if(!badge) return;
  const hasUnread = INFO_ITEMS.some(it => !isInfoItemRead(it.id));
  badge.classList.toggle("hidden", !hasUnread);
}

function renderInformacoes(){
  const wrap = document.getElementById("informacoesList");
  if(!wrap) return;
  if(!INFO_ITEMS.length){
    wrap.innerHTML = `<p class="page-sub" style="margin:0;">Nenhum aviso por enquanto — volte em breve!</p>`;
    return;
  }
  wrap.innerHTML = INFO_ITEMS.map(it => `
    <button class="info-item" data-id="${it.id}">
      <span class="info-item-dot ${isInfoItemRead(it.id) ? "hidden" : ""}" title="Novo"></span>
      <div class="info-item-body">
        <div class="info-item-title">${it.title}</div>
        <div class="info-item-preview">${it.preview}</div>
      </div>
      <div class="info-item-date">${it.date}</div>
    </button>`).join("");

  wrap.querySelectorAll(".info-item").forEach(btn=>{
    btn.onclick = ()=> openInfoItem(btn.dataset.id);
  });
}

function openInfoItem(id){
  const item = INFO_ITEMS.find(it => it.id === id);
  if(!item) return;

  markInfoItemRead(id);
  updateInfoBadge();
  renderInformacoes();

  const overlay = document.getElementById("infoDetailOverlay");
  if(!overlay) return;
  document.getElementById("infoDetailTitle").textContent = item.title;
  document.getElementById("infoDetailDate").textContent = item.date;
  document.getElementById("infoDetailBody").innerHTML = item.body.map(p => `<p>${p}</p>`).join("");

  const actions = document.getElementById("infoDetailActions");
  actions.innerHTML = "";
  if(item.action){
    const btn = document.createElement("button");
    btn.className = "btn btn-primary";
    btn.textContent = item.action.label;
    btn.onclick = ()=>{
      closeInfoDetail();
      if(item.action.type === "download"){
        const a = document.createElement("a");
        a.href = item.action.url;
        a.download = item.action.filename || "";
        document.body.appendChild(a);
        a.click();
        a.remove();
        if(typeof toast === "function") toast("Baixando o app… ao terminar, toque no arquivo pra instalar.", "success");
      } else {
        showScreen(item.action.nav);
      }
    };
    actions.appendChild(btn);
  }

  overlay.classList.remove("hidden");
}

function closeInfoDetail(){
  const overlay = document.getElementById("infoDetailOverlay");
  if(overlay) overlay.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", ()=>{
  const closeBtn = document.getElementById("infoDetailCloseBtn");
  if(closeBtn) closeBtn.onclick = closeInfoDetail;
  const overlay = document.getElementById("infoDetailOverlay");
  if(overlay){
    overlay.addEventListener("click", (e)=>{ if(e.target === overlay) closeInfoDetail(); });
  }
});
