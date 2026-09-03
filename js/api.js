/* api.js — TVMaze (catálogo de series), MyMemory (traducción) y Dictionary API (categoría gramatical) */
window.VP = window.VP || {};

(function (VP) {
  "use strict";

  var TVMAZE = "https://api.tvmaze.com";
  var MYMEMORY = "https://api.mymemory.translated.net/get";
  var DICTIONARY = "https://api.dictionaryapi.dev/api/v2/entries/en/";

  var CACHE_KEY = "wordPause.cache.v1";

  // Las APIs gratuitas a veces se quedan colgadas sin responder: si una
  // petición tarda más de 9s la cortamos, para no bloquear toda la tanda.
  function fetchWithTimeout(url, options) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, 9000);
    return fetch(url, Object.assign({}, options, { signal: ctl.signal })).finally(function () {
      clearTimeout(timer);
    });
  }

  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {}
  }

  function stripHtml(html) {
    if (!html) return "";
    var div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
  }

  // ---------- TVMaze: buscar series ----------

  function searchSeries(query) {
    var url = TVMAZE + "/search/shows?q=" + encodeURIComponent(query);
    return fetchWithTimeout(url)
      .then(function (res) {
        if (!res.ok) throw { code: "tvmaze_search_failed" };
        return res.json();
      })
      .then(function (list) {
        return list.map(function (item) {
          var show = item.show;
          return {
            tvmazeId: show.id,
            name: show.name,
            premiered: show.premiered ? show.premiered.slice(0, 4) : null,
            poster: (show.image && (show.image.medium || show.image.original)) || null,
            summary: stripHtml(show.summary)
          };
        });
      });
  }

  // ---------- TVMaze: episodios de una serie ----------

  function fetchEpisodes(tvmazeId) {
    var url = TVMAZE + "/shows/" + tvmazeId + "/episodes";
    return fetchWithTimeout(url)
      .then(function (res) {
        if (!res.ok) throw { code: "tvmaze_episodes_failed" };
        return res.json();
      })
      .then(function (list) {
        return list
          .filter(function (ep) { return ep.season != null && ep.number != null; })
          .map(function (ep) {
            return { season: ep.season, number: ep.number, name: ep.name || ("Episodio " + ep.number) };
          });
      });
  }

  // ---------- MyMemory: traducción ----------

  function translate(word) {
    var url = MYMEMORY + "?q=" + encodeURIComponent(word) + "&langpair=en|es";
    return fetchWithTimeout(url)
      .then(function (res) {
        if (!res.ok) throw { code: "translate_failed" };
        return res.json();
      })
      .then(function (data) {
        var text = data && data.responseData && data.responseData.translatedText;
        if (!text) throw { code: "translate_empty" };
        if (/MYMEMORY WARNING/i.test(text)) throw { code: "translate_limit" };
        return text;
      });
  }

  // ---------- Dictionary API: categoría gramatical + ejemplo ----------

  var POS_ES = {
    noun: "Sustantivo",
    verb: "Verbo",
    adjective: "Adjetivo",
    adverb: "Adverbio",
    pronoun: "Pronombre",
    preposition: "Preposición",
    conjunction: "Conjunción",
    interjection: "Interjección",
    exclamation: "Interjección",
    determiner: "Determinante",
    article: "Artículo",
    numeral: "Numeral"
  };

  function lookupWord(word) {
    // las expresiones de varias palabras no están en un diccionario de palabra suelta
    if (/\s/.test(word.trim())) {
      return Promise.resolve({ pos: "Expresión", definition_en: "", example_en: "" });
    }
    var url = DICTIONARY + encodeURIComponent(word.trim().toLowerCase());
    return fetchWithTimeout(url)
      .then(function (res) {
        if (!res.ok) return { pos: "Otra", definition_en: "", example_en: "" };
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) return { pos: "Otra", definition_en: "", example_en: "" };
        var meanings = data[0].meanings || [];
        for (var i = 0; i < meanings.length; i++) {
          var m = meanings[i];
          var def = (m.definitions && m.definitions[0]) || {};
          return {
            pos: POS_ES[m.partOfSpeech] || "Otra",
            definition_en: def.definition || "",
            example_en: def.example || ""
          };
        }
        return { pos: "Otra", definition_en: "", example_en: "" };
      })
      .catch(function () {
        return { pos: "Otra", definition_en: "", example_en: "" };
      });
  }

  // ---------- combinar todo, con caché por palabra ----------

  function resolveWord(word) {
    var cache = loadCache();
    var key = word.trim().toLowerCase();
    if (cache[key]) return Promise.resolve(cache[key]);

    return Promise.all([translate(word), lookupWord(word)]).then(function (res) {
      var result = {
        word: word.trim(),
        translation: res[0],
        pos: res[1].pos,
        definition_en: res[1].definition_en,
        example_en: res[1].example_en
      };
      cache[key] = result;
      saveCache(cache);
      return result;
    });
  }

  VP.api = {
    searchSeries: searchSeries,
    fetchEpisodes: fetchEpisodes,
    resolveWord: resolveWord,
    POS_ES: POS_ES,
    POS_ORDER: [
      "Verbo", "Sustantivo", "Adjetivo", "Adverbio", "Expresión",
      "Pronombre", "Preposición", "Conjunción", "Interjección",
      "Determinante", "Artículo", "Numeral", "Otra"
    ]
  };
})(window.VP);
