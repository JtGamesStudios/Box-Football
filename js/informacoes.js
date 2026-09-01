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
    id: "update-countdown-3-days-2026-08-31",
    date: "31/08/2026",
    title: "⏳ Faltam 3 dias: a atualização de 03/09 está chegando!",
    preview: "Três novas Boxes, jogadores Épicos, Mercado de Transferências, sistema de Liberar Jogador, melhorias importantes no gameplay e muito mais.",
    body: [
      "⏳ A contagem regressiva começou: faltam apenas 3 dias para a atualização de 03/09.",
      "⚽ A atualização trará três novas Boxes: Box Ronaldo, Box Figo e Box Super Onze, incluindo novos jogadores e o novo tier Épico.",
      "🎬 Novas artes, banners e vídeos também chegam junto com o conteúdo das novas Boxes.",
      "🎮 O gameplay receberá um rebalanceamento importante: o overall dos jogadores passará a influenciar muito mais as partidas.",
      "💰 Novo sistema: Liberar Jogador. Será possível liberar cópias de jogadores do elenco para receber GP.",
      "🏪 A antiga troca automática será substituída pelo Mercado de Transferências, com jogadores disponíveis por GP e rodadas renovadas automaticamente a cada 2 horas.",
      "📦 O card Pacotes também será atualizado automaticamente para mostrar a imagem do pacote ativo mais recente.",
      "📅 Continue acompanhando as Informações do jogo: nos próximos dias, novas mensagens revelarão mais detalhes até a chegada da atualização."
    ],
  },

{
    id: "update-countdown-2-days-2026-09-01",
    date: "01/09/2026",
    title: "🔥 Faltam 2 dias: Ronaldo, Figo e Super Onze vêm aí!",
    preview: "A atualização de 03/09 está cada vez mais próxima. Conheça melhor as três novas Boxes e as novidades que vão mudar o jogo.",
    body: [
      "🔥 Faltam apenas 2 dias para a atualização de 03/09.",
      "⭐ Box Ronaldo — uma nova Box especial com conteúdo Épico e um sistema exclusivo de giro de 10 jogadores.",
      "⭐ Box Figo — mais uma nova Box com jogadores especiais do novo conteúdo da atualização.",
      "⚡ Box Super Onze — uma Box temática especial que também chega no dia da atualização.",
      "🎯 O novo tier Épico será exclusivo inicialmente para esses novos conteúdos, sem alterar o funcionamento das Boxes antigas.",
      "🎮 As cartas também passarão a importar muito mais dentro das partidas: jogadores fortes terão vantagens mais perceptíveis.",
      "🏪 Além disso, o novo Mercado de Transferências permitirá encontrar jogadores por GP em rodadas que se renovam automaticamente.",
      "⏳ Amanhã entraremos no último dia da contagem regressiva. Prepare o seu elenco!"
    ],
  },

{
    id: "update-countdown-1-day-2026-09-02",
    date: "02/09/2026",
    title: "🚨 É amanhã! Confira tudo que chega na atualização de 03/09",
    preview: "Amanhã chegam novas Boxes, jogadores Épicos, Mercado, Liberar Jogador, melhorias no gameplay e diversos conteúdos novos.",
    body: [
      "🚨 A espera está quase no fim: a atualização chega amanhã, 03/09.",
      "📦 CONFIRA AS PRINCIPAIS NOVIDADES:",
      "⭐ Três novas Boxes: Ronaldo, Figo e Super Onze.",
      "🔥 Novos jogadores e a estreia do tier Épico.",
      "🎰 Novo sistema exclusivo de giro de 10 na Box Ronaldo.",
      "🎬 Novas cutscenes, vídeos, banners e artes.",
      "🎮 Gameplay rebalanceado: overall e força dos jogadores terão muito mais impacto nas partidas.",
      "💰 Novo sistema Liberar Jogador: transforme cópias do seu elenco em GP.",
      "🏪 Novo Mercado de Transferências: jogadores disponíveis por GP, preços variáveis e novas rodadas automaticamente a cada 2 horas.",
      "📦 Pacotes mais inteligentes: o menu exibirá automaticamente a imagem do pacote ativo mais recente.",
      "🔧 Também foram realizadas correções importantes no sistema de raridades para garantir o funcionamento correto dos jogadores Épicos e Big Time.",
      "⏳ Prepare-se!"
    ],
  },

