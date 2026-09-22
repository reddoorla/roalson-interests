<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { revealInvalid } from "$lib/utils/reveal";

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
  // THE SKIN IS DERIVED, NOT TRANSCRIBED. The comp draws no form control
  // anywhere — 5642 nodes on the Designs page, none named input, field,
  // textarea, select or placeholder — so this is the comp's only OUTLINED
  // control, `button dark` (4840:368: square, 1px garnet stroke, no fill), worn
  // as a field: `border border-primary bg-transparent`, no radius (preflight
  // already zeroes it; no `rounded-*` here keeps it that way), Body 1 inside.
  // 24 line + 22 padding + 2 border = 48px tall; never below 16px type, or iOS
  // Safari zooms the page on focus.
  //
  // A LIGHT-GROUND control: garnet border, text and ring are 10.07:1 on the
  // page's off-white, 8.87:1 on sand, 11.55:1 on white — and 1:1 on garnet.
  // The template's border was `border-secondary` because ITS `--color-light`
  // measured 1.20:1 on white; this palette's resting border clears WCAG
  // 1.4.11's 3:1 by a factor of three, and Field.test.ts holds it to a token
  // that does.
  //
  // Focus: the 1px border gains a 2px ring of the same garnet outside it — a
  // 3px frame, and the ring's own pixels go off-white → garnet (10.07:1).
  // `error` against `primary` is only 1.79:1, so an invalid border is never the
  // sole signal: the `role="alert"` message below always accompanies it.
  // `aria-invalid:focus:ring-error` carries two variants, so it beats
  // `focus:ring-primary` on specificity rather than on stylesheet order.
  //
  // `focus:outline-hidden`, NOT `focus:outline-none`: in Tailwind v4 the latter
  // resolves to `outline-style: none` and takes the forced-colors fallback with
  // it. Under forced colours the engine drops the box-shadow ring, so that
  // transparent 2px outline is the only focus affordance left.
  const controlClass =
    "t-body-1 border border-primary bg-transparent px-4 py-[11px] text-primary " +
    "placeholder:text-secondary " +
    "transition-[border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none " +
    "focus:outline-hidden focus:ring-2 focus:ring-primary " +
    "aria-invalid:border-error aria-invalid:focus:ring-error";

  // `oninvalid={revealInvalid}` on both controls: native validation is the only
  // validation some forms here have (/contact), and the browser's focus on the
  // control it refuses can lose a race with a glide in flight and end under the
  // pinned bar — $lib/utils/reveal has the measurement. `html`'s scroll padding
  // (app.css) covers every landing the browser makes from rest; this covers the
  // one it makes mid-glide, and lands the field LABEL first. Without script
  // there is no handler — and no pinned bar for the field to end under.
</script>

<div class="flex flex-col gap-2.5">
  <label for={inputId} class="t-h6 text-primary">
    {label}
    {#if required}
      <span aria-hidden="true" class="text-error">*</span>
      <span class="sr-only">(required)</span>
    {/if}
  </label>

  {#if description}
    <p id={descriptionId} class="t-body-2 text-secondary">{description}</p>
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
      oninvalid={revealInvalid}
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
      oninvalid={revealInvalid}
      aria-describedby={describedBy}
      aria-invalid={error ? "true" : undefined}
      class={controlClass}
    />
  {/if}

  {#if error}
    <p id={errorId} role="alert" class="t-body-2 text-error">{error}</p>
  {/if}
</div>
