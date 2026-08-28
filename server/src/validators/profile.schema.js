import { z } from "zod";
import { PROFILE_FIELDS } from "../config/profileFields.js";

// One zod schema per field, derived from the config. `null` clears a field;
// omitting it leaves it untouched. Membership is checked with refine rather than
// z.enum so the config can hold numbers and evolve freely.
function fieldSchema(f) {
  // Free text has no option list — just a length cap. It is trimmed here and
  // crisis-screened later, before it can reach the model.
  if (f.kind === "text") {
    return z
      .string()
      .trim()
      .max(f.maxLength ?? 300)
      .nullable();
  }

  const allowed = new Set(f.options);
  const inOptions = (v) => allowed.has(v);

  if (f.kind === "multi") {
    return z
      .array(z.union([z.string(), z.number()]).refine(inOptions, "Invalid option."))
      .max(f.options.length, "Too many options.")
      .transform((arr) => [...new Set(arr)]) // dedupe
      .nullable();
  }

  if (f.kind === "number") {
    return z.number().refine(inOptions, "Invalid option.").nullable();
  }

  return z.string().refine(inOptions, "Invalid option.").nullable();
}

const shape = Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, fieldSchema(f).optional()]));

export const profilePatchSchema = z
  .object(shape)
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });
