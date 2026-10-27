import { createService } from "@shop/common";

const seedProducts = [
  ["ceramic-mug", "Everyday ceramic mug", "Home", 24, "Bestseller", "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=750&q=80", "Handmade ceramic coffee mug"],
  ["linen-tote", "Market day tote", "Accessories", 32, "Good pick", "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=750&q=80", "Neutral canvas tote bag"],
  ["soft-throw", "Sunday soft throw", "Home", 68, "Made to keep", "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=750&q=80", "Soft neutral throw on a cozy sofa"],
  ["daily-bottle", "The daily bottle", "On the go", 38, "Everyday essential", "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=750&q=80", "Reusable water bottle"],
  ["little-vase", "Little bud vase", "Home", 29, "Small batch", "https://images.unsplash.com/photo-1578500494198-246f612d3b3d?auto=format&fit=crop&w=750&q=80", "Minimal handmade ceramic vase"],
  ["weekend-pouch", "Weekend carry pouch", "Accessories", 26, "Travel ready", "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=750&q=80", "Everyday leather accessory bag"],
  ["pour-over", "Slow morning pour-over", "Home", 42, "Morning ritual", "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=750&q=80", "Fresh coffee pour-over"],
  ["sunny-cap", "Easy days cotton cap", "Accessories", 34, "Just in", "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&w=750&q=80", "Classic cotton baseball cap"],
];

const { app, db, start } = createService({
  name: "catalog",
  description: "Product catalog service",
  initialize: async (pool) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
        tag TEXT NOT NULL,
        image TEXT NOT NULL,
        alt TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    for (const product of seedProducts) {
      await pool.query(
        `INSERT INTO products (id, name, category, price, tag, image, alt)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        product,
      );
    }
  },
});

app.get<{ Querystring: { category?: string; q?: string } }>("/products", async (request) => {
  const result = await db.query(
    `SELECT id, name, category, price::float8 AS price, tag, image, alt
     FROM products
     WHERE ($1::text IS NULL OR category = $1)
       AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR category ILIKE '%' || $2 || '%')
     ORDER BY created_at, id`,
    [request.query.category || null, request.query.q?.trim() || null],
  );
  return { products: result.rows };
});

await start();
