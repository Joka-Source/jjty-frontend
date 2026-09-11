const copy = (value) => JSON.parse(JSON.stringify(value));

export function createLaterController({ fetchPage, onChange = () => {} }) {
  let generation = 0;
  let current = {
    tab: "saved",
    status: "idle",
    items: [],
    nextCursor: null,
    error: null,
    failedRequest: null,
  };

  const publish = (change) => {
    current = { ...current, ...change };
    onChange(copy(current));
  };

  async function load({ append = false, cursor = null } = {}) {
    const request = ++generation;
    const tab = current.tab;
    publish({
      status: append ? "loading-older" : "loading",
      error: null,
      failedRequest: null,
      ...(append ? {} : { items: [], nextCursor: null }),
    });
    try {
      const result = await fetchPage({ tab, cursor });
      if (request !== generation || tab !== current.tab) return;
      const items = append
        ? [...current.items, ...result.items.filter((candidate) => !current.items.some((item) => item.id === candidate.id))]
        : result.items;
      publish({ status: "ready", items, nextCursor: result.nextCursor ?? null, error: null, failedRequest: null });
    } catch (error) {
      if (request !== generation || tab !== current.tab) return;
      publish({
        status: append ? "error-older" : "error",
        error: error instanceof Error ? error.message : "request failed",
        failedRequest: { append, cursor },
      });
    }
  }

  return {
    state: () => copy(current),
    load,
    loadOlder: () => current.nextCursor ? load({ append: true, cursor: current.nextCursor }) : Promise.resolve(),
    retry: () => current.failedRequest ? load(current.failedRequest) : Promise.resolve(),
    selectTab(tab) {
      generation += 1;
      current = { ...current, tab, status: "idle", items: [], nextCursor: null, error: null, failedRequest: null };
      onChange(copy(current));
      return load();
    },
  };
}
