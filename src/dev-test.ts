import { CheckoutController } from "./ui/controller";

const controller = new CheckoutController({
  clientSecret: "cs_test_123",
  baseUrl: "http://localhost:3002",
  defaultMethod: "manual",
  onSuccess: (e) => console.log("SUCCESS", e),
  onAwaitingConfirmation: (e) => console.log("AWAITING", e),
  onError: (e) => console.log("ERROR", e),
});

controller.subscribe((s) => console.log("STATE", s.type));
await controller.open();
await controller.continue();
