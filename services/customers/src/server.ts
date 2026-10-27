import { createService } from "@shop/common";

const { start } = createService({
  name: "customers",
  description: "Customer profile service",
});

await start();
