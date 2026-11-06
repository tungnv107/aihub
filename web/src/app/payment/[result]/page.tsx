import { notFound, redirect } from "next/navigation";
import { renderOrder } from "@/server/order-page";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ result: string }>;
  searchParams: Promise<{ order?: string }>;
}) {
  if (!["success", "failed"].includes((await params).result)) notFound();
  const { order } = await searchParams;
  if (!order) redirect("/dashboard/billing");
  return renderOrder(order, true);
}
