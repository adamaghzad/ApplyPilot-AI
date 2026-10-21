import { destroySession } from "@/lib/auth/session";
import { fail, ok } from "@/lib/api";

export async function POST() {
  try {
    await destroySession();
    return ok({ success: true });
  } catch (error) {
    return fail(error);
  }
}
