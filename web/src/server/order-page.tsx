import { notFound } from "next/navigation";
import { pageActor } from "./page-auth";
import { db } from "./db";
import { paymentForOrder } from "./payments";
import { jsonSafe } from "@/lib/api";
import { OrderDetail } from "@/components/checkout";
export async function renderOrder(id: string, resultPage = false) {
  const user = await pageActor();
  const order = await db.order.findFirst({
    where: { id, userId: user.id },
    include: {
      items: true,
      payments: true,
      license: { select: { id: true, status: true } },
    },
  });
  if (!order) notFound();
  return (
    <OrderDetail
      resultPage={resultPage}
      initial={jsonSafe({
        ...order,
        status:
          order.status === "PENDING" && order.expiresAt.getTime() < Date.now()
            ? "EXPIRED"
            : order.status,
        payment: paymentForOrder(order),
      })}
    />
  );
}
