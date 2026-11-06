import { renderOrder } from "@/server/order-page";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return renderOrder((await params).id);
}
