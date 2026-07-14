#!/usr/bin/env node
/**
 * tools/import-players.js
 *
 * Importa jogadores em massa a partir de um CSV, gerando os objetos de
 * jogador, baixando as fotos e atualizando data/players.json e
 * data/boxes/{box_id}.json.
 *
 * Uso:
 *   node tools/import-players.js tools/template.csv
 *
 * Rode a partir da raiz do repositório (onde ficam as pastas data/ e assets/).
 * Ferramenta interna — não entra no build do app.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Caminhos (relativos à raiz do projeto — assume-se que o script roda
// a partir da raiz, ex: `node tools/import-players.js tools/template.csv`)
// ---------------------------------------------------------------------------
const ROOT = process.cwd();
const PLAYERS_JSON = path.join(ROOT, "data", "players.json");
const BOXES_DIR = path.join(ROOT, "data", "boxes");
const BOXES_INDEX = path.join(BOXES_DIR, "index.json");
const PLAYERS_ASSETS_DIR = path.join(ROOT, "assets", "players");
const FLAGS_TABLE = path.join(__dirname, "paises-bandeiras.json");
const RARITY_TABLE = path.join(__dirname, "rarity-labels.json");

const DEFAULT_FLAG = "🏳️";
const REQUIRED_COLUMNS = [
  "nome",
  "overall",
  "posicao",
  "clube",
  "nacionalidade",
  "raridade",
  "foto_url",
  "box_id",
];

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function normalize(str) {
  return String(str ?? "").trim();
}

function normalizeKey(str) {
  return normalize(str).toLowerCase();
}

/**
 * Parser de CSV simples, com suporte a campos entre aspas (permite vírgula
 * e aspas escapadas como "" dentro do campo). Suficiente para o template
 * desta ferramenta — não é um parser RFC4180 completo.
 */
function parseCsv(content) {
  const text = content.replace(/^\uFEFF/, ""); // remove BOM se houver
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // ignora — o \n subsequente fecha a linha
    } else {
      field += char;
    }
  }
  // última linha (caso o arquivo não termine com quebra de linha)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => normalize(cell) !== ""));
}

function csvToObjects(content) {
  const rows = parseCsv(content);
  if (rows.length === 0) return [];

  const header = rows[0].map(normalizeKey);
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    throw new Error(
      `CSV inválido — colunas obrigatórias faltando no cabeçalho: ${missing.join(", ")}`
    );
  }

  const dataRows = rows.slice(1);
  return dataRows.map((cells, idx) => {
    const obj = { __line: idx + 2 }; // +2: linha 1 é o cabeçalho, humano conta a partir de 1
    header.forEach((col, i) => {
      obj[col] = normalize(cells[i]);
    });
    return obj;
  });
}

/** Próximo ID sequencial no formato p001, p002... a partir do maior já existente. */
function makeIdGenerator(existingPlayers) {
  let max = 0;
  for (const p of existingPlayers) {
    const match = /^p(\d+)$/.exec(String(p.id || ""));
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }
  let counter = max;
  return function nextId() {
    counter += 1;
    return "p" + String(counter).padStart(3, "0");
  };
}

