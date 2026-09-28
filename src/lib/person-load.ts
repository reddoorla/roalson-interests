import type { PersonDocument } from "../prismicio-types";
import { orNotFound } from "$lib/page-load";
import { personMeta } from "$lib/person-meta";

/** The minimal client surface the loader needs (see PageClient). */
export type PersonClient = {
  getByUID(type: "person", uid: string): Promise<PersonDocument>;
};

/** Load one `person` document and the layout's head payload for it. A miss is
 *  a 404; anything else stays loud (see orNotFound). */
export async function loadPerson(client: PersonClient, uid: string, url: URL) {
  const person = await orNotFound(client.getByUID("person", uid));
  return { person, ...personMeta(person, url) };
}
