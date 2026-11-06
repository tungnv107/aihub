import { pageActor } from "@/server/page-auth";
import { publicData } from "@/server/queries";
import { jsonSafe } from "@/lib/api";
import { Checkout } from "@/components/checkout";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; renew?: string }>;
}) {
  const user = await pageActor(),
    params = await searchParams;
  return (
    <Checkout
      user={{ name: user.name, email: user.email }}
      data={jsonSafe(await publicData(user.locale))}
      planId={params.plan}
      renewalId={params.renew}
    />
  );
}
