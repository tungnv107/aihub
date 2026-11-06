import type { publicData, customerData, adminOverview } from "@/server/queries";
export type Wire<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;
export type PublicData = Wire<Awaited<ReturnType<typeof publicData>>>;
export type CustomerData = Wire<Awaited<ReturnType<typeof customerData>>>;
export type AdminOverviewData = Wire<Awaited<ReturnType<typeof adminOverview>>>;
