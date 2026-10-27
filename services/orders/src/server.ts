import { createService } from "@shop/common";

interface OrderItemInput {
  productId: string;
  quantity: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const catalogUrl = process.env.CATALOG_URL ?? "http://localhost:3001";
const customersUrl = process.env.CUSTOMERS_URL ?? "http://localhost:3002";
const notificationsUrl = process.env.NOTIFICATIONS_URL ?? "http://localhost:3004";

function isOrderItem(value: unknown): value is OrderItemInput {
  return typeof value === "object" && value !== null &&
    "productId" in value && typeof value.productId === "string" &&
    value.productId.length > 0 && value.productId.length <= 100 &&
    "quantity" in value && typeof value.quantity === "number" &&
    Number.isInteger(value.quantity) && value.quantity > 0 && value.quantity <= 99;
}

function isCartUpdate(value: unknown): value is { items: OrderItemInput[] } {
  if (typeof value !== "object" || value === null || !("items" in value) ||
      !Array.isArray(value.items) || value.items.length > 50 ||
      !value.items.every(isOrderItem)) {
    return false;
  }
  return value.items.length === new Set(value.items.map((item) => item.productId)).size;
}

function isOrderRequest(value: unknown): value is { customerId: number; cartId: string } {
  return typeof value === "object" && value !== null &&
    "customerId" in value && typeof value.customerId === "number" &&
    Number.isSafeInteger(value.customerId) && value.customerId > 0 &&
    "cartId" in value && typeof value.cartId === "string" &&
    uuidPattern.test(value.cartId);
}

async function getCatalogProducts(): Promise<Product[]> {
  const response = await fetch(`${catalogUrl}/products`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Catalog service returned ${response.status}`);
  const result = await response.json() as { products: Product[] };
  if (!Array.isArray(result.products)) throw new Error("Catalog returned an invalid product list");
  return result.products;
}

const { app, db, start } = createService({
  name: "orders",
  description: "Order management service",
  initialize: async (pool) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS carts (
        id UUID PRIMARY KEY,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        cart_id UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 99),
        PRIMARY KEY (cart_id, product_id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'placed',
        total NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK (quantity > 0),
        unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0)
      )
    `);
  },
});

app.get<{ Params: { cartId: string } }>("/carts/:cartId", async (request, reply) => {
  const { cartId } = request.params;
  if (!uuidPattern.test(cartId)) return reply.code(400).send({ error: "Cart id must be a UUID" });
  const result = await db.query(
    `SELECT product_id AS "productId", quantity
     FROM cart_items WHERE cart_id = $1 ORDER BY product_id`,
    [cartId],
  );
  return { cartId, items: result.rows };
});

