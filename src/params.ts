import { defineParams } from "@sveltejs/kit/params";

// Kit 3 reads every param matcher from this one file (kit 2: one file per
// matcher under src/params/). A matcher returns the value, or undefined for
// no match. `[[preview=preview]]` matches only the literal segment "preview".
export const params = defineParams({
  preview: (param) => (param === "preview" ? param : undefined),
});
