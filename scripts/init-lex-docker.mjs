import { randomBytes } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
// Generated local credentials only; never print, overwrite or commit them.
const directory = new URL("../.secrets/docker/", import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
if (process.platform === "win32") {
  const identity = execFileSync("whoami", ["/user", "/fo", "csv", "/nh"], {
    encoding: "utf8",
    windowsHide: true,
  });
  const sid = identity.match(/S-1-5-[0-9-]+/u)?.[0];
  if (!sid)
    throw new Error("Could not identify the Windows account for secret ACLs");
  execFileSync(
    "icacls",
    [
      fileURLToPath(directory),
      "/inheritance:r",
      "/grant:r",
      `*${sid}:(OI)(CI)F`,
      "*S-1-5-18:(OI)(CI)F",
    ],
    { stdio: "ignore", windowsHide: true },
  );
}
for (const name of ["postgres-password", "backup-key"]) {
  try {
    const file = await open(new URL(name, directory), "wx", 0o600);
    try {
      await file.writeFile(randomBytes(32).toString("hex"));
    } finally {
      await file.close();
    }
    console.info(`Created Lex local ${name} secret.`);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.info(`Kept existing Lex local ${name} secret.`);
  }
}
console.info(
  `Secret directory: ${fileURLToPath(directory)}. Keep an independent secure copy; never include it in an image or backup archive.`,
);
