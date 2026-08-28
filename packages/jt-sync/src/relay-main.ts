/** Boot the relay standalone. Usage: tsx src/relay-main.ts [port] */
import { Relay } from "./relay.js";

const port = Number(process.argv[2] ?? 8787);
const relay = new Relay();
relay.listen(port).then((p) => {
  // Parent processes (tests) parse this line to learn the bound port.
  console.log(`jt-sync-relay listening ws://127.0.0.1:${p}`);
});