app.put<{ Params: { cartId: string }; Body: { items: OrderItemInput[] } }>(
  "/carts/:cartId",
  async (request, reply) => {
    const { cartId } = request.params;
    if (!uuidPattern.test(cartId)) return reply.code(400).send({ error: "Cart id must be a UUID" });
    if (!isCartUpdate(request.body)) {
      return reply.code(400).send({
        error: "Cart must contain up to 50 distinct products with quantities from 1 to 99",
      });
    }

    let products: Product[];
    try {
      products = await getCatalogProducts();
    } catch (error) {
      request.log.error({ err: error }, "Cart could not validate products with catalog");
      return reply.code(503).send({ error: "Catalog service is unavailable" });
    }
    const availableProducts = new Set(products.map((product) => product.id));
    if (request.body.items.some((item) => !availableProducts.has(item.productId))) {
      return reply.code(400).send({ error: "One or more products are no longer available" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO carts (id) VALUES ($1)
         ON CONFLICT (id) DO UPDATE SET updated_at = NOW()`,
        [cartId],
      );
      await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cartId]);
      for (const item of request.body.items) {
        await client.query(
          "INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)",
          [cartId, item.productId, item.quantity],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return { cartId, items: request.body.items };
  },
);

app.post<{
  Body: { customerId: number; cartId: string };
}>("/orders", async (request, reply) => {
  const body: unknown = request.body;
  if (!isOrderRequest(body)) {
    return reply.code(400).send({ error: "A customer id and valid cart id are required" });
  }

  let customerResponse: Response;
  try {
    customerResponse = await fetch(`${customersUrl}/customers/${body.customerId}`, {
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    request.log.error({ err: error }, "Customer service request failed");
    return reply.code(503).send({ error: "Customer service is unavailable" });
  }
  if (customerResponse.status === 404) return reply.code(404).send({ error: "Customer not found" });
  if (!customerResponse.ok) {
    request.log.error({ status: customerResponse.status }, "Customer service validation failed");
    return reply.code(503).send({ error: "Customer service is unavailable" });
  }
  const { customer } = await customerResponse.json() as {
    customer: { id: number; name: string; email: string };
  };

  let products: Product[];
  try {
    products = await getCatalogProducts();
  } catch (error) {
    request.log.error({ err: error }, "Catalog service lookup failed");
    return reply.code(503).send({ error: "Catalog service is unavailable" });
  }

  const client = await db.connect();
  let order: { id: number; status: string; total: number; created_at: Date };
  let resolvedItems: Array<Product & { quantity: number }>;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM carts WHERE id = $1 FOR UPDATE", [body.cartId]);
    const cartResult = await client.query(
      `SELECT product_id AS "productId", quantity
       FROM cart_items WHERE cart_id = $1 ORDER BY product_id`,
      [body.cartId],
    );
    if (cartResult.rowCount === 0 || !cartResult.rows.every(isOrderItem)) {
      await client.query("ROLLBACK");
      return reply.code(400).send({ error: "Your cart is empty or invalid" });
    }

    const productMap = new Map(products.map((product) => [product.id, product]));
    resolvedItems = cartResult.rows.flatMap((item: OrderItemInput) => {
      const product = productMap.get(item.productId);
      return product ? [{ ...product, quantity: item.quantity }] : [];
    });
    if (resolvedItems.length !== cartResult.rows.length) {
      await client.query("ROLLBACK");
      return reply.code(400).send({ error: "One or more products are no longer available" });
    }

    const total = resolvedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, customer_name, customer_email, total)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status, total::float8 AS total, created_at`,
      [customer.id, customer.name, customer.email, total],
    );
    order = orderResult.rows[0];
    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.id, item.name, item.quantity, item.price],
      );
    }
    await client.query("DELETE FROM carts WHERE id = $1", [body.cartId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  let notificationStatus = "sent";
  try {
    const notificationResponse = await fetch(`${notificationsUrl}/notifications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        orderId: order.id,
        customerId: customer.id,
        email: customer.email,
        message: `Your order #${order.id} has been placed.`,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!notificationResponse.ok) throw new Error(`Notification service returned ${notificationResponse.status}`);
  } catch (error) {
    notificationStatus = "pending";
    request.log.error({ err: error, orderId: order.id }, "Order confirmation notification was not recorded");
  }

  return reply.code(201).send({
    order: {
      ...order,
      items: resolvedItems.map((item) => ({
        productId: item.id,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.price,
      })),
      notificationStatus,
    },
  });
});

app.get<{ Querystring: { email?: string } }>("/orders", async (request, reply) => {
  const email = request.query.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return reply.code(400).send({ error: "A valid customer email is required" });
  }
  const result = await db.query(
    `SELECT id, customer_id AS "customerId", customer_name AS "customerName",
            customer_email AS "customerEmail", status, total::float8 AS total, created_at AS "createdAt",
            COALESCE((
              SELECT json_agg(json_build_object(
                'productId', product_id,
                'name', product_name,
                'quantity', quantity,
                'unitPrice', unit_price::float8
              ) ORDER BY id)
              FROM order_items WHERE order_id = orders.id
            ), '[]'::json) AS items
     FROM orders WHERE customer_email = $1 ORDER BY created_at DESC LIMIT 50`,
    [email],
  );
  return { orders: result.rows };
});

await start();
