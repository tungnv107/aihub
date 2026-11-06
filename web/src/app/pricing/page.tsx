import { cookies } from "next/headers";
import { Marketing } from "@/components/marketing";
import { publicData } from "@/server/queries";
import { jsonSafe } from "@/lib/api";
export default async function Pricing() {
  return (
    <Marketing
      pricingOnly
      data={jsonSafe(await publicData((await cookies()).get("locale")?.value))}
    />
  );
}
