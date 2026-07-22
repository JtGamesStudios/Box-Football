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
    id: "app-launch-migration-2026-07",
    date: "22/07/2026",
    title: "🚨 IMPORTANTE: Box-Football está chegando ao aplicativo!",
    preview: "Lançamento do app em 30/07 às 23h — prepare a transferência da sua conta.",
    body: [
      "No dia 30/07 às 23h, o Box-Football dará um grande passo com o lançamento do aplicativo oficial. A partir desse momento, você poderá continuar sua jornada em uma nova experiência, com melhorias de desempenho, mais estabilidade e novos recursos.",
      "Para garantir que você não perca nenhum progresso, será necessário realizar a transferência da sua conta do navegador para o aplicativo. Todo o seu progresso será mantido durante a migração.",
      "Isso inclui suas moedas GP e Coins, todos os jogadores que você já possui no elenco, os jogadores que já foram removidos das boxes para evitar repetições, seus times criados, formações, técnicos e escalações.",
      "Também serão transferidos o progresso das missões, recompensas já resgatadas, presentes pendentes, presentes recebidos, cupons já utilizados, informações do perfil, nacionalidade, progresso do Modo Campanha, estatísticas de vitórias, empates e derrotas, dificuldade escolhida, histórico de partidas, progresso dos eventos, pontos acumulados, marcos resgatados, tentativas diárias, configurações de som, vibração e redução de movimento, além de todas as estatísticas da sua conta, como quantidade de boxes abertas, bolas recebidas por raridade, GP gasto e sequência de login diário.",
      "Se você joga com amigos, seus amigos adicionados e o histórico das partidas PvP também continuarão disponíveis no aplicativo.",
      "Para realizar a transferência, antes do lançamento do aplicativo, entre nesta notícia e selecione a opção de preparar sua conta. O jogo irá gerar um código de transferência vinculado ao seu progresso. Guarde esse código, pois ele será utilizado dentro do aplicativo para recuperar sua conta.",
      "Quando o aplicativo estiver disponível no dia 30/07 às 23h, basta abrir o Box-Football Mobile, escolher a opção de entrar com uma conta existente e informar o código de transferência gerado anteriormente. Após a confirmação, todos os seus dados serão carregados automaticamente e você poderá continuar exatamente de onde parou.",
      "É importante lembrar que o ID único do navegador, aquele código criado localmente e exibido na inicialização do jogo, não será transferido. Esse identificador pertence apenas ao navegador ou dispositivo onde você joga atualmente e continuará sendo independente. Ao instalar o aplicativo, um novo ID de dispositivo será criado automaticamente, mas isso não afetará sua conta, seus jogadores ou seu progresso.",
      "A transferência existe para garantir que a mudança do navegador para o aplicativo seja segura e simples. Seu clube, seus jogadores, suas conquistas e toda sua evolução continuarão com você nessa nova fase do Box-Football.",
      "Prepare sua conta e esteja pronto para o lançamento do aplicativo no dia 30/07 às 23h!",
    ],
    action: { label: "🔄 Preparar transferência da conta", nav: "config" },
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
      showScreen(item.action.nav);
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
