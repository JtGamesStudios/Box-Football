#!/usr/bin/env node
/**
 * tools/seed-fake-ranking.js
 *
 * Popula a coleção `players` do Firestore com um lote de perfis
 * fictícios (bots: isBot=true), espalhados por vários países e com uma
 * distribuição de rating realista (mais gente no meio da tabela, poucos
 * no topo). Serve pra o Ranking Global não parecer vazio, mesmo antes de
 * ter muita gente de verdade jogando.
 *
 * Os bots convivem no MESMO ranking com os jogadores reais (isBot=false,
 * criados automaticamente quando alguém cadastra o nome de usuário na
 * Campanha — ver js/ranking.js) — a ordenação é só por rating, sem
 * distinção visual entre bot e jogador real na lista.
 *
 * Por padrão cria 3000 bots (dá pra rodar de novo passando outro número
 * como 2º argumento, ex: `node tools/seed-fake-ranking.js chave.json 5000`
 * pra ir além de 3000, ou um número menor só pra testar rápido).
 *
 * Roda UMA VEZ (ou toda vez que quiser adicionar mais bots — ele não
 * duplica quem já existe, usa o mesmo nome como ID do documento).
 *
 * ⚠ Usa o Firebase ADMIN SDK, que tem acesso total ao banco e ignora
 * as regras de segurança do Firestore — por isso precisa de uma chave
 * de conta de serviço (service account), que é um SEGREDO DE VERDADE.
 * NUNCA suba esse arquivo .json pro GitHub (adicione no .gitignore).
 *
 * Como conseguir a chave:
 *   Firebase Console > ⚙ Configurações do projeto > Contas de serviço
 *   > Gerar nova chave privada > baixa o .json
 *
 * Como rodar:
 *   npm install firebase-admin --save-dev
 *   node tools/seed-fake-ranking.js caminho/para/serviceAccountKey.json
 */

const fs = require("fs");
const path = require("path");

const keyPath = process.argv[2];
if (!keyPath) {
  console.error("Uso: node tools/seed-fake-ranking.js <caminho-da-chave-service-account.json>");
  process.exit(1);
}
if (!fs.existsSync(keyPath)) {
  console.error(`⚠ arquivo de chave não encontrado: ${keyPath}`);
  process.exit(1);
}

let admin;
try {
  admin = require("firebase-admin");
} catch {
  console.error("⚠ falta instalar a dependência: npm install firebase-admin --save-dev");
  process.exit(1);
}

const serviceAccount = require(path.resolve(keyPath));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const paises = JSON.parse(
  fs.readFileSync(path.join(__dirname, "paises-bandeiras.json"), "utf8")
);
const nomesPaises = Object.keys(paises);

// ---------------------------------------------------------------------------
// Geração de nomes de usuário fictícios
// ---------------------------------------------------------------------------
const PRIMEIROS_NOMES = [
  "Neo", "Kaue", "Dudu", "Vini", "Léo", "Gui", "Rafa", "Bruno", "Diego", "Caio",
  "Theo", "Enzo", "Lucca", "Davi", "Pedro", "Igor", "Erik", "Ivan", "Marco", "Nico",
  "Alex", "Sami", "Omar", "Yuki", "Kenji", "Jamal", "Amir", "Elias", "Noah", "Liam",
  "Mateo", "Diego", "Pablo", "Luca", "Milan", "Stefan", "Anton", "Boris", "Dmitri", "Pavel",
];
const SOBRENOMES_GAMER = [
  "FC", "Gaming", "Pro", "Elite", "Rei", "King", "Master", "Legend", "10", "07",
  "Craque", "Bola", "Gol", "Furacão", "Ninja", "Prime", "Boss", "TV", "Oficial", "BR",
  "GG", "Play", "Zone", "X", "Real", "United", "Force", "Squad", "Club", "Team",
];

function gerarUsername(usados) {
  let tentativa;
  do {
    const nome = PRIMEIROS_NOMES[Math.floor(Math.random() * PRIMEIROS_NOMES.length)];
    const sufixo = SOBRENOMES_GAMER[Math.floor(Math.random() * SOBRENOMES_GAMER.length)];
    const numero = Math.random() < 0.4 ? Math.floor(Math.random() * 999) : "";
    tentativa = `${nome}${sufixo}${numero}`;
  } while (usados.has(tentativa.toLowerCase()));
  usados.add(tentativa.toLowerCase());
  return tentativa;
}

// ---------------------------------------------------------------------------
// Distribuição de rating: curva em formato de sino, concentrada nas
// divisões do meio (Div 4/3), com cauda fina no Top Division — igual
// data/divisions.json (0 a ~2200+).
// ---------------------------------------------------------------------------
function gerarRatingRealista() {
  // soma de números aleatórios ~ aproxima uma normal (Box-Muller simplificado)
  let soma = 0;
  for (let i = 0; i < 6; i++) soma += Math.random();
  const normal = soma / 6; // média .5, concentrado no centro
  const rating = Math.round(300 + normal * 2000); // ~300 a ~2300
  return Math.max(0, rating);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const QTD_BOTS = parseInt(process.argv[3], 10) || 3000;

async function main() {
  const usados = new Set();
  let batch = db.batch();
  let opsInBatch = 0;
  let total = 0;

  for (let i = 0; i < QTD_BOTS; i++) {
    const username = gerarUsername(usados);
    const nationality = nomesPaises[Math.floor(Math.random() * nomesPaises.length)];
    const rating = gerarRatingRealista();
    const wins = Math.round(rating / 30 + Math.random() * 10);
    const losses = Math.round(wins * (0.6 + Math.random() * 0.6));
    const draws = Math.round(Math.random() * 10);

    const docId = `bot_${username.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
    const ref = db.collection("players").doc(docId);

    batch.set(
      ref,
      {
        username,
        usernameLower: username.toLowerCase(),
        nationality,
        nationalityFlag: paises[nationality],
        rating,
        wins,
        draws,
        losses,
        isBot: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    opsInBatch++;
    total++;

    // Firestore só aceita até 500 operações por batch — a cada 400,
    // envia e começa um lote (batch) novo.
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  }

  if (opsInBatch > 0) await batch.commit();
  console.log(`✔ ${total} bots criados/atualizados na coleção "players"`);
}

main().catch((err) => {
  console.error("⚠ erro ao popular bots:", err);
  process.exit(1);
});
