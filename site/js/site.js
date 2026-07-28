/* =========================================================
   BOX CLUBE — site.js
   Puxa dados reais do jogo (data/boxes, data/players.json,
   data/content-version.json) pra alimentar o site institucional.
   Sem build step, sem dependências — só fetch + DOM.
   ========================================================= */
(function () {
  "use strict";

  var DATA_BASE = "../data/";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Hero: cartão holográfico com tilt ---------------- */
  function initHeroTilt() {
    var stage = document.querySelector(".hero-card-stage");
    var card = document.getElementById("heroCard");
    if (!stage || !card || reduceMotion) return;
    var isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (isTouch) return;

    stage.addEventListener("mousemove", function (e) {
      var rect = stage.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width - 0.5;
      var y = (e.clientY - rect.top) / rect.height - 0.5;
      var rotY = x * 22;
      var rotX = y * -16;
      card.style.transform = "rotateY(" + (rotY - 6) + "deg) rotateX(" + (rotX + 3) + "deg)";
    });
    stage.addEventListener("mouseleave", function () {
      card.style.transform = "rotateY(-10deg) rotateX(4deg)";
    });
  }

  /* ---------------- Utilidades ---------------- */
  function fetchJSON(path) {
    return fetch(DATA_BASE + path).then(function (r) {
      if (!r.ok) throw new Error("Falha ao buscar " + path);
      return r.json();
    });
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  /* ---------------- Boxes ao vivo ---------------- */
  function loadBoxes() {
    var rail = document.getElementById("boxRail");
    if (!rail) return;

    fetchJSON("boxes/index.json")
      .then(function (files) {
        return Promise.all(
          files.map(function (f) {
            return fetchJSON("boxes/" + f).catch(function () { return null; });
          })
        );
      })
      .then(function (boxes) {
        var now = new Date();
        var active = boxes
          .filter(Boolean)
          .filter(function (b) {
            if (b.active === false) return false;
            var starts = b.startsAt ? new Date(b.startsAt) : null;
            var expires = b.expiresAt ? new Date(b.expiresAt) : null;
            if (starts && starts > now) return false;
            if (expires && expires < now) return false;
            return true;
          })
          .sort(function (a, b) {
            var da = a.startsAt ? new Date(a.startsAt) : new Date(0);
            var db = b.startsAt ? new Date(b.startsAt) : new Date(0);
            return db - da;
          })
          .slice(0, 8);

        if (!active.length) {
          rail.innerHTML = '<p class="box-rail-empty">Nenhum box ativo no momento — volte em breve.</p>';
          return;
        }

        rail.innerHTML = active
          .map(function (b) {
            var price = b.priceGP
              ? b.priceGP + " GP"
              : (b.priceCoins ? b.priceCoins + " moedas" : "Grátis");
            var dateLabel = b.startsAt ? "Desde " + fmtDate(b.startsAt) : "";
            var banner = b.banner ? "../" + b.banner : "";
            return (
              '<div class="box-card">' +
              (banner ? '<img class="box-card-banner" loading="lazy" src="' + banner + '" alt="' + escapeHtml(b.name || "Box") + '">' : "") +
              '<div class="box-card-body">' +
              '<div class="box-card-name">' + escapeHtml(b.name || "Box") + "</div>" +
              '<div class="box-card-meta">' +
              '<span class="box-card-price">' + price + "</span>" +
              '<span class="box-card-date">' + dateLabel + "</span>" +
              "</div></div></div>"
            );
          })
          .join("");
      })
      .catch(function () {
        rail.innerHTML = '<p class="box-rail-empty">Não foi possível carregar os boxes agora.</p>';
      });
  }

  /* ---------------- Elenco em destaque ---------------- */
  function loadPlayers() {
    var grid = document.getElementById("playerGrid");
    if (!grid) return;

    fetchJSON("players.json")
      .then(function (players) {
        var top = players
          .slice()
          .sort(function (a, b) { return (b.overall || 0) - (a.overall || 0); })
          .slice(0, 8);

        if (!top.length) {
          grid.innerHTML = '<p class="box-rail-empty">Elenco indisponível no momento.</p>';
          return;
        }

        grid.innerHTML = top
          .map(function (p) {
            var img = p.image ? "../" + p.image : "";
            var flag = p.nationalityFlag || "";
            return (
              '<div class="player-card rarity-' + (p.rarity || "branca") + '">' +
              '<div class="player-card-img-wrap">' +
              (img ? '<img loading="lazy" src="' + img + '" alt="' + escapeHtml(p.name || "") + '">' : "") +
              "</div>" +
              '<div class="player-card-body">' +
              '<div class="player-card-name">' + escapeHtml(p.name || "") + "</div>" +
              '<div class="player-card-meta">' +
              "<span>" + flag + " " + (p.position || "") + "</span>" +
              '<span class="player-card-ovr">' + (p.overall || "") + "</span>" +
              "</div></div></div>"
            );
          })
          .join("");
      })
      .catch(function () {
        grid.innerHTML = '<p class="box-rail-empty">Não foi possível carregar o elenco agora.</p>';
      });
  }

  /* ---------------- Novidades ---------------- */
  function loadNews() {
    var card = document.getElementById("newsCard");
    if (!card) return;

    fetchJSON("content-version.json")
      .then(function (data) {
        var updates = (data && data.updates) || [];
        if (!updates.length) {
          card.innerHTML = '<p class="box-rail-empty">Sem novidades registradas ainda.</p>';
          return;
        }
        var latest = updates.slice().sort(function (a, b) { return (b.version || 0) - (a.version || 0); })[0];
        var count = (latest.assets || []).length;
        card.innerHTML =
          "<div>" +
          '<div class="news-version">Versão ' + (latest.version || "") + "</div>" +
          '<div class="news-title">' + escapeHtml(latest.label || "Atualização de conteúdo") + "</div>" +
          '<div class="news-date">' + (latest.releaseDate ? new Date(latest.releaseDate).toLocaleDateString("pt-BR") : "") + "</div>" +
          "</div>" +
          '<div class="news-count">' + count + " itens atualizados</div>";
      })
      .catch(function () {
        card.innerHTML = '<p class="box-rail-empty">Não foi possível carregar as novidades agora.</p>';
      });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initHeroTilt();
    loadBoxes();
    loadPlayers();
    loadNews();
  });
})();
