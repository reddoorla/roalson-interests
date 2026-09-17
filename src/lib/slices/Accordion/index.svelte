<script lang="ts">
  import Accordion from "$lib/components/Accordion.svelte";
  import ContentBand from "$lib/components/ContentBand.svelte";

  // Thin slice over the shared, already-accessible Accordion primitive
  // ($lib/components/Accordion.svelte — button[aria-expanded]+aria-controls,
  // role=region, index-keyed). Body is plain text to match the primitive.
  type Item = { title?: string | null; body?: string | null };
  type Props = {
    slice: {
      slice_type: string;
      variation?: string;
      primary: {
        allowMultiple?: boolean | null;
        items: Item[];
      };
    };
  };
  let { slice }: Props = $props();

  const items = $derived(
    (slice.primary.items ?? []).map((i) => ({
      label: i.title ?? "",
      content: i.body ?? "",
    })),
  );
</script>

<ContentBand
  sliceType={slice.slice_type}
  variation={slice.variation}
  contentClass="max-w-3xl px-6 py-10"
>
  <Accordion {items} allowMultiple={slice.primary.allowMultiple ?? true} />
</ContentBand>
