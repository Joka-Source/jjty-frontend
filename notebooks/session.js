export function reconcileSession(value, notebooks) {
  const available = new Map(
    notebooks.filter((n) => !n.trashed).map((n) => [n.id, n]),
  );
  const tabs = [
    ...new Set(Array.isArray(value?.tabs) ? value.tabs : []),
  ].filter((id) => available.has(id));
  const pages = Object.fromEntries(
    tabs.map((id) => {
      const p = value?.pages?.[id];
      return [
        id,
        Number.isInteger(p)
          ? Math.max(0, Math.min(p, available.get(id).pages.length - 1))
          : 0,
      ];
    }),
  );
  return {
    tabs,
    pages,
    active: tabs.includes(value?.active) ? value.active : null,
  };
}