function duplicateKey(name, club) {
  return normalizeKey(name) + "|" + normalizeKey(club);
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ao baixar imagem`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buffer);
}

function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Uso: node tools/import-players.js <caminho-do-csv>");
    process.exit(1);
  }

  const csvAbsPath = path.resolve(csvPath);
  if (!fs.existsSync(csvAbsPath)) {
    console.error(`⚠ arquivo CSV não encontrado: ${csvAbsPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(PLAYERS_JSON)) {
    console.error(`⚠ não encontrei ${PLAYERS_JSON}. Rode o script a partir da raiz do projeto.`);
    process.exit(1);
  }

  const flagsTable = readJson(FLAGS_TABLE, {});
  const rarityTable = readJson(RARITY_TABLE, {});
  const players = readJson(PLAYERS_JSON, []);

  const existingKeys = new Set(players.map((p) => duplicateKey(p.name, p.club)));
  const nextId = makeIdGenerator(players);

  fs.mkdirSync(PLAYERS_ASSETS_DIR, { recursive: true });
  fs.mkdirSync(BOXES_DIR, { recursive: true });

  let rows;
  try {
    rows = csvToObjects(fs.readFileSync(csvAbsPath, "utf8"));
  } catch (err) {
    console.error(`⚠ ${err.message}`);
    process.exit(1);
  }

  const newPlayers = [];
  const skipped = [];
  // agrupa os novos IDs por box_id, na ordem em que aparecem no CSV
  const idsByBox = new Map();

  for (const row of rows) {
    const line = row.__line;
    const nome = row.nome;
    const overallRaw = row.overall;
    const posicao = row.posicao;
    const clube = row.clube;
    const nacionalidade = row.nacionalidade;
    const raridade = row.raridade;
    const fotoUrl = row.foto_url;
    const boxId = row.box_id;
    const tier = normalize(row.tier) || "destaque";

    // --- validação dos campos obrigatórios ---
    if (!nome || !posicao || !clube || !nacionalidade || !raridade || !fotoUrl || !boxId) {
      console.warn(`⚠ linha ${line}: campo obrigatório vazio, pulando`);
      skipped.push({ line, motivo: "campo obrigatório vazio" });
      continue;
    }

    const overall = parseInt(overallRaw, 10);
    if (!Number.isInteger(overall) || String(overall) !== overallRaw.trim()) {
      console.warn(`⚠ linha ${line}: overall inválido, pulando`);
      skipped.push({ line, motivo: "overall inválido" });
      continue;
    }

    if (!isValidUrl(fotoUrl)) {
      console.warn(`⚠ linha ${line}: foto_url inválida, pulando`);
      skipped.push({ line, motivo: "foto_url inválida" });
      continue;
    }

    const rarityLabel = rarityTable[raridade];
    if (!rarityLabel) {
      console.warn(`⚠ linha ${line}: raridade "${raridade}" desconhecida, pulando`);
      skipped.push({ line, motivo: "raridade desconhecida" });
      continue;
    }

    // --- checagem de duplicado (nome + clube) ---
    const key = duplicateKey(nome, clube);
    if (existingKeys.has(key)) {
      const dupe = players.find((p) => duplicateKey(p.name, p.club) === key);
      console.warn(`⚠ linha ${line}: "${nome}" já existe como ${dupe ? dupe.id : "?"}, pulando duplicado`);
      skipped.push({ line, motivo: "duplicado" });
      continue;
    }

    // --- bandeira ---
    let flag = flagsTable[nacionalidade];
    if (!flag) {
      console.warn(
        `⚠ linha ${line}: país "${nacionalidade}" não encontrado em tools/paises-bandeiras.json, usando bandeira padrão (complete a tabela depois)`
      );
      flag = DEFAULT_FLAG;
    }

    // --- gera o ID e baixa a imagem ---
    const id = nextId();
    const imagePath = `assets/players/${id}.png`;
    const imageAbsPath = path.join(ROOT, imagePath);

    try {
      await downloadImage(fotoUrl, imageAbsPath);
    } catch (err) {
      console.warn(`⚠ linha ${line}: falha ao baixar imagem (${err.message}), pulando jogador`);
      skipped.push({ line, motivo: "download de imagem falhou" });
      // "devolve" o ID não é necessário — IDs pulados apenas deixam uma
      // lacuna na sequência, o que é seguro e evita reaproveitar IDs.
      continue;
    }

    const player = {
      id,
      name: nome,
      overall,
      club: clube,
      nationality: nacionalidade,
      nationalityFlag: flag,
      position: posicao,
      rarity: raridade,
      rarityLabel,
      image: imagePath,
      tier,
    };

    newPlayers.push(player);
    existingKeys.add(key); // evita duplicado dentro do mesmo CSV também

    if (!idsByBox.has(boxId)) idsByBox.set(boxId, []);
    idsByBox.get(boxId).push(id);
  }

  // --- grava players.json (somando, nunca substituindo) ---
  if (newPlayers.length > 0) {
    const updatedPlayers = players.concat(newPlayers);
    writeJson(PLAYERS_JSON, updatedPlayers);
  }

  // --- cria/atualiza as boxes ---
  const boxSummaries = [];
  let boxIndex = readJson(BOXES_INDEX, []);
  let boxIndexChanged = false;

  for (const [boxId, ids] of idsByBox.entries()) {
    const boxFile = path.join(BOXES_DIR, `${boxId}.json`);
    let box = readJson(boxFile, null);
    let isNew = false;

    if (!box) {
      isNew = true;
      box = {
        id: boxId,
        name: "",
        banner: "",
        priceCoins: 0,
        active: true,
        players: [],
      };
    }

    box.players = Array.isArray(box.players) ? box.players : [];
    const already = new Set(box.players);
    const added = ids.filter((id) => !already.has(id));
    box.players = box.players.concat(added);

    writeJson(boxFile, box);

    if (isNew) {
      const fileName = `${boxId}.json`;
      if (!boxIndex.includes(fileName)) {
        boxIndex.push(fileName);
        boxIndexChanged = true;
      }
    }

    boxSummaries.push({
      boxId,
      isNew,
      added: added.length,
      total: box.players.length,
    });
  }

  if (boxIndexChanged) {
    writeJson(BOXES_INDEX, boxIndex);
  }

  // --- resumo final ---
  console.log("");
  console.log(`✔ ${newPlayers.length} jogadores importados`);
  if (skipped.length > 0) {
    console.log(`⚠ ${skipped.length} pulados`);
  }
  for (const b of boxSummaries) {
    const status = b.isNew ? "criada" : "atualizada";
    console.log(
      `✔ ${b.boxId}.json ${status} (${b.added} jogadores adicionados, total agora: ${b.total})`
    );
  }
}

main().catch((err) => {
  console.error("⚠ erro inesperado:", err);
  process.exit(1);
});
