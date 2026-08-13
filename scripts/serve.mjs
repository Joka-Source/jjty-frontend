import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "dist");
const port = Number(process.argv[2] ?? 4177);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const requested = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (path.relative(root, requested).startsWith("..")) throw new Error("outside demo");
    const info = await stat(requested);
    const file = info.isDirectory() ? path.join(requested, "index.html") : requested;
    response.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => console.log(`jt glass: http://127.0.0.1:${port}`));

