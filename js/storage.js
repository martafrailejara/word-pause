/* storage.js — modelo de datos en localStorage para Vocabulario en Pausa */
window.VP = window.VP || {};

(function (VP) {
  "use strict";

  var KEY = "wordPause.v1";

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function emptyState() {
    return { series: [], words: [], lastSelection: null };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return emptyState();
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return emptyState();
      data.series = Array.isArray(data.series) ? data.series : [];
      data.words = Array.isArray(data.words) ? data.words : [];
      data.lastSelection = data.lastSelection || null;
      return data;
    } catch (e) {
      return emptyState();
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      return false;
    }
  }

  // ---------- series ----------

  function addSeries(series) {
    var data = load();
    var entry = {
      id: series.id || uid(),
      tvmazeId: series.tvmazeId || null,
      name: series.name,
      poster: series.poster || null,
      summary: series.summary || null,
      manual: !!series.manual,
      episodes: Array.isArray(series.episodes) ? series.episodes : [],
      addedAt: Date.now()
    };
    data.series.unshift(entry);
    save(data);
    return entry;
  }

  function getSeries(id) {
    var data = load();
    for (var i = 0; i < data.series.length; i++) {
      if (data.series[i].id === id) return data.series[i];
    }
    return null;
  }

  function listSeries() {
    return load().series;
  }

  function deleteSeries(id) {
    var data = load();
    data.series = data.series.filter(function (s) { return s.id !== id; });
    data.words = data.words.filter(function (w) { return w.seriesId !== id; });
    save(data);
  }

  function updateSeriesEpisodes(id, episodes) {
    var data = load();
    var s = null;
    for (var i = 0; i < data.series.length; i++) {
      if (data.series[i].id === id) { s = data.series[i]; break; }
    }
    if (s) {
      s.episodes = episodes;
      save(data);
    }
  }

  // ---------- words ----------

  function addWords(items) {
    var data = load();
    var now = Date.now();
    items.forEach(function (it) {
      var existingIdx = -1;
      for (var i = 0; i < data.words.length; i++) {
        var w = data.words[i];
        if (
          w.word.toLowerCase() === it.word.toLowerCase() &&
          w.seriesId === it.seriesId &&
          w.season === it.season &&
          w.episode === it.episode
        ) {
          existingIdx = i;
          break;
        }
      }
      var entry = {
        id: existingIdx >= 0 ? data.words[existingIdx].id : uid(),
        word: it.word,
        translation: it.translation,
        pos: it.pos,
        example_en: it.example_en || "",
        definition_en: it.definition_en || "",
        seriesId: it.seriesId,
        seriesName: it.seriesName,
        season: it.season,
        episode: it.episode,
        episodeName: it.episodeName || "",
        addedAt: existingIdx >= 0 ? data.words[existingIdx].addedAt : now,
        timesSeen: existingIdx >= 0 ? (data.words[existingIdx].timesSeen || 1) + 1 : 1
      };
      if (existingIdx >= 0) data.words.splice(existingIdx, 1);
      data.words.unshift(entry);
    });
    save(data);
  }

  function listWords(filter) {
    var data = load();
    var words = data.words;
    if (filter) {
      if (filter.seriesId) words = words.filter(function (w) { return w.seriesId === filter.seriesId; });
      if (filter.season != null) words = words.filter(function (w) { return w.season === filter.season; });
      if (filter.episode != null) words = words.filter(function (w) { return w.episode === filter.episode; });
      if (filter.pos) words = words.filter(function (w) { return w.pos === filter.pos; });
      if (filter.query) {
        var q = filter.query.toLowerCase();
        words = words.filter(function (w) {
          return w.word.toLowerCase().indexOf(q) !== -1 || (w.translation || "").toLowerCase().indexOf(q) !== -1;
        });
      }
    }
    return words;
  }

  function deleteWord(id) {
    var data = load();
    data.words = data.words.filter(function (w) { return w.id !== id; });
    save(data);
  }

  function clearAllWords() {
    var data = load();
    data.words = [];
    save(data);
  }

  // ---------- recordar última selección ----------

  function setLastSelection(sel) {
    var data = load();
    data.lastSelection = sel;
    save(data);
  }

  function getLastSelection() {
    return load().lastSelection;
  }

  // ---------- exportar / importar ----------

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(json) {
    var parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") throw new Error("Formato no válido");
    var data = emptyState();
    data.series = Array.isArray(parsed.series) ? parsed.series : [];
    data.words = Array.isArray(parsed.words) ? parsed.words : [];
    data.lastSelection = parsed.lastSelection || null;
    save(data);
  }

  VP.storage = {
    addSeries: addSeries,
    getSeries: getSeries,
    listSeries: listSeries,
    deleteSeries: deleteSeries,
    updateSeriesEpisodes: updateSeriesEpisodes,
    addWords: addWords,
    listWords: listWords,
    deleteWord: deleteWord,
    clearAllWords: clearAllWords,
    setLastSelection: setLastSelection,
    getLastSelection: getLastSelection,
    exportJSON: exportJSON,
    importJSON: importJSON,
    uid: uid
  };
})(window.VP);
