/** Boot the relay standalone. Usage: tsx src/relay-main.ts [port] [session-file] [ttl-ms] */
import { Relay } from "./relay.js";

const port = Number(process.argv[2] ?? 8787);
const sessionFile = process.argv[3];
const sessionTtlMs = process.argv[4] ? Number(process.argv[4]) : undefined;
const relay = new Relay({ sessionFile, sessionTtlMs });
relay.listen(port).then((p) => {
  // Parent processes (tests) parse this line to learn the bound port.
  console.log(`jt-sync-relay listening ws://127.0.0.1:${p}`);
});
