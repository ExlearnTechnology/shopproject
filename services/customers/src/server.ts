import { createService } from "@shop/common";

const { app, db, start } = createService({
  name: "customers",
  description: "Customer profile service",
  initialize: async (pool) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  },
});

app.post<{ Body: { name: string; email: string } }>("/customers", async (request, reply) => {
  const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
  const email = typeof request.body?.email === "string" ? request.body.email.trim().toLowerCase() : "";
  if (!name || name.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return reply.code(400).send({ error: "A valid name and email address are required" });
  }

  const result = await db.query(
    `INSERT INTO customers (name, email)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
     RETURNING id, name, email, created_at`,
    [name, email],
  );
  return reply.code(200).send({ customer: result.rows[0] });
});

app.get<{ Params: { id: string } }>("/customers/:id", async (request, reply) => {
  if (!/^\d+$/.test(request.params.id)) {
    return reply.code(400).send({ error: "Customer id must be a positive integer" });
  }
  const result = await db.query(
    "SELECT id, name, email, created_at FROM customers WHERE id = $1",
    [request.params.id],
  );
  if (result.rowCount === 0) return reply.code(404).send({ error: "Customer not found" });
  return { customer: result.rows[0] };
});

await start();
