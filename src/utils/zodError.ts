import { ZodError } from "zod";

export function zodError(err: any) {
  if (err instanceof ZodError) {
    return {
      message: "Validation error",
      issues: err.issues,
    };
  }
  return { message: err?.message ?? "Unknown error" };
}
