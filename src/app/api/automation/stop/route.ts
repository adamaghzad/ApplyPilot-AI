import { dbReady } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { emergencyStop } from "@/lib/services/applications";
import { fail, ok } from "@/lib/api";

/** Emergency stop: cancels every pending task for the user. */
export async function POST() {
  try {
    await dbReady();
    const user = await requireUser();
    const result = await emergencyStop(user.id);
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}
