import { createService } from "@shop/common";

const { start } = createService({
  name: "orders",
  description: "Order management service",
});

await start();