{
    id: "update-day-2026-09-03",
    date: "03/09/2026",
    title: "🚀 ATUALIZAÇÃO DISPONÍVEL!",
    preview: "A atualização de 03/09 chegou com três novas Boxes, jogadores Épicos, Mercado de Transferências, Liberar Jogador e grandes melhorias no gameplay.",
    body: [
      "🚀 A ATUALIZAÇÃO DE 03/09 JÁ ESTÁ DISPONÍVEL!",
      "Hoje começa uma nova fase para o Box Football. Confira tudo que chegou:",
      "⭐ BOX RONALDO — nova Box especial com jogadores Épicos e sistema exclusivo de giro de 10.",
      "⭐ BOX FIGO — novo conteúdo especial com novos jogadores.",
      "⚡ BOX SUPER ONZE — nova Box temática especial disponível na atualização.",
      "🏆 NOVO TIER ÉPICO — uma nova raridade chega ao jogo com os conteúdos especiais desta atualização.",
      "🎬 NOVAS CUTSCENES E VÍDEOS — novas animações e conteúdos visuais foram adicionados às Boxes da atualização.",
      "🎮 GAMEPLAY REBALANCEADO — o overall dos jogadores agora tem um impacto muito maior no resultado das partidas.",
      "💰 LIBERAR JOGADOR — agora é possível liberar cópias de jogadores do elenco para receber GP.",
      "🏪 MERCADO DE TRANSFERÊNCIAS — a antiga troca automática dá lugar ao Mercado, com 20 jogadores por rodada, preços em GP e renovação automática a cada 2 horas.",
      "📦 PACOTES ATUALIZADOS — o card Pacotes agora identifica automaticamente o pacote ativo mais recente.",
      "🔧 CORREÇÕES IMPORTANTES — o sistema de raridades foi corrigido para preservar corretamente jogadores Épicos e Big Time.",
      "📥 A atualização também inclui novos jogadores, artes, banners, vídeos e arquivos de conteúdo preparados para a nova fase do jogo.",
      "Obrigado por continuar jogando. Entre agora e descubra todas as novidades da atualização de 03/09!"
    ],
  },
    id: "box-barcelona-repeticao-2026-08-28",
    date: "28/08/2026",
    title: "🔵🔴 Repetição de Box: Barcelona Iconic Moments até 03/09",
    preview: "A Box do dia estará repetindo o Barcelona Iconic Moments até 03/09, quando entra em vigor a atualização com mudanças de gameplay.",
    body: [
      "A partir de hoje, a Box do dia será a repetição da Box Barcelona Iconic Moments, disponível até o dia 03/09.",
      "⚠️ Aviso importante: no dia 03/09 será lançada uma nova atualização, trazendo diversas mudanças de gameplay e outros ajustes no jogo. Acompanhe os próximos avisos para mais detalhes.",
    ],
  },
{
    id: "update-parte1-2026-08-26",
    date: "26/08/2026",
    title: "🚀 Atualização Parte 1 disponível: Pack Blue Lock, novas animações e Nova Temporada",
    preview: "Pack Blue Lock (500 Moedas) com 1 Iconic garantido, animações em todas as próximas Boxes especiais e Nova Temporada em 03/09 com Match Pass renovado.",
    body: [
      "A Parte 1 da atualização já está disponível. Confira as novidades:",
      "⚽ Pack Blue Lock — disponível por 500 Moedas, com 1 carta Iconic garantida. Sem sorteio: o conteúdo é exibido integralmente antes da compra. Disponível em Contract > Pacotes.",
      "🎬 Animações — a partir de agora, todas as próximas Boxes especiais contarão com animações exclusivas de abertura.",
      "🏆 Nova Temporada — com lançamento previsto para 03/09, trazendo Match Pass renovado e novas Boxes.",
      "📦 Sobre a Parte 2: o restante da atualização será lançado em 03/09, junto com a Nova Temporada, totalizando mais de 100MB em atualizações. Recomendamos liberar espaço de armazenamento no dispositivo.",
    ],
  },
{
    id: "pacotes-teaser-2026-09",
    date: "22/08/2026",
    title: "🎁 Novo recurso: Pacotes com conteúdo garantido",
    preview: "Um novo tipo de oferta, no qual todo o conteúdo é exibido antes da compra.",
    body: [
      "O modo Pacotes já está disponível. Diferentemente das Boxes tradicionais, os Pacotes não utilizam sorteio: a carta principal e o elenco completo são exibidos integralmente antes da compra, além de bônus em GP, Moedas e um item cosmético exclusivo.",
      "🔒 Em breve, novos Pacotes trarão jogadores exclusivos, ainda inéditos no Box Football.",
      "Cada Pacote possui estoque e prazo limitados. Recomendamos atenção às ofertas disponíveis.",
      "Disponível em Contract > Pacotes.",
    ],
  },
{
    id: "boxes-epic-and-konami-cup-2026-09-03",
    date: "21/08/2026",
    title: "🏆 Três novas Boxes Epic e evento Konami Cup / Matchday",
    preview: "Spanish League (03/09), Netherlands (06/09) e Brazil 1994 (10/09), além do novo evento rotativo Konami Cup.",
    body: [
      "Três novas Boxes Epic serão lançadas em datas distintas, cada uma contendo três cartas principais:",
      "🇪🇸 03/09, às 23h — Spanish League: Roberto Carlos, F. Torres e R. van der Vaart.",
      "🇳🇱 06/09, às 23h — Netherlands: M. van Basten, F. Rijkaard e R. Gullit.",
      "🇧🇷 10/09, às 23h — Brazil 1994: Romário, Cafu e Bebeto.",
      "As três Boxes permanecerão disponíveis até 13/09, às 23h.",
      "🏆 Novidade: o evento Konami Cup passa a ser rotativo, ocorrendo automaticamente todo domingo e quarta-feira, com premiação em Moedas e GP.",
      "⚽ Durante clássicos do futebol mundial (Real Madrid x Atlético de Madrid, Inter x Napoli, Juventus x Milan, Everton x Manchester United, Arsenal x Chelsea, entre outros), o Konami Cup passa a ser um Matchday temático, com banner especial e as mesmas premiações.",
      "📅 Sobre a Grande Atualização (animações de abertura para Iconics, Big Times e Legends, músicas originais e Nova Temporada do Match Pass): o lançamento está previsto para 13/09, domingo, às 23h, logo após estas três Boxes Epic.",
    ],
  },
{
    id: "big-update-2026-09-03",
    date: "20/08/2026",
    title: "🎬 Grande Atualização adiada para 13/09, às 23h",
    preview: "Animações para todos os Iconics, Big Times e Legends, músicas originais e Nova Temporada do Match Pass — nova data: 13/09.",
    body: [
      "⚠️ Atualização deste aviso: a Grande Atualização foi adiada de 03/09 para 13/09, às 23h, para permitir o lançamento completo das novas Boxes Epic (Spanish League, Netherlands e Brazil 1994).",
      "No dia 13/09, às 23h, será lançada uma das maiores atualizações do Box Football até o momento.",
      "🎬 Animações exclusivas de abertura para todos os cards Iconic Moments, Big Time e Legends lançados a partir dessa data.",
      "🎵 Disponibilização de todas as músicas originais das cutscenes.",
      "🏆 Nova Temporada do Match Pass, com trilha ampliada e premiação reformulada.",
      "Tamanho estimado do download: aproximadamente 1 GB. Recomendamos verificar atualizações no aplicativo assim que disponíveis.",
    ],
  },
{
    id: "big-update-2026-09",
    date: "16/08/2026",
    title: "Grande Atualização disponível em 16/08",
    preview: "Box Nostalgia Vol.1, Box Big Time 30th Anniversary, Box R. Higuita e os eventos Brazil France / Brazil Legends.",
    body: [
      "No dia 16/08, foi lançada uma atualização com três novas Boxes e dois eventos exclusivos do Brasil.",
      "Box Nostalgia Vol.1 — inclui R. Baggio, Adriano e G. Piqué.",
      "Box Big Time — 30th Anniversary — 12 lendas, com um total de 8 giros gratuitos.",
      "Box R. Higuita — carta Epic do lendário goleiro colombiano.",
      "Eventos Brazil France e Brazil Legends — vitórias contra o COM acumulam pontos para desbloquear giros gratuitos na Box Big Time, além de recompensas em Moedas.",
    ],
  },
{
    id: "battle-cards-mode-2026-08",
    date: "28/07/2026",
    title: "⚔️ Novo modo: Batalha de Cartas",
    preview: "Desafie níveis e chefes com os cinco jogadores mais fortes do seu elenco. Lançamento em 02/08, às 23h.",
    body: [
      "Um novo modo de jogo está disponível: a Batalha de Cartas, trazendo novos desafios e recompensas para o clube.",
      "Nas partidas, o sistema seleciona automaticamente os cinco jogadores mais fortes do elenco atual. Recomendamos manter um elenco equilibrado para obter a melhor formação possível.",
      "O evento é dividido em níveis de dificuldade progressiva, com um desafio final contra o Chefe (Boss). A vitória contra o Chefe conclui o evento e garante recompensas exclusivas.",
      "⚠️ Nota sobre a versão Mobile: foram identificados bugs nas escalações na versão para celular. A equipe já está trabalhando na correção.",
      "O modo Batalha de Cartas está disponível a partir de 02/08, às 23h.",
    ],
  },
  {
    id: "app-download-apk-2026-07",
    date: "24/07/2026",
    title: "📲 Aplicativo disponível para download",
    preview: "Baixe o Box Football Mobile e jogue diretamente pelo aplicativo.",
    body: [
      "O aplicativo do Box Football já está disponível. A partir de 30/07, às 23h, o acesso pelo navegador será descontinuado, e o jogo passará a funcionar exclusivamente pelo aplicativo.",
      "O progresso é vinculado à conta Google: ao abrir o aplicativo pela primeira vez e entrar com a mesma conta previamente vinculada, todos os dados (fichas, elenco, moedas e demais informações) são transferidos automaticamente.",
      "Toque no botão abaixo para baixar o APK. Após a conclusão do download, o Android oferecerá a opção de instalação.",
    ],
    action: { type: "download", label: "⬇️ Baixar o aplicativo", url: "assets/app/box-clube.apk", filename: "box-clube.apk" },
  },
  {
    id: "app-launch-migration-2026-07",
    date: "22/07/2026",
    title: "🚨 Importante: lançamento do aplicativo Box Football",
    preview: "Lançamento do aplicativo em 30/07, às 23h — vincule sua conta Google para preservar o progresso.",
    body: [
      "No dia 30/07, às 23h, o Box Football será lançado oficialmente como aplicativo. A partir desse momento, o jogo passará a contar com melhorias de desempenho, maior estabilidade e novos recursos.",
      "Para preservar o progresso, será necessário transferir a conta do navegador para o aplicativo. Todo o progresso será mantido durante o processo.",
      "Isso inclui moedas GP e Coins, todos os jogadores do elenco, jogadores já removidos das Boxes para evitar repetições, times criados, formações, técnicos e escalações.",
      "Também serão transferidos o progresso das missões, recompensas resgatadas, presentes pendentes e recebidos, cupons utilizados, informações de perfil, nacionalidade, progresso do Modo Campanha, estatísticas de vitórias, empates e derrotas, dificuldade selecionada, histórico de partidas, progresso de eventos, pontos acumulados, marcos resgatados, tentativas diárias, configurações de som, vibração e redução de movimento, além das estatísticas gerais da conta, como quantidade de Boxes abertas, bolas recebidas por raridade, GP utilizado e sequência de login diário.",
      "Para contas com amigos adicionados, a lista de amigos e o histórico de partidas PvP também serão preservados no aplicativo.",
      "Para realizar a transferência antes do lançamento, acesse Configurações e selecione \"Vincular conta Google\". Essa ação associa o progresso atual à conta Google, sem necessidade de armazenar códigos.",
      "Após o lançamento do aplicativo, em 30/07, às 23h, basta abrir o Box Football Mobile e entrar com a mesma conta Google vinculada anteriormente. Após a confirmação, todos os dados serão carregados automaticamente, permitindo continuar exatamente de onde parou.",
      "O identificador único do navegador, gerado localmente e exibido na inicialização do jogo, não será transferido. Esse identificador pertence exclusivamente ao navegador ou dispositivo utilizado até então e permanecerá independente. Ao instalar o aplicativo, um novo identificador de dispositivo será gerado automaticamente, sem impacto sobre a conta, os jogadores ou o progresso.",
      "O processo de transferência garante uma migração segura entre navegador e aplicativo. O clube, os jogadores, as conquistas e toda a evolução do jogador permanecerão preservados nesta nova etapa do Box Football.",
      "Recomendamos vincular a conta Google previamente ao lançamento do aplicativo, em 30/07, às 23h.",
    ],
    action: { label: "🔄 Vincular conta Google", nav: "config" },
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
