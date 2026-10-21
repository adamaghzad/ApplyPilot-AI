import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

import { UnauthorizedError } from "@/lib/auth/session";

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message = "Invalid request", details?: unknown) => new ApiError(message, 400, details);
export const notFound = (message = "Not found") => new ApiError(message, 404);
export const forbidden = (message = "Forbidden") => new ApiError(message, 403);
export const conflict = (message = "Conflict") => new ApiError(message, 409);
export const tooManyRequests = (message = "Rate limit exceeded") => new ApiError(message, 429);

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(error: unknown) {
  if (error instanceof ZodError) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", details: error.flatten() },
      { status: 422 },
    );
  }
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 401 });
  }
  if (error instanceof ApiError) {
    return NextResponse.json({ ok: false, error: error.message, details: error.details }, { status: error.status });
  }
  console.error("[api] unhandled error:", error);
  return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
}

/**
 * Wraps a route handler: validates the body against `schema`, normalises thrown
 * errors into JSON responses, and guarantees a stable `{ ok, data | error }` envelope.
 */
export function route<Ctx, Body = unknown>(
  handler: (input: { body: Body; req: Request; ctx: Ctx; raw: unknown }) => Promise<Response> | Promise<unknown>,
  options?: { schema?: ZodSchema<Body>; auth?: boolean },
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      let parsed: Body | undefined;
      if (options?.schema && req.method !== "GET" && req.method !== "HEAD") {
        const raw = await req.json().catch(() => ({}));
        parsed = options.schema.parse(raw) as Body;
      }
      const result = await handler({ body: parsed as Body, req, ctx, raw: parsed });
      if (result instanceof Response) return result;
      return NextResponse.json({ ok: true, data: result });
    } catch (error) {
      return fail(error);
    }
  };
}

export function parseBody<T>(raw: unknown, schema: ZodSchema<T>): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw result.error;
  return result.data;
}
