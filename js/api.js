/* api.js — TVMaze (catálogo de series), MyMemory (traducción) y Dictionary API (categoría gramatical) */
window.VP = window.VP || {};

(function (VP) {
  "use strict";

  var TVMAZE = "https://api.tvmaze.com";
  var MYMEMORY = "https://api.mymemory.translated.net/get";
  var DICTIONARY = "https://api.dictionaryapi.dev/api/v2/entries/en/";

  var CACHE_KEY = "wordPause.cache.v1";

  // Las APIs gratuitas a veces se quedan colgadas sin responder: si una
  // petición tarda demasiado la cortamos, para no bloquear toda la tanda.
  function fetchWithTimeout(url, options, ms) {
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, ms || 9000);
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

  // ---------- expresiones/modismos: diccionario propio (offline, curado a mano) ----------
  //
  // MyMemory traduce muchas expresiones hechas de forma literal o directamente
  // no las traduce ("break a leg" se queda igual). Para las mas habituales en
  // dialogos de series usamos una traduccion curada a mano en vez de fiarnos
  // de la traduccion automatica.

  var IDIOMS_URL = "data/idioms.json";
  var idiomsPromise = null;

  function loadIdioms() {
    if (!idiomsPromise) {
      idiomsPromise = fetchWithTimeout(IDIOMS_URL, undefined, 15000)
        .then(function (res) {
          if (!res.ok) throw new Error("idioms_failed");
          return res.json();
        })
        .catch(function () {
          return {}; // sin diccionario de expresiones disponible: se sigue traduciendo con MyMemory
        });
    }
    return idiomsPromise;
  }

  function matchIdiom(word) {
    var trimmed = word.trim().toLowerCase();
    if (!/\s/.test(trimmed)) return Promise.resolve(null); // solo aplica a expresiones de varias palabras
    return loadIdioms().then(function (dict) {
      return dict[trimmed] || null;
    });
  }

  function translate(word) {
    return matchIdiom(word).then(function (curated) {
      if (curated) return curated;

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
          // a veces MyMemory deja una coma suelta al final ("inevitablemente,")
          return text.trim().replace(/\s*,\s*$/, "");
        });
    });
  }

  // ---------- categoría gramatical: diccionario local (offline, sin red) ----------
  //
  // La API pública de diccionario (dictionaryapi.dev) resultó demasiado lenta
  // e inestable en la práctica (peticiones de 15-20s o que no llegan nunca),
  // así que la categoría gramatical de cada palabra sale de un diccionario
  // propio incluido en la app (data/pos-lexicon.json, ~52.000 palabras
  // inglesas comunes con su categoría, generado a partir de WordNet). Es
  // instantáneo y no depende de que ese servicio esté disponible.

  var POS_LEXICON_URL = "data/pos-lexicon.json";
  var CODE_TO_ES = { n: "Sustantivo", v: "Verbo", a: "Adjetivo", r: "Adverbio" };
  var lexiconPromise = null;

  function loadLexicon() {
    if (!lexiconPromise) {
      lexiconPromise = fetchWithTimeout(POS_LEXICON_URL, undefined, 15000)
        .then(function (res) {
          if (!res.ok) throw new Error("lexicon_failed");
          return res.json();
        })
        .catch(function () {
          return {}; // sin diccionario local disponible: todo caerá en "Otra"
        });
    }
    return lexiconPromise;
  }

  function lookupPos(word) {
    var trimmed = word.trim();
    if (/\s/.test(trimmed)) {
      // las expresiones de varias palabras (phrasal verbs, modismos) no
      // están en un diccionario de palabra suelta
      return Promise.resolve("Expresión");
    }
    return loadLexicon().then(function (lex) {
      var code = lex[trimmed.toLowerCase()];
      return CODE_TO_ES[code] || "Otra";
    });
  }

  // ---------- Dictionary API: ejemplo en inglés (opcional, mejor esfuerzo) ----------
  //
  // Esto SÍ sigue llamando a dictionaryapi.dev, pero solo para adornar la
  // ficha con una frase de ejemplo — nunca decide la categoría gramatical
  // ni bloquea el guardado de la palabra. Si tarda más de 3.5s o falla,
  // simplemente se guarda sin ejemplo.

  function fetchExample(word) {
    if (/\s/.test(word.trim())) return Promise.resolve({ definition_en: "", example_en: "" });
    var url = DICTIONARY + encodeURIComponent(word.trim().toLowerCase());
    return fetchWithTimeout(url, undefined, 3500)
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) return { definition_en: "", example_en: "" };
        var meanings = data[0].meanings || [];
        for (var i = 0; i < meanings.length; i++) {
          var def = (meanings[i].definitions && meanings[i].definitions[0]) || {};
          if (def.example || def.definition) {
            return { definition_en: def.definition || "", example_en: def.example || "" };
          }
        }
        return { definition_en: "", example_en: "" };
      })
      .catch(function () {
        return { definition_en: "", example_en: "" };
      });
  }

  // ---------- combinar todo, con caché por palabra ----------

  function resolveWord(word) {
    var cache = loadCache();
    var key = word.trim().toLowerCase();
    if (cache[key]) return Promise.resolve(cache[key]);

    return Promise.all([translate(word), lookupPos(word), fetchExample(word)]).then(function (res) {
      var result = {
        word: word.trim(),
        translation: res[0],
        pos: res[1],
        definition_en: res[2].definition_en,
        example_en: res[2].example_en
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
    POS_ORDER: [
      "Verbo", "Sustantivo", "Adjetivo", "Adverbio", "Expresión", "Otra"
    ]
  };
})(window.VP);
