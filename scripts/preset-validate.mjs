import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "vite";

// Vite loads the same TypeScript parser on both supported Node versions.
const server = await createServer({
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, watch: null },
  appType: "custom",
});

try {
  const { presets, parsePresetFile, createPresetFile } = await server.ssrLoadModule("/src/rules.ts");
  const files = readdirSync("presets").filter(name => name.endsWith(".json")).sort();
  const expected = presets.map(preset => `${preset.id}.json`).sort();
  assert.deepEqual(files, expected, "Preset files must match every built-in ID in src/rules.ts");

  for (const name of files) {
    try {
      const text = readFileSync(`presets/${name}`, "utf8");
      const file = JSON.parse(text);
      assert.equal(file.schema, "forma-zoning-check/preset@2", "Expected schema @2");
      parsePresetFile(text);
      const preset = presets.find(preset => `${preset.id}.json` === name);
      assert.deepEqual(file, createPresetFile(preset.controls, preset.label), "File differs from built-in preset");
      console.log(`PASS presets/${name}`);
    } catch (error) {
      throw new Error(`presets/${name}: ${error.message}`, { cause: error });
    }
  }

  console.log(`Validated ${files.length} presets against schema @2; all ${presets.length} built-ins have matching files.`);
} finally {
  await server.close();
}
