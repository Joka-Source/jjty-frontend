export function inside(point, polygon) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      hit = !hit;
  }
  return hit;
}
export function selectItems(items, polygon) {
  if (polygon.length < 3) return [];
  return items.flatMap((item, index) => {
    const points =
      item.type === "ink"
        ? item.points
        : item.type === "image"
          ? [[item.x + item.width / 2, item.y + item.height / 2]]
          : [[item.x, item.y]];
    return points.some((p) => inside(p, polygon)) ? [index] : [];
  });
}
export function moveItems(items, indices, dx, dy) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy))
    throw Error("Invalid movement");
  return items.map((item, i) => {
    const next = structuredClone(item);
    if (indices.includes(i)) {
      if (next.type === "ink")
        next.points = next.points.map(([x, y]) => [x + dx, y + dy]);
      else {
        next.x += dx;
        next.y += dy;
      }
    }
    return next;
  });
}
