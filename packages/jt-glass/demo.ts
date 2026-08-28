import { mountGlass } from "./src/index.ts";
import { demoEvents, demoExpected } from "./demo-data.js";

const root = document.querySelector<HTMLElement>("#glass");
if (!root) throw new Error("The glass demo needs a #glass element");

mountGlass(root, {
  events: demoEvents,
  expected: demoExpected,
  title: "See what jt understood",
});

