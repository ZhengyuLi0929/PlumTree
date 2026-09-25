import { describe, expect, it } from "vitest";
import { MockPaymentProvider } from "./payments";

describe("MockPaymentProvider（下单→回调→退款闭环）", () => {
  it("createOrder → callback(paid) → refund", async () => {
    const p = new MockPaymentProvider();
    const order = await p.createOrder({ orderId: "t1", amountCents: 399, description: "本周匹配" });
    expect(order.status).toBe("pending");
    expect(order.amountCents).toBe(399); // 金额以分存储
    expect(order.payPayload).toContain("mock-qr://");

    const cb = await p.handleCallback({ orderId: "t1", paid: true });
    expect(cb.paid).toBe(true);
    expect((await p.queryOrder("t1")).status).toBe("paid");

    const refund = await p.refund("t1", 399, "no-show");
    expect(refund.refundId).toBe("refund_t1");
    expect((await p.queryOrder("t1")).status).toBe("refunded");
  });

  it("rejects refunding an unpaid order", async () => {
    const p = new MockPaymentProvider();
    await p.createOrder({ orderId: "t2", amountCents: 100, description: "x" });
    await expect(p.refund("t2", 100, "r")).rejects.toThrow("已支付");
  });
});
