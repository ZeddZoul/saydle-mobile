import { z } from "zod";
import { VOICE_IDS } from "../config/voices.js";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Not a valid id.");

// The app still sends its local day with both calls. It is accepted and
// ignored: the server derives the reader's day from their stored timezone,
// because a day the client picks is a day the client can pick to its benefit.
const clientDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD.")
  .optional();

export const voiceSessionSchema = z
  .object({
    // More than seven is allowed in; the controller reads the first seven.
    // The ceiling stops a body of ten thousand ids reaching the database.
    affirmationIds: z.array(objectId).min(1, "No affirmations to read.").max(50),
    today: clientDay,
  })
  .strict();

export const voicePreferenceSchema = z
  .object({
    voice: z.enum(Object.keys(VOICE_IDS), {
      errorMap: () => ({ message: "That is not one of the voices." }),
    }),
    today: clientDay,
  })
  .strict();
