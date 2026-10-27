import { createService } from "@shop/common";

const { start } = createService({
  name: "notifications",
  description: "Customer notification service",
});

await start();
