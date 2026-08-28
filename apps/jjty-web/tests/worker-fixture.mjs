let importSequence = 0;

export async function fetchFromWorker(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  importSequence += 1;
  workerUrl.searchParams.set("test", `${process.pid}-${importSequence}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "http://localhost/"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}
