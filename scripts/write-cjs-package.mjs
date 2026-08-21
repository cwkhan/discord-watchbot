import { mkdir, writeFile } from "node:fs/promises";

await mkdir(new URL("../dist/cjs/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../dist/cjs/package.json", import.meta.url),
  JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
);
await writeFile(
  new URL("../dist/cjs/entry.js", import.meta.url),
  "const api = require('./index.js');\n" +
  "module.exports = api.default;\n" +
  "Object.assign(module.exports, api);\n",
);