<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  type FieldType = "text" | "email" | "tel" | "url" | "password" | "number" | "search" | "textarea";

  interface Props {
    name: string;
    label: string;
    type?: FieldType;
    value?: string;
    description?: string;
    error?: string;
    required?: boolean;
    autocomplete?: HTMLInputAttributes["autocomplete"];
    placeholder?: string;
    minlength?: number;
    maxlength?: number;
    pattern?: string;
    inputmode?: HTMLInputAttributes["inputmode"];
    rows?: number;
    /** Marks this control as the one a containing dialog should open onto.
     *  Modal.svelte looks for `[autofocus]` after showModal(); without it the
     *  native dialog-focusing steps land on the first focusable child, which is
     *  the ✕ — the exit. Only ever set it on ONE field per dialog, and only
     *  inside a dialog: on a plain page an autofocused control steals focus on
     *  load and skips whatever precedes it. */
    autofocus?: boolean;
  }

  let {
    name,
    label,
    type = "text",
    value = $bindable(""),
    description,
    error,
    required = false,
    autocomplete,
    placeholder,
    minlength,
    maxlength,
    pattern,
    inputmode,
    rows = 4,
    autofocus = false,
  }: Props = $props();

  const uid = $props.id();
  const inputId = `${uid}-input`;
  const descriptionId = `${uid}-description`;
  const errorId = `${uid}-error`;

  const describedBy = $derived(
    [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") ||
      undefined,
  );

  // One string, two controls: the input and the textarea carried the same class
  // list copy-pasted, which is exactly how a fix lands on one control and not
  // the other. Kept as a literal so Tailwind's source scan still sees every
  // class.
  //
  // `border-secondary` replaces `border-light`: --color-light is #e5e7eb, which
  // measures 1.20:1 against the white page — the fields read as invisible boxes
  // and a visitor has to hunt for where to type. --color-secondary (#6b7280) is
  // 4.83:1, clearing WCAG 1.4.11's 3:1 non-text minimum with room to spare.
  //
  // `focus:outline-hidden`, NOT `focus:outline-none`: in Tailwind v4 the latter
  // resolves to `outline-style: none` and takes the forced-colors fallback with
  // it. Under forced colours the engine drops the box-shadow ring, so that
  // transparent 2px outline is the only focus affordance left.
  const controlClass =
    "border-2 border-secondary rounded px-3 py-2 " +
    "transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none " +
    "focus:outline-hidden focus:border-primary focus:ring-2 focus:ring-primary " +
    "aria-invalid:border-red-600";
</script>

<div class="flex flex-col gap-1">
  <label for={inputId} class="text-sm font-medium">
    {label}
    {#if required}
      <span aria-hidden="true" class="text-red-600">*</span>
      <span class="sr-only">(required)</span>
    {/if}
  </label>

  {#if description}
    <p id={descriptionId} class="text-sm text-secondary">{description}</p>
  {/if}

  {#if type === "textarea"}
    <!-- svelte-ignore a11y_autofocus -->
    <textarea
      id={inputId}
      {name}
      {required}
      {rows}
      {placeholder}
      {minlength}
      {maxlength}
      {autocomplete}
      {autofocus}
      bind:value
      aria-describedby={describedBy}
      aria-invalid={error ? "true" : undefined}
      class={controlClass}></textarea>
  {:else}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      id={inputId}
      {type}
      {name}
      {required}
      {placeholder}
      {minlength}
      {maxlength}
      {pattern}
      {autocomplete}
      {inputmode}
      {autofocus}
      bind:value
      aria-describedby={describedBy}
      aria-invalid={error ? "true" : undefined}
      class={controlClass}
    />
  {/if}

  {#if error}
    <p id={errorId} role="alert" class="text-sm text-red-600">{error}</p>
  {/if}
</div>
