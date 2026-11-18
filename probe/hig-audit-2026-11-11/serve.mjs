// Static server for BEFORE-AFTER.html (Chrome can't open file:// from the extension).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const types = { ".html": "text/html", ".jpg": "image/jpeg", ".png": "image/png" };
http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "BEFORE-AFTER.html");
  if (!p.startsWith(root)) return res.writeHead(403).end();
  fs.readFile(p, (e, b) => e ? res.writeHead(404).end() : res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }).end(b));
}).listen(3077, "127.0.0.1");
