import { createService } from "@shop/common";

const { start } = createService({
  name: "catalog",
  description: "Product catalog service",
});

await start();
