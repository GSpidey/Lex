import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "out");
const checkedExtensions = new Set([".css", ".html", ".js", ".json", ".txt"]);
const forbidden = [
  {
    label: "localhost endpoint",
    pattern: /(?:https?|wss?):\/\/localhost(?=[:/])/giu,
  },
  {
    label: "loopback endpoint",
    pattern: /(?:https?|wss?):\/\/127\.0\.0\.1(?=[:/])/giu,
  },
  {
    label: "Android emulator endpoint",
    pattern: /(?:https?|wss?):\/\/10\.0\.2\.2(?=[:/])/giu,
  },
  {
    label: "reserved invalid endpoint",
    pattern: /(?:https?|wss?):\/\/[^/\s"'`]+\.invalid\b/giu,
  },
];

async function filesWithin(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesWithin(path)));
    else if (checkedExtensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of await filesWithin(root)) {
  const content = await readFile(file, "utf8");
  for (const { label, pattern } of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) violations.push(`${file}: ${label}`);
  }
}

if (violations.length > 0) {
  throw new Error(
    `Web build contains endpoints that are unsafe for deployment:\n${violations.join("\n")}`,
  );
}

console.log(`Validated deployable web endpoints in ${root}`);
