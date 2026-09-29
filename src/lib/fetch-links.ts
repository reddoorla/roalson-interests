// The page query's `fetchLinks`, read off this repo's slice models (#179).
//
// A slice model can name the fields of a linked document it needs —
// `customtypes: [{ id: "person", fields: ["name", …] }]` on a Link — and the
// Content API then embeds them in the relationship. But it answers from the
// REPOSITORY's copy of the model, which the prismic-models workflow pushes on
// merge, while Netlify is already building: a model change and the code that
// reads it land in a race, and a page prerendered on the losing side drops
// every card whose fields did not arrive.
//
// `fetchLinks` asks for the same fields in the query itself. It is all or
// nothing: a query's `fetchLinks` REPLACES every model's list, it does not add
// to them. Measured 2026-09-29 on the live `home` document: with only the four
// person fields asked for, each featured pick came back with `data: {}`; with
// the featured fields asked for too, the picks' data was deep-equal to what
// the model alone embeds. So the list is EVERY model's, built from the models
// themselves: one source, and no dependence on the push having landed.
//
// A nested group in a model's list (`{ id: "highlights", fields: ["text"] }`)
// is asked for whole (`property.highlights`): `property.highlights.text` came
// back with no highlights at all (measured the same day), and the deep-equal
// comparison above was made with the whole group.

/** The parts of a Slice Machine model this reads. */
interface Field {
  type?: string;
  config?: {
    fields?: Record<string, Field>;
    customtypes?: (string | { id: string; fields?: (string | { id: string })[] })[];
  };
}
interface SliceModel {
  variations?: { primary?: Record<string, Field>; items?: Record<string, Field> }[];
}

function collect(fields: Record<string, Field> | undefined, into: Set<string>) {
  for (const field of Object.values(fields ?? {})) {
    if (field.type === "Group") collect(field.config?.fields, into);
    if (field.type !== "Link") continue;
    for (const type of field.config?.customtypes ?? []) {
      if (typeof type === "string") continue;
      for (const picked of type.fields ?? [])
        into.add(`${type.id}.${typeof picked === "string" ? picked : picked.id}`);
    }
  }
}

/** Every `<type>.<field>` the models' content relationships ask for, sorted. */
export function fetchLinksOf(models: readonly SliceModel[]): string[] {
  const into = new Set<string>();
  for (const model of models)
    for (const variation of model.variations ?? []) {
      collect(variation.primary, into);
      collect(variation.items, into);
    }
  return [...into].sort();
}

const sliceModels = import.meta.glob<SliceModel>("./slices/*/model.json", {
  eager: true,
  import: "default",
});

/** What `loadPage` asks the Content API to embed, for every slice there is. */
export const PAGE_FETCH_LINKS = fetchLinksOf(Object.values(sliceModels));
