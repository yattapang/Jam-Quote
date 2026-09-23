/**
 * A REAL Postgres for the integration suite: PGlite (in-process, offline) behind a
 * minimal TCP bridge that speaks the Postgres wire protocol, so the ordinary
 * Prisma query engine connects to it exactly as it connects to Neon.
 *
 * No driver adapter, no schema change: the only thing that differs from
 * production is the host in DATABASE_URL. PGlite is single-connection, so the
 * bridge serialises every message through `runExclusive` and the URL pins
 * `connection_limit=1`.
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { join } from "node:path";

const MIGRATIONS_DIR = join(__dirname, "../../prisma/migrations");
const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;

export interface PgliteServer {
  url: string;
  db: PGlite;
  close(): Promise<void>;
}

/** Every migration, in order — the schema production actually has. */
export async function migrate(db: PGlite): Promise<number> {
  const dirs = readdirSync(MIGRATIONS_DIR).filter((d) => !d.includes(".")).sort();
  for (const dir of dirs) await db.exec(readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8"));
  return dirs.length;
}

function serve(db: PGlite, socket: Socket): void {
  let buf = Buffer.alloc(0);
  let started = false;
  let chain = Promise.resolve();
  socket.setNoDelay(true);
  socket.on("error", () => undefined);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const messages: Buffer[] = [];
    for (;;) {
      if (!started) {
        if (buf.length < 8) break;
        const len = buf.readInt32BE(0);
        if (buf.length < len) break;
        const code = buf.readInt32BE(4);
        const msg = buf.subarray(0, len);
        buf = buf.subarray(len);
        if (code === SSL_REQUEST || code === GSSENC_REQUEST) {
          chain = chain.then(() => {
            socket.write("N");
          });
          continue;
        }
        started = true;
        messages.push(Buffer.from(msg));
        continue;
      }
      if (buf.length < 5) break;
      const len = buf.readInt32BE(1);
      if (buf.length < len + 1) break;
      const msg = buf.subarray(0, len + 1);
      buf = buf.subarray(len + 1);
      if (msg[0] === 0x58 /* Terminate */) {
        chain = chain.then(() => {
          socket.end();
        });
        continue;
      }
      messages.push(Buffer.from(msg));
    }
    if (messages.length === 0) return;
    const payload = new Uint8Array(Buffer.concat(messages));
    chain = chain
      .then(() => db.runExclusive(() => db.execProtocolRaw(payload)))
      .then((out) => {
        if (out.length) socket.write(Buffer.from(out));
      })
      .catch((e: unknown) => {
        socket.destroy(e as Error);
      });
  });
}

export async function startPglite(): Promise<PgliteServer> {
  const db = new PGlite();
  await db.waitReady;
  await migrate(db);
  const sockets = new Set<Socket>();
  const server: Server = createServer((s) => {
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
    serve(db, s);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable&connection_limit=1&pool_timeout=0`,
    db,
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await db.close();
    },
  };
}
