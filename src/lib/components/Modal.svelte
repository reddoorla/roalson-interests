<script lang="ts">
  import { X } from "@lucide/svelte";
  import { tick, type Snippet } from "svelte";

  interface ModalProps {
    open: boolean;
    onclose?: () => void;
    /** Accessible name for the dialog. Children arrive as an opaque snippet, so
     *  the component cannot derive one — pass `label` or `labelledby`. */
    label?: string;
    /** id of an element inside the modal (usually its heading) that names it. */
    labelledby?: string;
    class?: string;
    children?: Snippet;
  }

  let {
    open = $bindable(false),
    onclose,
    label,
    labelledby,
    class: passedClasses = "",
    children,
  }: ModalProps = $props();

  let dialogEl: HTMLDialogElement | undefined = $state();

  // No use:trapFocus here: showModal() already gives native focus containment,
  // Escape handling, and focus restore — adding the action would double-trap.
  $effect(() => {
    if (!dialogEl) return;
    if (open && !dialogEl.open) {
      dialogEl.showModal();
      void focusInitial();
    } else if (!open && dialogEl.open) {
      dialogEl.close();
    }
  });

  /** showModal() runs the spec's dialog-focusing steps against the DOM as it
   *  exists at that instant: first `[autofocus]` descendant, else the first
   *  focusable one — which here is the ✕, i.e. the exit. Two things break the
   *  native path on its own, so the choice is re-asserted one tick later:
   *
   *  (1) a consumer whose autofocus target only appears on the NEXT render (a
   *      form that resets itself in its own $effect is absent for one tick when
   *      the modal is reopened), and
   *  (2) jsdom, where Modal.test.ts's showModal polyfill only flips the
   *      attribute and moves no focus at all.
   *
   *  One tick is short enough that this cannot yank focus away from a user, and
   *  nothing happens at all unless the content names a target — the component
   *  never invents one. */
  async function focusInitial() {
    await tick();
    const el = dialogEl;
    if (!el?.open) return;
    const target = el.querySelector<HTMLElement>("[autofocus]");
    if (target && document.activeElement !== target) target.focus();
  }

  // Scroll lock. `showModal()` puts the dialog in the top layer but does NOT
  // stop the document behind it scrolling. On a phone that reads as the modal
  // having closed, because the page starts sliding past behind it.
  //
  // `overflow: hidden` on <body> (not documentElement, and not `position:
  // fixed`): body's overflow propagates to the viewport while html's is
  // `visible`, and unlike the position:fixed technique it neither loses the
  // scroll position nor changes the containing block for absolute descendants
  // — which matters, because site headers in this template are fixed/absolute.
  //
  // Keyed on `open`, so Svelte runs the teardown on EVERY close path (Escape,
  // backdrop, ✕ — all of them route through `open = false`) and on unmount. A
  // lock that outlives its modal leaves the page permanently unscrollable,
  // which is a worse bug than the one being fixed.
  $effect(() => {
    if (!open || typeof document === "undefined") return;
    const body = document.body;
    const previousOverflow = body.style.overflow;
    const previousPaddingRight = body.style.paddingRight;
    // Classic-scrollbar environments lose the scrollbar's width when the
    // document stops scrolling; pay it back as padding so the page behind
    // doesn't jump sideways as the modal opens.
    const gutter = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gutter > 0) body.style.paddingRight = `${gutter}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;
    };
  });

  function close() {
    open = false;
    onclose?.();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogEl) close();
  }
</script>

<!-- `m-auto` is load-bearing, not decoration: Tailwind preflight's `*{margin:0}`
     beats the UA's `dialog{margin:auto}`, and with the UA's `inset:0` still in
     force that pinned the dialog to the top-left corner — measured at 1280x720,
     the open dialog sat with gaps of 16px left and 752px right, the 16px being
     the old `mx-4` and nothing else. Restoring auto margins against `inset:0`
     is what centres it on BOTH axes.
     `w-[calc(100%-2rem)]` keeps the 16px side gutter `mx-4` used to provide,
     without the overflow `w-full mx-4` caused below 544px (width resolved
     against the containing block, then the margins added on top of it). -->
<dialog
  bind:this={dialogEl}
  onclose={close}
  onclick={handleBackdropClick}
  aria-label={label}
  aria-labelledby={labelledby}
  class="m-auto w-[calc(100%-2rem)] max-w-lg bg-transparent p-0 backdrop:bg-black/50 backdrop:backdrop-blur-sm open:animate-[fade-in_200ms_ease-out]"
>
  <div
    class="relative bg-white rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto {passedClasses}"
  >
    <!-- 44px hit target around the 20px glyph (WCAG 2.5.8); same pattern as Nav.svelte. -->
    <button
      type="button"
      onclick={close}
      class="absolute top-2 right-2 flex min-h-11 min-w-11 items-center justify-center text-dark/60 hover:text-dark transition cursor-pointer"
      aria-label="Close"
    >
      <X size={20} />
    </button>
    <div class="p-8">
      {@render children?.()}
    </div>
  </div>
</dialog>

<style>
  @keyframes fade-in {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
