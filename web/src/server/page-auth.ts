import { redirect } from "next/navigation";
import { actor, requireRole } from "./auth";
import { ApiError } from "./security";
export async function pageActor(admin = false) {
  try {
    const user = await actor();
    if (admin) requireRole(user, "ADMIN");
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/login");
    if (error instanceof ApiError && error.status === 403)
      redirect(
        error.code === "insufficient_permissions"
          ? "/dashboard?access=denied"
          : "/login?access=denied",
      );
    throw error;
  }
}
