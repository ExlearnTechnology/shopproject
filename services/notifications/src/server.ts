import { createService } from "@shop/common";

const { app, db, start } = createService({
  name: "notifications",
  description: "Customer notification service",
  initialize: async (pool) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id INTEGER NOT NULL,
        customer_id INTEGER NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (order_id, email)
      )
    `);
  },
});

app.post<{
  Body: { orderId: number; customerId: number; email: string; message: string };
}>("/notifications", async (request, reply) => {
  const body = request.body;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (
    !Number.isSafeInteger(body?.orderId) || body.orderId <= 0 ||
    !Number.isSafeInteger(body?.customerId) || body.customerId <= 0 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !message || message.length > 500
  ) {
    return reply.code(400).send({ error: "Valid order, customer, email, and message details are required" });
  }

  const result = await db.query(
    `INSERT INTO notifications (order_id, customer_id, email, message)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (order_id, email) DO UPDATE SET message = EXCLUDED.message
     RETURNING id, order_id AS "orderId", customer_id AS "customerId", email, message, created_at AS "createdAt"`,
    [body.orderId, body.customerId, email, message],
  );
  return reply.code(201).send({ notification: result.rows[0] });
});

app.get<{ Querystring: { email?: string } }>("/notifications", async (request, reply) => {
  const email = request.query.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply.code(400).send({ error: "A valid customer email is required" });
  }
  const result = await db.query(
    `SELECT id, order_id AS "orderId", customer_id AS "customerId", email, message, created_at AS "createdAt"
     FROM notifications WHERE email = $1 ORDER BY created_at DESC LIMIT 50`,
    [email],
  );
  return { notifications: result.rows };
});

await start();
