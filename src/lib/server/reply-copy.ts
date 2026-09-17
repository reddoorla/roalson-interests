import { createClient } from "$lib/prismicio";
import { resolveReplyCopy } from "@reddoorla/maintenance/forms/prismic";
import type { RequestEvent } from "@sveltejs/kit";

/**
 * Confirmation-email copy for one submission, read from Prismic on the server.
 *
 * Nothing is taken from the request. The form type is fixed by the action, and
 * the copy is looked up in the client's own CMS — so no text a visitor supplies
 * can reach an outbound email. That matters because the autoresponder mails a
 * submitter-supplied address; submitter-authored body copy would turn the
 * sending domain into a phishing relay.
 *
 * Never throws. `resolveReplyCopy` swallows CMS failures and answers undefined,
 * the caller then omits `_reply`, and the shared package sends its own
 * per-form-type default. A Prismic outage costs a tailored confirmation, never
 * the submission.
 *
 * Returns undefined until the client fills the `form replies` document, which
 * is the intended state for a freshly bootstrapped site.
 */
export async function replyCopyFor(event: RequestEvent, formType: string) {
  const client = createClient({ fetch: event.fetch });
  // The generated client's document type is a CLOSED union built from
  // `customtypes/`, so it cannot satisfy a `(type: string)` reader — and
  // `form_replies` is absent from that union until the model is pushed and
  // `prismicio-types.d.ts` is regenerated. This adapter is the one place that
  // gap is asserted, rather than loosening the shared type for every caller.
  // Safe because the resolver treats a missing document exactly as it treats an
  // unwritten one: nothing authored, fall back.
  const reader = {
    getSingle: (type: string) => client.getSingle(type as never),
    getByUID: (type: string, uid: string) => client.getByUID(type as never, uid),
  };
  return resolveReplyCopy(reader, { formType });
}
