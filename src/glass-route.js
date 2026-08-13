import { glassTap, readGlassEvents } from "./glass-tap.js";

export async function mountGlassDevRoute() {
  if (!import.meta.env?.DEV || location.hash !== "#/glass") return false;
  const [{ mountGlass }, _styles] = await Promise.all([
    import("@jt/glass"),
    import("@jt/glass/styles.css"),
  ]);
  const root = document.createElement("main");
  root.id = "glass";
  document.body.replaceChildren(root);
  mountGlass(root, {
    events: readGlassEvents(),
    tap: glassTap,
    title: "See what jt understood",
  });
  return true;
}
