# WordPause 🍿

WordPause es una app web para anotar las palabras en inglés que no entiendes al ver una serie, traducirlas y guardarlas organizadas por serie, temporada y capítulo — clasificadas en verbos, sustantivos, adjetivos, expresiones, etc.

No tiene backend: es HTML/CSS/JS puro. Todo el catálogo de series y el vocabulario se guarda en el navegador (localStorage), así que vive solo en el dispositivo/navegador donde se use. Usa "Exportar copia (JSON)" en la pestaña *Mi vocabulario* de vez en cuando para tener una copia de seguridad, o para pasar los datos a otro dispositivo con "Importar copia".

## Cómo funciona por dentro

- **Buscar y añadir series** — [TVMaze](https://www.tvmaze.com/api) (gratis, sin clave). Al añadir una serie se descarga automáticamente su lista completa de temporadas y capítulos, así que no hay que escribirlos a mano. Si una serie no aparece en la búsqueda, se puede añadir manualmente (solo con el nombre, indicando temporada/capítulo a mano cuando se anoten palabras).
- **Traducir palabras** — [MyMemory](https://mymemory.translated.net/) (gratis, sin clave) para la traducción al español. Hasta 6 palabras se traducen a la vez para que una lista entera no tarde una eternidad.
- **Categoría gramatical (verbo/sustantivo/adjetivo/adverbio)** — un diccionario propio incluido en la app (`data/pos-lexicon.json`, ~52.000 palabras inglesas comunes generado a partir de WordNet). Es instantáneo y no depende de ningún servicio externo. Se probó primero con una API pública de diccionario, pero en la práctica era demasiado lenta e inestable (peticiones de 15-20s, o que directamente no llegaban) y dejaba casi todo como "Otra" — de ahí el cambio a un diccionario local. Las expresiones de varias palabras (phrasal verbs, modismos) se agrupan directamente como "Expresión".
- **Frase de ejemplo en inglés** — sigue viniendo de [Free Dictionary API](https://dictionaryapi.dev/) (gratis, sin clave), pero ahora solo como adorno: se le da un margen corto (3.5s) y, si no responde a tiempo, la palabra se guarda igual sin ejemplo — nunca bloquea ni decide la categoría.

Las traducciones ya resueltas se guardan en caché en el propio navegador para no repetir peticiones cuando se repite una palabra.

### Límites a tener en cuenta

MyMemory es gratuita y sin registro, lo cual es cómodo pero tiene un límite de caracteres traducidos al día por dispositivo/red (de sobra para uso personal normal); si un día se agota, la app avisa por palabra y se puede reintentar más tarde. El diccionario local de categorías no conoce jerga muy nueva ni nombres propios — esas palabras se guardan igual, solo que como "Otra" en vez de con su categoría exacta. La frase de ejemplo en inglés no siempre aparece, porque depende de un servicio externo que a veces tarda de más.

## Probarlo en local

No hace falta instalar nada, pero abrir `index.html` con doble clic (protocolo `file://`) puede hacer que algún navegador bloquee las peticiones a las APIs. Lo más fiable es levantar un servidor local muy simple desde esta carpeta:

```bash
cd word-pause
python3 -m http.server 8000
```

Y abrir `http://localhost:8000` en el navegador (o en el móvil, si está en la misma red, usando la IP del ordenador en vez de `localhost`).

## Publicarlo en GitHub Pages (para usarlo también desde el móvil)

El repositorio local ya está inicializado en esta carpeta, con el primer commit hecho (rama `main`). Desde tu Terminal (no desde este chat):

1. Crea un repositorio vacío en GitHub llamado **word-pause** — en <https://github.com/new>, sin marcar ninguna casilla de README/licencia/gitignore (para que no choque con lo que ya hay aquí).
2. Conéctalo y sube lo que ya tienes:

   ```bash
   cd ~/Documents/proyectos/word-pause
   git remote add origin https://github.com/martafrailejara/word-pause.git
   git push -u origin main
   ```

3. En GitHub, ve a **Settings → Pages**, y en "Build and deployment" elige la rama `main` y la carpeta `/ (root)`.
4. En un par de minutos, GitHub te da una URL tipo `https://martafrailejara.github.io/word-pause/` — esa es la que se puede abrir desde el móvil (añádela a la pantalla de inicio para que se sienta como una app).

Recuerda: el vocabulario guardado vive en el navegador de *cada* dispositivo por separado — si lo usas desde el ordenador y desde el móvil, tendrás dos vocabularios distintos, a no ser que exportes desde uno e importes en el otro.

https://martafrailejara.github.io/word-pause/

## Estructura del proyecto

```
word-pause/
├── index.html        Estructura de la página
├── css/styles.css     Estilos (mobile-first, con tema claro/oscuro)
├── js/storage.js       Guardado en localStorage (series, capítulos, vocabulario)
├── js/api.js            Llamadas a TVMaze, MyMemory y Dictionary API
└── js/app.js             Interfaz: catálogo, ficha de serie, capítulo y "Mi vocabulario"
```
