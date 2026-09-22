import { env } from "$env/dynamic/private";
import { createIngestAction } from "@reddoorla/maintenance/forms";
import { OFFICE } from "$lib/office";
import { replyCopyFor } from "$lib/server/reply-copy";
import type { Actions, PageServerLoad } from "./$types";

// The root layout sets `prerender = "auto"`; a form `action` cannot run on a
// prerendered route ("Cannot prerender pages with actions"). Opt out — this
// route is genuinely dynamic.
export const prerender = false;

// Plant a per-request timestamp for the bot timing screen. `title` and
// `meta_description` flow to the root layout's <Seo> (static routes set head
// via data, not their own tags).
export const load: PageServerLoad = () => ({
  formTs: Date.now(),
  title: "Contact Us",
  meta_description: `Contact Roalson Interests about commercial real estate in San Antonio and across Texas — call ${OFFICE.phone.display} or send us a message.`,
  // The page opens on PageMasthead, which runs UNDER the bar (Nav.svelte), so
  // the bar floats over it. A literal on purpose: src/routes/nav-over.test.ts
  // reads this file for it and holds the claim to the page's markup in both
  // directions. `load` re-runs after the action, with and without script, so
  // the success and failure renders keep the floating bar too.
  navOver: "dark" as const,
  // The top of that band, for the ground above the document (`.canvas-top` in
  // app.css): PageMasthead's gradient starts on garnet (`from-primary`).
  canvasTop: "primary" as const,
});

export const actions: Actions = {
  default: createIngestAction({
    formType: "contact",
    getConfig: () => ({
      url: env.FORMS_INGEST_URL,
      token: env.FORMS_INGEST_TOKEN,
    }),
    // Copy only. The package's defaults end "Please email us directly", and
    // this site prints no email address anywhere — the comp has none (0 of 5642
    // nodes) and the operator has not supplied one. The phone is the one other
    // way in, so both messages name it, from the office module.
    unavailableMessage: `This form is temporarily unavailable. Please call us at ${OFFICE.phone.display}.`,
    errorMessage: `Something went wrong sending your message. Please try again, or call us at ${OFFICE.phone.display}.`,
    buildPayload: async (form, event) => ({
      name: form.get("name")?.toString(),
      email: form.get("email")?.toString(),
      phone: form.get("phone")?.toString(),
      message: form.get("message")?.toString(),
      // Full URL incl. query string so UTM/campaign params (?utm_source=…) are captured.
      sourceUrl: event.url.href,
      // Synthetic end-to-end probe marker (the fleet `form-e2e` audit). Forwarded
      // ONLY when the submitted form carries testMode=true — a real visitor never
      // sets it. Rides through as an extraField (no schema change); central ingest
      // recognizes it and routes the submission away from every real sink.
      testMode: form.get("testMode")?.toString() === "true" || undefined,
      // Confirmation-email copy the client wrote in Prismic, resolved
      // server-side. Undefined until they fill the `form replies` document —
      // the shared package then sends its own per-form-type default, so a
      // freshly bootstrapped site still replies sensibly.
      _reply: await replyCopyFor(event, "contact"),
    }),
  }),
};
