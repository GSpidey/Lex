import { spawn } from "node:child_process";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  open,
  readFile,
  stat,
  appendFile,
  writeFile,
} from "node:fs/promises";
import { resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Writable } from "node:stream";

const root = fileURLToPath(new URL("../", import.meta.url));
const compose = ["compose", "-p", "lex-docker", "-f", "infra/compose.lex.yml"];
const directory = resolve(root, "backups/docker");
const header = Buffer.from("LEXPG001");
const key = Buffer.from(
  (await readFile(resolve(root, ".secrets/docker/backup-key"), "utf8")).trim(),
  "hex",
);
if (key.length !== 32) throw new Error("A 256-bit Lex backup key is required");
const mode = process.argv[2];
const exec = (args, stdio = ["ignore", "pipe", "pipe"]) => {
  const child = spawn(
    "docker",
    [...compose, "exec", "-T", "postgres", ...args],
    { cwd: root, stdio, windowsHide: true },
  );
  // Do not print database error details, connection strings or dumped content.
  child.stderr?.resume();
  const done = new Promise((resolveDone, reject) => {
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolveDone()
        : reject(new Error("Scoped PostgreSQL command failed")),
    );
  });
  void done.catch(() => {});
  return { child, done };
};
await mkdir(directory, { recursive: true, mode: 0o700 });

if (mode === "create") {
  const name = `lex-${new Date().toISOString().replaceAll(":", "-")}-${randomBytes(4).toString("hex")}.pgdump.aesgcm`;
  const path = resolve(directory, name),
    iv = randomBytes(12);
  const file = await open(path, "wx", 0o600);
  await file.write(Buffer.concat([header, iv]));
  await file.close();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(header);
  const dump = exec([
    "pg_dump",
    "-U",
    "lex",
    "-d",
    "lex",
    "--format=custom",
    "--schema=lex",
    "--no-owner",
    "--no-privileges",
  ]);
  try {
    await Promise.all([
      pipeline(
        dump.child.stdout,
        cipher,
        createWriteStream(path, { flags: "a" }),
      ),
      dump.done,
    ]);
    await appendFile(path, cipher.getAuthTag());
    const digest = createHash("sha256");
    for await (const chunk of createReadStream(path)) digest.update(chunk);
    await writeFile(
      `${path}.json`,
      JSON.stringify(
        {
          format: "lex-postgres-backup-v1",
          createdAt: new Date().toISOString(),
          sourceDatabase: "lex",
          schema: "lex",
          ciphertextSha256: digest.digest("hex"),
          sizeBytes: (await stat(path)).size,
          scope:
            "migrated PostgreSQL tables only; not D1, R2 or a full-app backup",
          restoreVerified: false,
        },
        null,
        2,
      ),
      { flag: "wx", mode: 0o600 },
    );
    console.info(
      JSON.stringify({
        event: "lex_backup_created",
        path,
        encrypted: true,
        restoreVerified: false,
      }),
    );
  } catch (error) {
    dump.child.kill();
    console.error(
      JSON.stringify({
        event: "lex_backup_incomplete",
        path,
        message:
          "Incomplete artifact retained for diagnosis; do not restore it.",
      }),
    );
    throw error;
  }
} else if (mode === "restore-test") {
  const name = process.argv[3];
  if (
    !name ||
    basename(name) !== name ||
    !/^lex-[a-zA-Z0-9.T-]+\.pgdump\.aesgcm$/u.test(name)
  )
    throw new Error("Provide a Lex backup filename, not a path");
  const path = resolve(directory, name),
    size = (await stat(path)).size;
  if (size < 37) throw new Error("Backup is incomplete");
  const file = await open(path, "r"),
    prefix = Buffer.alloc(20),
    tag = Buffer.alloc(16);
  try {
    await file.read(prefix, 0, 20, 0);
    await file.read(tag, 0, 16, size - 16);
  } finally {
    await file.close();
  }
  if (!prefix.subarray(0, 8).equals(header))
    throw new Error("Unknown backup format");
  const decipher = () => {
    const value = createDecipheriv("aes-256-gcm", key, prefix.subarray(8));
    value.setAAD(header);
    value.setAuthTag(tag);
    return value;
  };
  // Authenticate the complete ciphertext before creating a restore target.
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  const manifest = JSON.parse(await readFile(`${path}.json`, "utf8"));
  if (digest.digest("hex") !== manifest.ciphertextSha256)
    throw new Error("Backup checksum mismatch");
  await pipeline(
    createReadStream(path, { start: 20, end: size - 17 }),
    decipher(),
    new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
    }),
  );
  const database = `lex_test_restore_${randomBytes(8).toString("hex")}`;
  await exec(["createdb", "-U", "lex", database]).done;
  const restore = exec(
    [
      "pg_restore",
      "-U",
      "lex",
      "-d",
      database,
      "--single-transaction",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
    ],
    ["pipe", "ignore", "pipe"],
  );
  try {
    await Promise.all([
      pipeline(
        createReadStream(path, { start: 20, end: size - 17 }),
        decipher(),
        restore.child.stdin,
      ),
      restore.done,
    ]);
    // A successful restore is recorded separately; never overwrite the original manifest.
    const check = exec([
      "psql",
      "-U",
      "lex",
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
      "-c",
      "SELECT json_build_object('migrations',(SELECT count(*) FROM lex.schema_migrations),'users',(SELECT count(*) FROM lex.users),'documents',(SELECT count(*) FROM lex.legal_documents),'versions',(SELECT count(*) FROM lex.legal_document_versions));",
    ]);
    let counts = "";
    check.child.stdout.on("data", (chunk) => {
      counts += chunk.toString();
    });
    await check.done;
    const evidence = {
      format: "lex-postgres-restore-v1",
      testedAt: new Date().toISOString(),
      database,
      backup: name,
      authenticationVerified: true,
      restoredCounts: JSON.parse(counts),
      retained: true,
      limitation:
        "Foundation restore only; full D1/R2 migration and relationship/content-hash reconciliation remain required.",
    };
    await writeFile(
      resolve(directory, `${database}.receipt.json`),
      JSON.stringify(evidence, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    console.info(
      JSON.stringify({ event: "lex_restore_test_passed", ...evidence }),
    );
  } catch (error) {
    restore.child.kill();
    throw error;
  }
} else {
  throw new Error(
    "Use create or restore-test <filename>. Restore never targets the live lex database.",
  );
}
