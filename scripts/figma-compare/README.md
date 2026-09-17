# figma-compare — measuring the site against the comp

The review standard for a comp-driven site is "match the Figma": at the comp's
own width, element positions, sizes and type within a few pixels. Eyeballing two
screenshots does not get there. These scripts compare numbers.

**Stand this up at `/figma-slices` Stage A, before the first slice.** That is the
whole point and it is easy to get wrong: on the site this harness came from it
was built on day three, after all 17 slices had merged, and immediately cost
three PRs re-doing pages already called done plus nine on a scroll mechanism it
would have specified once. Nothing it found required the site to exist — the
numbers were in the design file the whole time.

Nothing here is wired into CI. It is a session tool: run it before opening a PR
that touches layout or type, and read the report. The definition of done for a
comp site is a number, not a look.

| script            | what it does                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `pull-figma.mjs`  | Comp geometry (every node's box, fills, layout, sticky flag, text + resolved style) and 1x renders, from the REST API. |
| `extract-dom.mjs` | The rendered site the same way: every section, text run and image with its box and computed type, plus a screenshot.   |
| `compare.mjs`     | Matches text runs to comp text nodes by content and reports the deltas: size, weight, line-height, tracking, x, width. |
| `sidebyside.mjs`  | Comp crop beside site crop at one scale, for the eye.                                                                  |
| `sample.mjs`      | Pixel colours and inked-row positions in any PNG — measure a ground, a panel, or the pitch between lines.              |
| `ink.mjs`         | Where a label's ink sits inside its box, at 4x — the number behind "the text looks low".                               |

```sh
D=/tmp/compare
FIGMA_PAT=… FIGMA_FILE=<file key> node scripts/figma-compare/pull-figma.mjs $D home=<node-id> about=<node-id>
pnpm build && pnpm preview --port 4173 &
BASE=http://localhost:4173 OUT=$D node scripts/figma-compare/extract-dom.mjs
node scripts/figma-compare/compare.mjs $D home
```

`pnpm build && pnpm preview`, not `pnpm dev` — deliberately. The dev server does
not merely fail to reproduce some defects, it hides them: scroll-driven and
hydration-dependent components have rendered correctly under `vite dev` and
wrongly in the shipped bundle, and fonts load by a different CSP directive in
each.

Keep `FIGMA_PAT` and the file key in the environment. Site repos are public.

## The two things it finds that a screenshot cannot

Both are absent from `get_design_context`'s output shape and invisible in
`get_screenshot`, and between them they drive most of the deltas on a
typographic comp. Look for them at Stage A and report them in the inventory.

- **Figma trims text boxes to cap height and baseline** on some faces. A 12px
  label then reports an 8px box and a 60px line a 42px one — so every gap the
  comp specifies is cap-to-baseline, not box-to-box. Measure which faces are
  trimmed, then give the site `t-*` utilities in `app.css` that encode the comp's
  text styles once, so a slice takes a style by name instead of re-deriving it.
  Body copy and button labels are usually not trimmed; check rather than assume.
  The trim is a property of the text STYLE, not the family — the REST API
  reports it as `style.leadingTrim: "CAP_HEIGHT"`, and `pull-figma.mjs`
  records it as `trim` on every text node. The measured write-up, with the
  CSS that matches it, is
  [figma-cap-height-trim.md](https://github.com/reddoorla/vida-legacy-foundation/blob/main/docs/figma-cap-height-trim.md)
  in the site that found it.
- **Prototype sticky scrolls** — bands the comp pins so the next slides over
  them. `pull-figma.mjs` reports the flag. This is a whole-page mechanism, not a
  slice property, so nothing in a per-slice loop will look for it, and
  retrofitting it after the slices are merged is where the rework lives.
