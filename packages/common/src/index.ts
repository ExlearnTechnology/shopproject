import Fastify, { type FastifyInstance } from "fastify";
import pg, { type Pool as PgPool } from "pg";

const { Pool } = pg;

export interface ServiceInfo {
  name: string;
  description: string;
  initialize?: (pool: PgPool) => Promise<void>;
}

export function createService(info: ServiceInfo): {
  app: FastifyInstance;
  db: PgPool;
  start: () => Promise<void>;
} {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  const schema = process.env.PG_SCHEMA ?? "public";
  if (!/^[a-z][a-z0-9_]*$/.test(schema)) {
    throw new Error("PG_SCHEMA must start with a lowercase letter and contain only lowercase letters, digits, or underscores");
  }

  const pool = new Pool({
    host: process.env.PGHOST ?? "localhost",
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE ?? "shop",
    user: process.env.PGUSER ?? "shop",
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : undefined,
    options: `-c search_path=${schema}`,
    connectionTimeoutMillis: 5000,
  });
  const app = Fastify({ logger: true });

  app.get("/", async () => ({
    service: info.name,
    description: info.description,
    status: "running",
  }));

  app.get("/health/live", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    try {
      await pool.query("SELECT 1");
      return { status: "ready" };
    } catch (error) {
      app.log.error({ err: error }, "Database readiness check failed");
      return reply.code(503).send({ status: "not ready" });
    }
  });

  app.addHook("onClose", async () => {
    await pool.end();
  });

  return {
    app,
    db: pool,
    start: async () => {
      try {
        await pool.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
        await info.initialize?.(pool);
        await app.listen({ port, host: "0.0.0.0" });
      } catch (error) {
        app.log.error({ err: error }, "Service failed to start");
        await app.close();
        throw error;
      }
    },
  };
}
