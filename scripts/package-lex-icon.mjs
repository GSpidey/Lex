// Deterministic platform-size exports of the owner-approved artwork; no regeneration.
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sharp = require(
  require.resolve("sharp", { paths: [require.resolve("next")] }),
);
const source = resolve(root, "assets/branding/lex-conversation-scales.png");
async function output(relative, size, webp = false) {
  const target = resolve(root, relative);
  if (!target.startsWith(root + sep)) throw new Error("Export outside Lex");
  await mkdir(dirname(target), { recursive: true });
  const image = sharp(source).resize(size, size).removeAlpha();
  await (webp ? image.webp({ lossless: true }) : image.png()).toFile(target);
}
for (const [density, size] of Object.entries({
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
})) {
  for (const name of ["ic_launcher", "ic_launcher_round"])
    await output(
      `apps/mobile/android/app/src/main/res/mipmap-${density}/${name}.webp`,
      size,
      true,
    );
}
await output(
  "apps/mobile/android/app/src/main/res/drawable/lex_launcher.png",
  432,
);
await output("apps/web/public/lex-icon.png", 512);
await output("apps/web/app/icon.png", 192);
await output("apps/web/app/apple-icon.png", 180);
await output("assets/branding/lex-ios-1024.png", 1024);
await output("assets/branding/lex-play-512.png", 512);
console.log(
  "Exported the approved Lex icon for Android, iOS, web and store preparation.",
);
