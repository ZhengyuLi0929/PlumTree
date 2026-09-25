// T6：支付接口抽象。微信支付商户号等 ICP 落地后再开（2027 Q2），此处只定义接口 + Mock。
// 所有金额以分存储。UI 不出支付入口。
export type PaymentOrder = {
  orderId: string;
  amountCents: number;
  currency: string;
  status: "pending" | "paid" | "refunded" | "failed";
};

export interface PaymentProvider {
  /** 创建订单，返回支付参数（mock 返回占位二维码串） */
  createOrder(input: { orderId: string; amountCents: number; description: string }): Promise<PaymentOrder & { payPayload?: string }>;
  queryOrder(orderId: string): Promise<PaymentOrder>;
  /** 退款，返回退款单号 */
  refund(orderId: string, amountCents: number, reason: string): Promise<{ refundId: string }>;
  /** 回调验签+解析（mock 直接信任输入） */
  handleCallback(body: unknown): Promise<{ orderId: string; paid: boolean }>;
}

export class MockPaymentProvider implements PaymentProvider {
  private orders = new Map<string, PaymentOrder>();

  async createOrder(input: { orderId: string; amountCents: number; description: string }) {
    const order: PaymentOrder = {
      orderId: input.orderId,
      amountCents: input.amountCents,
      currency: "CNY",
      status: "pending",
    };
    this.orders.set(input.orderId, order);
    return { ...order, payPayload: `mock-qr://${input.orderId}/${input.amountCents}` };
  }

  async queryOrder(orderId: string): Promise<PaymentOrder> {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`order not found: ${orderId}`);
    return { ...o };
  }

  /** 测试辅助：模拟支付成功回调 */
  async markPaid(orderId: string) {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`order not found: ${orderId}`);
    o.status = "paid";
  }

  async refund(orderId: string, _amountCents: number, _reason: string) {
    const o = this.orders.get(orderId);
    if (!o) throw new Error(`order not found: ${orderId}`);
    if (o.status !== "paid") throw new Error("只有已支付订单可退款");
    o.status = "refunded";
    return { refundId: `refund_${orderId}` };
  }

  async handleCallback(body: unknown) {
    const b = body as { orderId?: string; paid?: boolean };
    if (!b.orderId) throw new Error("bad callback");
    if (b.paid) await this.markPaid(b.orderId);
    return { orderId: b.orderId, paid: Boolean(b.paid) };
  }
}

/** 当前实现：Mock。接入真实微信支付时替换这里即可。 */
export function getPaymentProvider(): PaymentProvider {
  return new MockPaymentProvider();
}
