import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "web");
const dataRoot = path.join(__dirname, "data");

const MIME = {
  ".json": "application/json",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function repoDataMiddleware() {
  return (req, res, next) => {
    const raw = req.url?.split("?")[0] ?? "";
    if (!raw.startsWith("/data/")) return next();
    const rel = decodeURIComponent(raw.slice("/data/".length));
    const file = path.normalize(path.join(dataRoot, rel));
    if (!file.startsWith(dataRoot)) return next();
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return next();
    const ext = path.extname(file).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  };
}

export default defineConfig({
  root: webRoot,
  server: {
    port: 5173,
    strictPort: false,
    fs: { allow: [__dirname] },
  },
  preview: {
    port: 5173,
    strictPort: false,
  },
  plugins: [
    {
      name: "serve-repo-data",
      enforce: "pre",
      configureServer(server) {
        server.middlewares.use(repoDataMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(repoDataMiddleware());
      },
    },
  ],
});
