/* =========================================================
   BOX CLUBE — site.js
   Puxa dados reais do jogo (data/boxes, data/players.json,
   data/content-version.json, data/events.json) pra alimentar
   o carrossel, o feed de notícias e as vitrines do site.
   Sem build step, sem dependências — só fetch + DOM.
   ========================================================= */
(function () {
  "use strict";

  var DATA_BASE = "../data/";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function fetchJSON(path) {
    return fetch(DATA_BASE + path).then(function (r) {
      if (!r.ok) throw new Error("Falha ao buscar " + path);
      return r.json();
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function fmtDateShort(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  }

  function fmtDateFull(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function inWindow(item, now) {
    var starts = item.start ? new Date(item.start) : (item.startsAt ? new Date(item.startsAt) : null);
    var ends = item.end ? new Date(item.end) : (item.expiresAt ? new Date(item.expiresAt) : null);
    if (starts && starts > now) return false;
    if (ends && ends < now) return false;
    return true;
  }

  /* ---------------- Nav mobile ---------------- */
  function initNavMobile() {
    var burger = document.getElementById("navBurger");
    var mobile = document.getElementById("navMobile");
    if (!burger || !mobile) return;
    burger.addEventListener("click", function () {
      var open = mobile.classList.toggle("open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    mobile.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        mobile.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------------- Carrossel de campanha ---------------- */
  function initCarousel(slides) {
    var track = document.getElementById("carouselTrack");
    var dotsWrap = document.getElementById("carouselDots");
    var prevBtn = document.getElementById("carouselPrev");
    var nextBtn = document.getElementById("carouselNext");
    if (!track) return;

    if (!slides.length) {
      track.innerHTML = '<div class="carousel-slide"><img src="../assets/banners/banner-boxdraw.jpg" alt="Box Clube"></div>';
      if (dotsWrap) dotsWrap.innerHTML = "";
      return;
    }

    track.innerHTML = slides
      .map(function (s) {
        return (
          '<div class="carousel-slide">' +
          '<img src="../' + s.banner + '" alt="' + escapeHtml(s.title) + '" loading="lazy">' +
          '<span class="carousel-tag">Evento</span>' +
          '<div class="carousel-caption">' + escapeHtml(s.title) + "</div>" +
          "</div>"
        );
      })
      .join("");

    var dots = slides.map(function (_, i) {
      var b = document.createElement("button");
      b.setAttribute("aria-label", "Ir para slide " + (i + 1));
      if (i === 0) b.classList.add("active");
      b.addEventListener("click", function () { goTo(i); });
      return b;
    });
    if (dotsWrap) dots.forEach(function (d) { dotsWrap.appendChild(d); });

    var index = 0;
    var timer = null;

    function render() {
      track.style.transform = "translateX(-" + index * 100 + "%)";
      dots.forEach(function (d, i) { d.classList.toggle("active", i === index); });
    }

    function goTo(i) {
      index = (i + slides.length) % slides.length;
      render();
      restart();
    }

    function next() { goTo(index + 1); }
    function prev() { goTo(index - 1); }

    function restart() {
      if (reduceMotion || slides.length < 2) return;
      clearInterval(timer);
      timer = setInterval(function () { goTo(index + 1); }, 5500);
    }

    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);

    // swipe support
    var startX = null;
    track.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; }, { passive: true });
    track.addEventListener("touchend", function (e) {
      if (startX === null) return;
      var dx = e.changedTouches[0].clientX - startX;
      if (dx > 40) prev();
      else if (dx < -40) next();
      startX = null;
    }, { passive: true });

    render();
    restart();
  }

  /* ---------------- Boxes ao vivo ---------------- */
  function loadBoxes() {
    var rail = document.getElementById("boxRail");
    if (!rail) return Promise.resolve([]);

    return fetchJSON("boxes/index.json")
      .then(function (files) {
        return Promise.all(
          files.map(function (f) { return fetchJSON("boxes/" + f).catch(function () { return null; }); })
        );
      })
      .then(function (boxes) {
        var now = new Date();
        var active = boxes
          .filter(Boolean)
          .filter(function (b) { return b.active !== false && inWindow(b, now); })
          .sort(function (a, b) {
            var da = a.startsAt ? new Date(a.startsAt) : new Date(0);
            var db = b.startsAt ? new Date(b.startsAt) : new Date(0);
            return db - da;
          })
          .slice(0, 8);

        if (!active.length) {
          rail.innerHTML = '<p class="box-rail-empty">Nenhum box ativo no momento — volte em breve.</p>';
          return active;
        }

        rail.innerHTML = active
          .map(function (b) {
            var price = b.priceGP ? b.priceGP + " GP" : (b.priceCoins ? b.priceCoins + " moedas" : "Grátis");
            var dateLabel = b.startsAt ? "Desde " + fmtDateShort(b.startsAt) : "";
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
        return active;
      })
      .catch(function () {
        rail.innerHTML = '<p class="box-rail-empty">Não foi possível carregar os boxes agora.</p>';
        return [];
      });
  }

  /* ---------------- Elenco em destaque ---------------- */
  function loadPlayers() {
    var grid = document.getElementById("playerGrid");
    if (!grid) return;

    fetchJSON("players.json")
      .then(function (players) {
        var top = players.slice().sort(function (a, b) { return (b.overall || 0) - (a.overall || 0); }).slice(0, 8);
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

  /* ---------------- Informações (feed de notícias) + carrossel ---------------- */
  function loadNewsAndCarousel() {
    var list = document.getElementById("newsList");

    Promise.all([
      fetchJSON("content-version.json").catch(function () { return { updates: [] }; }),
      fetchJSON("events.json").catch(function () { return { activeEvents: [] }; })
    ]).then(function (results) {
      var contentVersion = results[0];
      var eventsData = results[1];
      var now = new Date();

      var updates = (contentVersion.updates || []).map(function (u) {
        return {
          date: u.releaseDate,
          tagLabel: "Atualização",
          tagClass: "tag-update",
          title: u.label || "Atualização de conteúdo"
        };
      });

      var events = (eventsData.activeEvents || []).map(function (e) {
        return {
          date: e.start,
          tagLabel: "Evento",
          tagClass: "tag-event",
          title: e.title,
          active: e.active,
          _raw: e
        };
      });

      /* ---- Feed de notícias: mais recentes primeiro ---- */
      var feed = updates.concat(events)
        .filter(function (item) { return item.date; })
        .sort(function (a, b) { return new Date(b.date) - new Date(a.date); })
        .slice(0, 6);

      if (list) {
        if (!feed.length) {
          list.innerHTML = '<p class="box-rail-empty">Sem novidades registradas ainda.</p>';
        } else {
          list.innerHTML = feed
            .map(function (item) {
              return (
                '<div class="news-item">' +
                '<span class="news-date">' + fmtDateFull(item.date) + "</span>" +
                '<span class="news-tag ' + item.tagClass + '">' + item.tagLabel + "</span>" +
                '<span class="news-title">' + escapeHtml(item.title) + "</span>" +
                "</div>"
              );
            })
            .join("");
        }
      }

      /* ---- Carrossel: eventos ativos agora, com banner ---- */
      var carouselSlides = (eventsData.activeEvents || [])
        .filter(function (e) { return e.active !== false && e.banner && inWindow(e, now); })
        .slice(0, 5)
        .map(function (e) { return { title: e.title, banner: e.banner }; });

      initCarousel(carouselSlides);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initNavMobile();
    loadBoxes();
    loadPlayers();
    loadNewsAndCarousel();
  });
})();
