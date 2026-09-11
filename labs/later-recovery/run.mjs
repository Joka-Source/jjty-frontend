import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";
const root = new URL("./", import.meta.url).pathname;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".mjs": "text/javascript; charset=utf-8" };
export async function startServer({ port = Number(process.env.JETT_LATER_LAB_PORT || 8784) } = {}) {
  const server = http.createServer(async (request, response) => {
    const path = request.url === "/" ? "index.html" : request.url.slice(1);
    if (path.includes("..")) { response.writeHead(400).end(); return; }
    try { const body = await readFile(join(root, path)); response.writeHead(200, { "content-type": types[extname(path)] || "text/plain; charset=utf-8", "cache-control": "no-store" }); response.end(body); }
    catch { response.writeHead(404).end("not found"); }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = await startServer();
  console.log(`Later recovery lab: ${server.url}`);
}
