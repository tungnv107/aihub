import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { env } from "@/server/env";
export default function Page() {
  return (
    <Suspense>
      <AuthForm mode="register" googleEnabled={!!env.GOOGLE_CLIENT_ID} />
    </Suspense>
  );
}
