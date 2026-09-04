/* app.js — interfaz de Vocabulario en Pausa */
(function () {
  "use strict";

  var storage = window.VP.storage;
  var api = window.VP.api;

  var root = document.getElementById("app");

  var state = {
    view: "catalog", // "catalog" | "series" | "vocab"
    seriesId: null,
    season: null,
    episode: null,
    episodeName: null,
    searchOpen: false,
    searchMode: "tv", // "tv" | "movie" — qué buscamos en la hoja de búsqueda
    searchQuery: "",
    searchResults: [],
    searchLoading: false,
    searchError: null,
    manualFormOpen: false,
    loadingEpisodesFor: {},
    confirmDeleteSeries: null,
    catalogFilter: "all", // "all" | "tv" | "movie"
    wordInputDraft: "",
    translating: false,
    translateProgress: null,
    translateError: null,
    lastSaveCount: 0,
    vocabFilter: { seriesId: "", pos: "", query: "", learned: "" },
    confirmClearVocab: false,
    editingWordId: null,
    reviewQueue: [],
    reviewIndex: 0,
    reviewRevealed: false
  };

  // ---------- utilidades ----------

  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // iconos de linea a medida (SVG, heredan color con currentColor) en vez de emoji del sistema
  var ICONS = {
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M10 8.3v7.4l6-3.7z" fill="currentColor" stroke="none"/></svg>',
    bookmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.8-4.8"/></svg>',
    tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="13" rx="2.5"/><path d="M8 21h8M12 18v3"/></svg>',
    clapper: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 15h18M8 4v5M8 15v5M16 4v5M16 15v5"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"/><path d="M16.3 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="14" height="16" rx="2" transform="rotate(6 14 11)"/><rect x="3" y="5" width="14" height="16" rx="2"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
  };

  // lee una palabra en inglés en voz alta con la Web Speech API del navegador (gratis, sin API externa)
  function speak(text) {
    if (!text || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      var utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 0.95;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  function parseWords(raw) {
    var seen = {};
    var out = [];
    raw.split(/[\n,]+/).forEach(function (w) {
      var t = w.trim();
      if (!t) return;
      var key = t.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  function formatRelative(ts) {
    var days = Math.floor((Date.now() - ts) / 86400000);
    if (days <= 0) return "hoy";
    if (days === 1) return "ayer";
    if (days < 7) return "hace " + days + " días";
    if (days < 30) { var w = Math.floor(days / 7); return "hace " + w + (w > 1 ? " semanas" : " semana"); }
    var m = Math.floor(days / 30);
    return "hace " + m + (m > 1 ? " meses" : " mes");
  }

  function withFocusPreserved(fn) {
    var active = document.activeElement;
    var id = active && active.id;
    var isField = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
    var selStart = isField ? active.selectionStart : null;
    var selEnd = isField ? active.selectionEnd : null;
    fn();
    if (id) {
      var el = document.getElementById(id);
      if (el) {
        el.focus();
        if (selStart != null && el.setSelectionRange) {
          try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
        }
      }
    }
  }

  function seasonsOf(series) {
    var set = {};
    (series.episodes || []).forEach(function (ep) { set[ep.season] = true; });
    return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
  }

  function episodesOfSeason(series, season) {
    return (series.episodes || [])
      .filter(function (ep) { return ep.season === season; })
      .sort(function (a, b) { return a.number - b.number; });
  }

  // ---------- render ----------

  function render() {
    var html = "";
    if (state.view === "series" && state.seriesId) html = renderSeriesView();
    else if (state.view === "vocab") html = renderVocabView();
    else if (state.view === "review") html = renderReviewView();
    else html = renderCatalogView();
    root.innerHTML = html + renderBottomNav();
  }

  function renderBottomNav() {
    var onCatalog = state.view === "catalog" || state.view === "series";
    return (
      '<nav class="bottom-nav">' +
        '<button class="nav-btn' + (onCatalog ? " active" : "") + '" data-action="nav" data-view="catalog" type="button">' +
          '<span class="nav-ic">' + ICONS.play + '</span><span>Catálogo</span>' +
        "</button>" +
        '<button class="nav-btn' + (state.view === "vocab" ? " active" : "") + '" data-action="nav" data-view="vocab" type="button">' +
          '<span class="nav-ic">' + ICONS.bookmark + '</span><span>Mi vocabulario</span>' +
        "</button>" +
        '<button class="nav-btn' + (state.view === "review" ? " active" : "") + '" data-action="nav" data-view="review" type="button">' +
          '<span class="nav-ic">' + ICONS.cards + '</span><span>Repasar</span>' +
        "</button>" +
      "</nav>"
    );
  }

  // ---------- vista: catálogo ----------

  function renderCatalogView() {
    var filter = state.catalogFilter || "all";
    var series = storage.listSeries();
    if (filter !== "all") {
      series = series.filter(function (s) { return (s.type || "tv") === filter; });
    }
    var emptyMsg = filter === "movie"
      ? "Aún no has añadido ninguna película. Búscala arriba para empezar."
      : filter === "tv"
        ? "Aún no has añadido ninguna serie. Búscala arriba para empezar."
        : "Aún no has añadido nada. Búscalo arriba para empezar tu catálogo.";
    var cards = series.length
      ? series.map(renderSeriesCard).join("")
      : '<p class="empty-note">' + emptyMsg + "</p>";

    return (
      '<header class="topbar">' +
        '<p class="eyebrow">Tu catálogo</p>' +
        "<h1>Lo que sigues</h1>" +
      "</header>" +
      '<button class="search-trigger" data-action="open-search" type="button"><span class="search-trigger-ic">' + ICONS.search + '</span>Buscar una serie o película para añadir…</button>' +
      renderContinueCard() +
      renderCatalogFilters() +
      '<div class="card-grid">' + cards + "</div>" +
      (state.searchOpen ? renderSearchSheet() : "")
    );
  }

  function renderContinueCard() {
    var id = storage.getLastOpenedSeries();
    if (!id) return "";
    var s = storage.getSeries(id);
    if (!s) return "";
    var type = s.type || "tv";
    var typeIcon = type === "movie" ? ICONS.clapper : ICONS.tv;
    var poster = s.poster
      ? '<img src="' + escapeHtml(s.poster) + '" alt="" loading="lazy">'
      : '<div class="poster-fallback small">' + typeIcon + '</div>';
    return (
      '<button class="continue-card" data-action="open-series" data-id="' + escapeHtml(s.id) + '" type="button">' +
        '<div class="poster small">' + poster + "</div>" +
        '<div class="continue-info">' +
          '<p class="continue-label">Seguir viendo</p>' +
          '<p class="continue-name">' + escapeHtml(s.name) + "</p>" +
        "</div>" +
        '<span class="continue-arrow">' + ICONS.chevron + "</span>" +
      "</button>"
    );
  }

  function renderCatalogFilters() {
    var f = state.catalogFilter || "all";
    return (
      '<div class="search-mode-row">' +
        '<button class="chip' + (f === "all" ? " active" : "") + '" data-action="set-catalog-filter" data-filter="all" type="button">Todas</button>' +
        '<button class="chip' + (f === "tv" ? " active" : "") + '" data-action="set-catalog-filter" data-filter="tv" type="button">Series</button>' +
        '<button class="chip' + (f === "movie" ? " active" : "") + '" data-action="set-catalog-filter" data-filter="movie" type="button">Películas</button>' +
      "</div>"
    );
  }

  function renderSeriesCard(s) {
    var type = s.type || "tv";
    var typeIcon = type === "movie" ? ICONS.clapper : ICONS.tv;
    var poster = s.poster
      ? '<img src="' + escapeHtml(s.poster) + '" alt="" loading="lazy">'
      : '<div class="poster-fallback">' + typeIcon + '</div>';
    var confirming = state.confirmDeleteSeries === s.id;
    return (
      '<div class="series-card">' +
        '<button class="series-card-open" data-action="open-series" data-id="' + escapeHtml(s.id) + '" type="button">' +
          '<div class="poster">' + poster + "</div>" +
          '<p class="series-card-name">' + escapeHtml(s.name) + "</p>" +
        "</button>" +
        '<span class="type-badge" title="' + (type === "movie" ? "Película" : "Serie") + '">' + typeIcon + "</span>" +
        '<button class="series-card-del' + (confirming ? " confirming" : "") + '" data-action="delete-series" data-id="' + escapeHtml(s.id) + '" type="button" aria-label="Eliminar ' + escapeHtml(s.name) + '">' +
          (confirming ? "¿Seguro?" : "×") +
        "</button>" +
      "</div>"
    );
  }

  function renderSearchSheet() {
    var mode = state.searchMode || "tv";
    var isMovie = mode === "movie";
    var modeToggle =
      '<div class="search-mode-row">' +
        '<button class="chip' + (!isMovie ? " active" : "") + '" data-action="set-search-mode" data-mode="tv" type="button">Serie</button>' +
        '<button class="chip' + (isMovie ? " active" : "") + '" data-action="set-search-mode" data-mode="movie" type="button">Película</button>' +
      "</div>";

    var body = "";
    if (state.manualFormOpen) {
      body =
        '<form data-action="submit-manual-series" class="manual-form">' +
          '<label class="field-label" for="manualName">' + (isMovie ? "Nombre de la película" : "Nombre de la serie") + "</label>" +
          '<input id="manualName" type="text" placeholder="' + (isMovie ? "Ej. Whiplash" : "Ej. Peaky Blinders") + '" autocomplete="off" required>' +
          '<button class="btn primary" type="submit">Añadir sin portada</button>' +
          '<button class="btn ghost" data-action="close-manual-form" type="button">Volver a buscar</button>' +
        "</form>";
    } else {
      var resultsHtml = "";
      if (state.searchLoading) {
        resultsHtml = '<p class="empty-note">Buscando…</p>';
      } else if (state.searchError) {
        resultsHtml = '<p class="empty-note">' + escapeHtml(state.searchError) + "</p>";
      } else if (state.searchQuery.trim() && !state.searchResults.length) {
        resultsHtml = '<p class="empty-note">Sin resultados para “' + escapeHtml(state.searchQuery) + '”.</p>';
      } else {
        var existingIds = {};
        storage.listSeries().forEach(function (s) {
          if (s.tvmazeId) existingIds["tv:" + s.tvmazeId] = s.id;
          if (s.imdbId) existingIds["movie:" + s.imdbId] = s.id;
        });
        var typeIcon = isMovie ? ICONS.clapper : ICONS.tv;
        resultsHtml = state.searchResults.map(function (r, i) {
          var already = existingIds[mode + ":" + (isMovie ? r.imdbId : r.tvmazeId)];
          var poster = r.poster ? '<img src="' + escapeHtml(r.poster) + '" alt="" loading="lazy">' : '<div class="poster-fallback small">' + typeIcon + '</div>';
          return (
            '<div class="search-result">' +
              '<div class="poster small">' + poster + "</div>" +
              '<div class="search-result-info">' +
                '<p class="sr-name">' + escapeHtml(r.name) + (r.premiered ? ' <span class="sr-year">(' + escapeHtml(r.premiered) + ")</span>" : "") + "</p>" +
                (r.summary ? '<p class="sr-summary">' + escapeHtml(r.summary.slice(0, 110)) + (r.summary.length > 110 ? "…" : "") + "</p>" : "") +
              "</div>" +
              (already
                ? '<button class="btn subtle" data-action="open-series" data-id="' + escapeHtml(already) + '" type="button">Ya en tu catálogo</button>'
                : '<button class="btn primary small" data-action="add-series" data-index="' + i + '" type="button">Añadir</button>') +
            "</div>"
          );
        }).join("");
      }

      body =
        '<input id="seriesSearchInput" class="search-input" type="search" placeholder="' + (isMovie ? "Ej. Oppenheimer" : "Ej. Breaking Bad") + '" value="' + escapeHtml(state.searchQuery) + '" autocomplete="off" autofocus>' +
        '<div class="search-results">' + resultsHtml + "</div>" +
        '<button class="btn ghost full" data-action="open-manual-form" type="button">' + (isMovie ? "¿No aparece? Añadirla a mano" : "¿No aparece? Añadirla a mano") + "</button>";
    }

    return (
      '<div class="sheet-backdrop" data-action="close-search"></div>' +
      '<div class="sheet" role="dialog" aria-label="Buscar">' +
        '<div class="sheet-handle"></div>' +
        '<button class="sheet-close" data-action="close-search" type="button" aria-label="Cerrar">×</button>' +
        modeToggle +
        body +
      "</div>"
    );
  }

  // ---------- vista: detalle de serie ----------

  function renderSeriesView() {
    var series = storage.getSeries(state.seriesId);
    if (!series) {
      state.view = "catalog";
      return renderCatalogView();
    }

    var isMovie = (series.type || "tv") === "movie";
    var poster = series.poster
      ? '<img src="' + escapeHtml(series.poster) + '" alt="">'
      : '<div class="poster-fallback">' + (isMovie ? ICONS.clapper : ICONS.tv) + '</div>';

    var body;
    if (isMovie) {
      body = "";
    } else if (series.manual) {
      body = renderManualSeasonPicker(series);
    } else if (state.loadingEpisodesFor[series.id]) {
      body = '<p class="empty-note">Cargando temporadas y capítulos…</p>';
    } else {
      body = renderSeasonPicker(series);
    }

    var chapterSection = (isMovie || (state.season != null && state.episode != null))
      ? renderChapterPanel(series)
      : "";

    var tagLine = isMovie
      ? '<p class="tag">Película' + (series.manual ? " · añadida a mano" : "") + "</p>"
      : (series.manual ? '<p class="tag">Añadida a mano</p>' : "");

    return (
      '<header class="topbar with-back">' +
        '<button class="back-btn" data-action="back-to-catalog" type="button" aria-label="Volver">←</button>' +
        '<div class="series-head">' +
          '<div class="poster medium">' + poster + "</div>" +
          "<div>" +
            "<h1>" + escapeHtml(series.name) + "</h1>" +
            tagLine +
          "</div>" +
        "</div>" +
      "</header>" +
      body +
      chapterSection
    );
  }

  function renderSeasonPicker(series) {
    var seasons = seasonsOf(series);
    if (!seasons.length) return '<p class="empty-note">No se encontraron capítulos para esta serie.</p>';
    var chips = seasons.map(function (s) {
      return '<button class="chip' + (state.season === s ? " active" : "") + '" data-action="select-season" data-season="' + s + '" type="button">T' + s + "</button>";
    }).join("");

    var episodesHtml = "";
    if (state.season != null) {
      var eps = episodesOfSeason(series, state.season);
      episodesHtml = '<div class="episode-list">' + eps.map(function (ep) {
        var active = state.episode === ep.number;
        return (
          '<button class="episode-item' + (active ? " active" : "") + '" data-action="select-episode" data-season="' + ep.season + '" data-number="' + ep.number + '" type="button">' +
            '<span class="ep-num">E' + ep.number + "</span>" +
            '<span class="ep-name">' + escapeHtml(ep.name) + "</span>" +
          "</button>"
        );
      }).join("") + "</div>";
    }

    return (
      '<section class="picker">' +
        '<p class="field-label">Temporada</p>' +
        '<div class="chip-row">' + chips + "</div>" +
        episodesHtml +
      "</section>"
    );
  }

  function renderManualSeasonPicker() {
    return (
      '<section class="picker">' +
        '<p class="field-label">Temporada y capítulo</p>' +
        '<div class="manual-picker">' +
          '<input id="manualSeason" type="number" min="1" inputmode="numeric" placeholder="Temp." value="' + (state.season || "") + '">' +
          '<input id="manualEpisode" type="number" min="1" inputmode="numeric" placeholder="Cap." value="' + (state.episode || "") + '">' +
          '<button class="btn primary" data-action="set-manual-episode" type="button">Ir</button>' +
        "</div>" +
      "</section>"
    );
  }

  function renderChapterPanel(series) {
    var isMovie = (series.type || "tv") === "movie";
    var words = storage.listWords({ seriesId: series.id, season: state.season, episode: state.episode });
    var grouped = {};
    words.forEach(function (w) {
      var pos = w.pos || "Otra";
      (grouped[pos] = grouped[pos] || []).push(w);
    });

    var groupsHtml = api.POS_ORDER.filter(function (pos) { return grouped[pos]; }).map(function (pos) {
      return (
        '<div class="pos-group">' +
          '<p class="pos-title">' + escapeHtml(pos) + ' <span class="pos-count">' + grouped[pos].length + "</span></p>" +
          '<ul class="word-list">' +
            grouped[pos].map(function (w) {
              return (
                '<li class="word-item">' +
                  '<div>' +
                    '<span class="w-en">' + escapeHtml(w.word) + "</span>" +
                    '<span class="w-es">' + escapeHtml(w.translation) + "</span>" +
                    (w.example_en ? '<span class="w-ex">“' + escapeHtml(w.example_en) + '”</span>' : "") +
                  "</div>" +
                  '<div class="word-actions">' +
                    '<button class="speak-btn" data-action="speak-word" data-word="' + escapeHtml(w.word) + '" type="button" aria-label="Escuchar">' + ICONS.speaker + "</button>" +
                    '<button class="del" data-action="delete-word" data-id="' + escapeHtml(w.id) + '" type="button" aria-label="Eliminar">×</button>' +
                  "</div>" +
                "</li>"
              );
            }).join("") +
          "</ul>" +
        "</div>"
      );
    }).join("");

    var progress = state.translating && state.translateProgress
      ? "Traduciendo " + state.translateProgress.done + "/" + state.translateProgress.total + "…"
      : "";

    var statusLine = "";
    if (progress) statusLine = '<p class="status">' + progress + "</p>";
    else if (state.translateError) statusLine = '<p class="status error">' + escapeHtml(state.translateError) + "</p>";
    else if (state.lastSaveCount) statusLine = '<p class="status ok">Guardado — ' + state.lastSaveCount + (state.lastSaveCount === 1 ? " palabra añadida." : " palabras añadidas.") + "</p>";

    var episodeLabel = isMovie
      ? "PELÍCULA"
      : "T" + state.season + " · E" + state.episode + (state.episodeName ? " — " + escapeHtml(state.episodeName) : "");

    return (
      '<section class="chapter-panel">' +
        '<p class="chapter-label">' + episodeLabel + "</p>" +
        '<label class="field-label" for="wordInput">Palabras o expresiones que no entendiste</label>' +
        '<textarea id="wordInput" rows="3" placeholder="reckon, jaded, plummet&#10;feud" ' + (state.translating ? "disabled" : "") + ">" + escapeHtml(state.wordInputDraft) + "</textarea>" +
        '<button class="btn primary full" data-action="translate-words" type="button" ' + (state.translating ? "disabled" : "") + ">" + (state.translating ? "Traduciendo…" : "Traducir y guardar") + "</button>" +
        statusLine +
        '<div class="chapter-words">' +
          (groupsHtml || '<p class="empty-note">Aún no has añadido palabras en este capítulo.</p>') +
        "</div>" +
      "</section>"
    );
  }

  // ---------- vista: mi vocabulario ----------

  function renderVocabWordItem(w) {
    if (state.editingWordId === w.id) {
      var posOptionsEdit = api.POS_ORDER.map(function (p) {
        return '<option value="' + escapeHtml(p) + '"' + (w.pos === p ? " selected" : "") + ">" + escapeHtml(p) + "</option>";
      }).join("");
      return (
        '<li class="word-item editing">' +
          '<form class="word-edit-form" data-action="submit-edit-word" data-id="' + escapeHtml(w.id) + '">' +
            '<span class="w-en">' + escapeHtml(w.word) + "</span>" +
            '<input type="text" class="edit-translation-input" value="' + escapeHtml(w.translation) + '" required autofocus>' +
            '<select class="edit-pos-select">' + posOptionsEdit + "</select>" +
            '<div class="word-edit-actions">' +
              '<button class="btn primary small" type="submit">Guardar</button>' +
              '<button class="btn ghost small" type="button" data-action="cancel-edit-word" data-id="' + escapeHtml(w.id) + '">Cancelar</button>' +
            "</div>" +
          "</form>" +
        "</li>"
      );
    }
    return (
      '<li class="word-item' + (w.learned ? " learned" : "") + '">' +
        '<div>' +
          '<span class="w-en">' + escapeHtml(w.word) + "</span>" +
          '<span class="w-es">' + escapeHtml(w.translation) + "</span>" +
          '<span class="w-meta">' + escapeHtml(w.pos) + " · " + escapeHtml(w.seriesName) + " · " + (w.season != null && w.episode != null ? "T" + w.season + "E" + w.episode : "Película") + " · " + formatRelative(w.addedAt) + (w.learned ? " · Aprendida" : "") + "</span>" +
        "</div>" +
        '<div class="word-actions">' +
          '<button class="speak-btn" data-action="speak-word" data-word="' + escapeHtml(w.word) + '" type="button" aria-label="Escuchar">' + ICONS.speaker + "</button>" +
          '<button class="learned-btn' + (w.learned ? " active" : "") + '" data-action="toggle-learned" data-id="' + escapeHtml(w.id) + '" type="button" aria-label="' + (w.learned ? "Marcar como pendiente" : "Marcar como aprendida") + '">' + ICONS.check + "</button>" +
          '<button class="edit-btn" data-action="edit-word" data-id="' + escapeHtml(w.id) + '" type="button" aria-label="Editar traducción">' + ICONS.edit + "</button>" +
          '<button class="del" data-action="delete-word" data-id="' + escapeHtml(w.id) + '" type="button" aria-label="Eliminar">×</button>' +
        "</div>" +
      "</li>"
    );
  }

  function renderVocabView() {
    var allSeries = storage.listSeries();
    var words = storage.listWords({
      seriesId: state.vocabFilter.seriesId || null,
      pos: state.vocabFilter.pos || null,
      query: state.vocabFilter.query || null,
      learned: state.vocabFilter.learned || null
    });

    var seriesOptions = '<option value="">Todas las series</option>' + allSeries.map(function (s) {
      return '<option value="' + escapeHtml(s.id) + '"' + (state.vocabFilter.seriesId === s.id ? " selected" : "") + ">" + escapeHtml(s.name) + "</option>";
    }).join("");

    var posOptions = '<option value="">Todas las categorías</option>' + api.POS_ORDER.map(function (p) {
      return '<option value="' + escapeHtml(p) + '"' + (state.vocabFilter.pos === p ? " selected" : "") + ">" + escapeHtml(p) + "</option>";
    }).join("");

    var learnedFilter = state.vocabFilter.learned || "";
    var learnedChips =
      '<div class="search-mode-row">' +
        '<button class="chip' + (learnedFilter === "" ? " active" : "") + '" data-action="set-learned-filter" data-learned="" type="button">Todas</button>' +
        '<button class="chip' + (learnedFilter === "pending" ? " active" : "") + '" data-action="set-learned-filter" data-learned="pending" type="button">Pendientes</button>' +
        '<button class="chip' + (learnedFilter === "learned" ? " active" : "") + '" data-action="set-learned-filter" data-learned="learned" type="button">Aprendidas</button>' +
      "</div>";

    var list = words.length
      ? '<ul class="word-list roomy">' + words.map(renderVocabWordItem).join("") + "</ul>"
      : '<p class="empty-note">No hay palabras guardadas con estos filtros.</p>';

    return (
      '<header class="topbar">' +
        '<p class="eyebrow">' + storage.listWords().length + (storage.listWords().length === 1 ? ' palabra guardada' : ' palabras guardadas') + '</p>' +
        "<h1>Mi vocabulario</h1>" +
      "</header>" +
      '<div class="vocab-filters">' +
        '<input id="vocabSearch" class="search-input" type="search" placeholder="Buscar palabra o traducción…" value="' + escapeHtml(state.vocabFilter.query) + '">' +
        '<div class="filter-row">' +
          '<select id="vocabSeriesFilter">' + seriesOptions + "</select>" +
          '<select id="vocabPosFilter">' + posOptions + "</select>" +
        "</div>" +
        learnedChips +
      "</div>" +
      list +
      '<div class="vocab-actions">' +
        '<button class="btn subtle" data-action="export-vocab" type="button">Exportar copia (JSON)</button>' +
        '<label class="btn subtle" for="importFile">Importar copia</label>' +
        '<input id="importFile" type="file" accept="application/json" hidden>' +
        '<button class="btn subtle' + (state.confirmClearVocab ? " danger" : "") + '" data-action="clear-vocab" type="button">' + (state.confirmClearVocab ? "¿Seguro? Toca de nuevo" : "Vaciar vocabulario") + "</button>" +
      "</div>"
    );
  }

  // ---------- vista: repaso (flashcards) ----------

  function buildReviewQueue() {
    var words = storage.listWords({ learned: "pending" });
    var arr = words.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function renderReviewView() {
    var queue = state.reviewQueue;
    var total = queue.length;

    if (!total) {
      return (
        '<header class="topbar"><p class="eyebrow">Repaso</p><h1>Modo repaso</h1></header>' +
        '<p class="empty-note">No te quedan palabras pendientes por repasar. En cuanto guardes palabras nuevas (o marques alguna como no aprendida), aparecerán aquí.</p>'
      );
    }

    if (state.reviewIndex >= total) {
      return (
        '<header class="topbar"><p class="eyebrow">Repaso</p><h1>Modo repaso</h1></header>' +
        '<div class="review-done">' +
          '<p class="review-done-title">¡Repaso completado!</p>' +
          '<p class="empty-note">Has repasado ' + total + (total === 1 ? " palabra." : " palabras.") + "</p>" +
          '<button class="btn primary full" data-action="restart-review" type="button">Repasar de nuevo</button>' +
        "</div>"
      );
    }

    var w = queue[state.reviewIndex];
    var revealed = state.reviewRevealed;

    return (
      '<header class="topbar"><p class="eyebrow">Repaso · ' + (state.reviewIndex + 1) + "/" + total + '</p><h1>Modo repaso</h1></header>' +
      '<section class="review-card' + (revealed ? " revealed" : "") + '"' + (!revealed ? ' data-action="reveal-word" role="button" tabindex="0"' : "") + ">" +
        '<div class="review-word-row">' +
          '<span class="review-word">' + escapeHtml(w.word) + "</span>" +
          '<button class="speak-btn" data-action="speak-word" data-word="' + escapeHtml(w.word) + '" type="button" aria-label="Escuchar">' + ICONS.speaker + "</button>" +
        "</div>" +
        (revealed
          ? ('<p class="review-translation">' + escapeHtml(w.translation) + "</p>" +
             (w.example_en ? '<p class="w-ex">“' + escapeHtml(w.example_en) + '”</p>' : "") +
             '<p class="w-meta">' + escapeHtml(w.pos) + " · " + escapeHtml(w.seriesName) + "</p>")
          : '<p class="review-hint">Toca la tarjeta para ver la traducción</p>') +
      "</section>" +
      (revealed
        ? ('<div class="review-actions">' +
            '<button class="btn ghost full" data-action="review-mark" data-mark="pending" type="button">Repasar más</button>' +
            '<button class="btn primary full" data-action="review-mark" data-mark="learned" type="button">Ya la sé</button>' +
          "</div>")
        : "")
    );
  }

  // ---------- acciones ----------

  function doOpenSeries(id) {
    var series = storage.getSeries(id);
    storage.setLastOpenedSeries(id);
    state.view = "series";
    state.seriesId = id;
    state.season = null;
    state.episode = null;
    state.episodeName = null;
    state.wordInputDraft = "";
    state.translateError = null;
    state.lastSaveCount = 0;
    var last = storage.getLastSelection();
    if (last && last.seriesId === id) {
      state.season = last.season;
      state.episode = last.episode;
      state.episodeName = last.episodeName;
    }
    if (series && (series.type || "tv") !== "movie" && !series.manual && !series.episodes.length && !state.loadingEpisodesFor[id]) {
      loadEpisodesFor(series);
    }
  }

  function loadEpisodesFor(series) {
    state.loadingEpisodesFor[series.id] = true;
    api.fetchEpisodes(series.tvmazeId).then(function (episodes) {
      storage.updateSeriesEpisodes(series.id, episodes);
    }).catch(function () {
      // se deja sin capítulos; el usuario puede reintentar reabriendo la serie
    }).finally(function () {
      delete state.loadingEpisodesFor[series.id];
      render();
    });
  }

  function doSearch(query) {
    state.searchQuery = query;
    if (!query.trim()) {
      state.searchResults = [];
      state.searchError = null;
      state.searchLoading = false;
      withFocusPreserved(render);
      return;
    }
    state.searchLoading = true;
    state.searchError = null;
    withFocusPreserved(render);
    var mode = state.searchMode || "tv";
    var searchFn = mode === "movie" ? api.searchMovies : api.searchSeries;
    searchFn(query).then(function (results) {
      if (state.searchQuery !== query) return; // respuesta obsoleta
      results.forEach(function (r) { r.type = mode; });
      state.searchResults = results.slice(0, 12);
      state.searchLoading = false;
      withFocusPreserved(render);
    }).catch(function () {
      if (state.searchQuery !== query) return;
      state.searchError = "No se pudo buscar ahora mismo — comprueba tu conexión e inténtalo de nuevo.";
      state.searchLoading = false;
      withFocusPreserved(render);
    });
  }
  var debouncedSearch = debounce(doSearch, 350);

  function doAddSeries(result) {
    var entry = storage.addSeries({
      type: result.type || "tv",
      tvmazeId: result.tvmazeId || null,
      imdbId: result.imdbId || null,
      name: result.name,
      poster: result.poster,
      summary: result.summary,
      manual: false
    });
    state.searchOpen = false;
    doOpenSeries(entry.id);
    render();
  }

  function doAddManualSeries(name) {
    var entry = storage.addSeries({ name: name, manual: true, type: state.searchMode || "tv" });
    state.searchOpen = false;
    state.manualFormOpen = false;
    doOpenSeries(entry.id);
    render();
  }

  function doTranslate() {
    if (state.translating) return;
    var words = parseWords(state.wordInputDraft);
    if (!words.length) return;
    var overflow = words.length - 25;
    if (overflow > 0) words = words.slice(0, 25);

    state.translating = true;
    state.translateProgress = { done: 0, total: words.length };
    state.translateError = null;
    state.lastSaveCount = 0;
    render();

    var series = storage.getSeries(state.seriesId);
    var seriesId = state.seriesId, season = state.season, episode = state.episode, episodeName = state.episodeName;
    var results = new Array(words.length);
    var failed = [];
    var completed = 0;
    var nextIndex = 0;
    var CONCURRENCY = 8; // varias palabras a la vez — mucho más rápido que una por una

    function worker() {
      if (nextIndex >= words.length) return Promise.resolve();
      var idx = nextIndex++;
      return api.resolveWord(words[idx]).then(function (res) {
        results[idx] = {
          word: res.word,
          translation: res.translation,
          pos: res.pos,
          example_en: res.example_en,
          definition_en: res.definition_en,
          seriesId: seriesId,
          seriesName: series ? series.name : "",
          season: season,
          episode: episode,
          episodeName: episodeName || ""
        };
      }).catch(function () {
        failed.push(words[idx]);
      }).then(function () {
        completed++;
        state.translateProgress = { done: completed, total: words.length };
        render();
        return worker();
      });
    }

    var pool = [];
    for (var w = 0; w < Math.min(CONCURRENCY, words.length); w++) pool.push(worker());

    Promise.all(pool).then(function () {
      var resolved = results.filter(function (r) { return !!r; });
      state.translating = false;
      state.translateProgress = null;
      if (resolved.length) {
        storage.addWords(resolved);
        state.wordInputDraft = "";
        storage.setLastSelection({ seriesId: seriesId, season: season, episode: episode, episodeName: episodeName });
      }
      state.translateError = failed.length
        ? "No se pudieron traducir: " + failed.join(", ") + "."
        : null;
      state.lastSaveCount = resolved.length;
      render();
    });
  }

  function doExportVocab() {
    var json = storage.exportJSON();
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "vocabulario-en-pausa-" + date + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function doImportVocab(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        storage.importJSON(String(reader.result));
        render();
      } catch (e) {
        alert("Ese archivo no tiene un formato válido.");
      }
    };
    reader.readAsText(file);
  }

  // ---------- eventos ----------

  root.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el) return;
    var action = el.getAttribute("data-action");

    switch (action) {
      case "nav":
        var targetView = el.getAttribute("data-view");
        state.view = targetView;
        state.searchOpen = false;
        if (targetView === "review") {
          state.reviewQueue = buildReviewQueue();
          state.reviewIndex = 0;
          state.reviewRevealed = false;
        }
        render();
        break;
      case "open-series":
        doOpenSeries(el.getAttribute("data-id"));
        render();
        break;
      case "back-to-catalog":
        state.view = "catalog";
        render();
        break;
      case "open-search":
        state.searchOpen = true;
        state.searchQuery = "";
        state.searchResults = [];
        state.searchError = null;
        state.manualFormOpen = false;
        render();
        break;
      case "close-search":
        state.searchOpen = false;
        state.manualFormOpen = false;
        render();
        break;
      case "open-manual-form":
        state.manualFormOpen = true;
        render();
        break;
      case "close-manual-form":
        state.manualFormOpen = false;
        render();
        break;
      case "set-search-mode":
        var newMode = el.getAttribute("data-mode");
        if (newMode !== state.searchMode) {
          state.searchMode = newMode;
          state.searchResults = [];
          state.searchError = null;
          state.manualFormOpen = false;
          if (state.searchQuery.trim()) doSearch(state.searchQuery);
          else render();
        }
        break;
      case "set-catalog-filter":
        state.catalogFilter = el.getAttribute("data-filter");
        render();
        break;
      case "add-series":
        var idx = Number(el.getAttribute("data-index"));
        var result = state.searchResults[idx];
        if (result) doAddSeries(result);
        break;
      case "delete-series":
        var sid = el.getAttribute("data-id");
        if (state.confirmDeleteSeries === sid) {
          storage.deleteSeries(sid);
          state.confirmDeleteSeries = null;
          render();
        } else {
          state.confirmDeleteSeries = sid;
          render();
          setTimeout(function () {
            if (state.confirmDeleteSeries === sid) { state.confirmDeleteSeries = null; render(); }
          }, 4000);
        }
        break;
      case "select-season":
        state.season = Number(el.getAttribute("data-season"));
        state.episode = null;
        state.episodeName = null;
        state.lastSaveCount = 0;
        state.translateError = null;
        render();
        break;
      case "select-episode":
        var series = storage.getSeries(state.seriesId);
        var season = Number(el.getAttribute("data-season"));
        var number = Number(el.getAttribute("data-number"));
        var ep = episodesOfSeason(series, season).filter(function (e) { return e.number === number; })[0];
        state.season = season;
        state.episode = number;
        state.episodeName = ep ? ep.name : "";
        state.wordInputDraft = "";
        state.lastSaveCount = 0;
        state.translateError = null;
        storage.setLastSelection({ seriesId: state.seriesId, season: season, episode: number, episodeName: state.episodeName });
        render();
        break;
      case "set-manual-episode":
        var sInput = document.getElementById("manualSeason");
        var eInput = document.getElementById("manualEpisode");
        var sVal = Number(sInput && sInput.value);
        var eVal = Number(eInput && eInput.value);
        if (sVal > 0 && eVal > 0) {
          state.season = sVal;
          state.episode = eVal;
          state.episodeName = "";
          state.wordInputDraft = "";
          state.lastSaveCount = 0;
          state.translateError = null;
          storage.setLastSelection({ seriesId: state.seriesId, season: sVal, episode: eVal, episodeName: "" });
          render();
        }
        break;
      case "translate-words":
        doTranslate();
        break;
      case "delete-word":
        storage.deleteWord(el.getAttribute("data-id"));
        render();
        break;
      case "edit-word":
        state.editingWordId = el.getAttribute("data-id");
        render();
        break;
      case "cancel-edit-word":
        state.editingWordId = null;
        render();
        break;
      case "speak-word":
        speak(el.getAttribute("data-word"));
        break;
      case "toggle-learned":
        var learnedId = el.getAttribute("data-id");
        var currentWordEntry = storage.listWords().filter(function (w) { return w.id === learnedId; })[0];
        storage.updateWord(learnedId, { learned: !(currentWordEntry && currentWordEntry.learned) });
        render();
        break;
      case "set-learned-filter":
        state.vocabFilter.learned = el.getAttribute("data-learned") || "";
        render();
        break;
      case "reveal-word":
        state.reviewRevealed = true;
        render();
        break;
      case "review-mark":
        var mark = el.getAttribute("data-mark");
        var reviewWord = state.reviewQueue[state.reviewIndex];
        if (reviewWord && mark === "learned") {
          storage.updateWord(reviewWord.id, { learned: true });
        }
        state.reviewIndex++;
        state.reviewRevealed = false;
        render();
        break;
      case "restart-review":
        state.reviewQueue = buildReviewQueue();
        state.reviewIndex = 0;
        state.reviewRevealed = false;
        render();
        break;
      case "export-vocab":
        doExportVocab();
        break;
      case "clear-vocab":
        if (state.confirmClearVocab) {
          storage.clearAllWords();
          state.confirmClearVocab = false;
          render();
        } else {
          state.confirmClearVocab = true;
          render();
          setTimeout(function () { state.confirmClearVocab = false; render(); }, 4000);
        }
        break;
    }
  });

  root.addEventListener("submit", function (e) {
    var manualForm = e.target.closest('[data-action="submit-manual-series"]');
    if (manualForm) {
      e.preventDefault();
      var input = document.getElementById("manualName");
      var name = input && input.value.trim();
      if (name) doAddManualSeries(name);
      return;
    }
    var editForm = e.target.closest('[data-action="submit-edit-word"]');
    if (editForm) {
      e.preventDefault();
      var wid = editForm.getAttribute("data-id");
      var tInput = editForm.querySelector(".edit-translation-input");
      var pSelect = editForm.querySelector(".edit-pos-select");
      var newTranslation = tInput && tInput.value.trim();
      if (newTranslation) {
        storage.updateWord(wid, { translation: newTranslation, pos: pSelect ? pSelect.value : null });
      }
      state.editingWordId = null;
      render();
    }
  });

  root.addEventListener("input", function (e) {
    if (e.target.id === "seriesSearchInput") {
      debouncedSearch(e.target.value);
    } else if (e.target.id === "wordInput") {
      state.wordInputDraft = e.target.value;
    } else if (e.target.id === "vocabSearch") {
      state.vocabFilter.query = e.target.value;
      withFocusPreserved(render);
    }
  });

  root.addEventListener("change", function (e) {
    if (e.target.id === "vocabSeriesFilter") {
      state.vocabFilter.seriesId = e.target.value;
      render();
    } else if (e.target.id === "vocabPosFilter") {
      state.vocabFilter.pos = e.target.value;
      render();
    } else if (e.target.id === "importFile") {
      if (e.target.files && e.target.files[0]) doImportVocab(e.target.files[0]);
    }
  });

  // ---------- arranque ----------

  render();
})();
