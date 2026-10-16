// Dev server for a film project.
//   FILM_DIR=/abs/path/to/my-film PORT=5190 NO_HMR=1 npx vite
// Serves: /film/*  -> $FILM_DIR (scene.ts, data/timeline.json, any data files)
//         /fonts/* -> engine/fonts (run scripts/fetch_fonts.sh once)
// Scene code imports the engine as '@engine/core'.
import { defineConfig, normalizePath, type Plugin } from 'vite';
import path from 'node:path';

const engine = path.resolve(import.meta.dirname);
const film = path.resolve(process.env.FILM_DIR ?? path.join(engine, '..', 'templates', 'blockwise'));
const port = parseInt(process.env.PORT ?? '5190');

function filmFiles(): Plugin {
  return {
    name: 'film-files',
    configureServer(s) {
      s.middlewares.use((req, _res, next) => {
        if (req.url?.startsWith('/film/')) req.url = `/@fs/${encodeURI(normalizePath(film))}/${req.url.slice(6)}`;
        else if (req.url?.startsWith('/fonts/')) req.url = `/@fs/${encodeURI(normalizePath(path.join(engine, 'fonts')))}/${req.url.slice(7)}`;
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [filmFiles()],
  resolve: { alias: { '@engine': path.join(engine, 'src') } },
  server: { port, strictPort: true, hmr: process.env.NO_HMR ? false : undefined, fs: { allow: [engine, film] } },
  build: { target: 'esnext' },
});
