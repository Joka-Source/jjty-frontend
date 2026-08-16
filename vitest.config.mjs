import { fileURLToPath } from "node:url";

export default {
  resolve: {
    alias: [
      {
        find: /^node:test$/,
        replacement: fileURLToPath(new URL("./test/vitest-node-test.mjs", import.meta.url)),
      },
    ],
  },
};
