import { cleanup, render, within } from "@testing-library/svelte";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Content } from "@prismicio/client";

import {
  PARTNER_BIO_FIXTURE,
  PARTNER_PHOTO_FIXTURE,
  partnerFixture,
  partnersFixture,
  partnersFixtureState,
} from "$lib/home-fixture";
import { components } from "$lib/slices";
import Partners from "./index.svelte";

afterEach(cleanup);

// jsdom resolves no stylesheets: whether a bio SHOWS, where the blocks sit and
// how big a target is are tests/interaction/partners.spec.ts's. What is checked
// here is what the markup says — what renders for which fields, in what order,
// under what names.

const section = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slice-type="partners"]')!;
const cards = (container: HTMLElement) => [
  ...section(container).querySelectorAll<HTMLElement>("[data-partner]"),
];

const withBio = () =>
  partnersFixture({
    partners: [
      partnerFixture({ bio: PARTNER_BIO_FIXTURE } as never),
      partnerFixture({ name: "Bart Wilson" }),
    ],
  });

describe("Partners slice — the band", () => {
  it("is registered, so a SliceZone renders it rather than a TodoComponent", () => {
    expect(components.partners).toBe(Partners);
  });

  it("stands on the off-white ground and is named by its headline", () => {
    const { container, getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const root = section(container);
    expect(root.getAttribute("data-slice-variation")).toBe("default");
    expect(root.className).toContain("bg-background");
    const h2 = getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe("Representing Your Best Interests in Acquisition and Disposition");
    expect(h2.className).toContain("t-h2");
    expect(h2.className).toContain("max-w-[586px]");
    expect(root.getAttribute("aria-labelledby")).toBe(h2.id);
  });

  it("sets the eyebrow as a <p> — the band's only heading is the headline", () => {
    const { container, getAllByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const eyebrow = section(container).querySelector("p")!;
    expect(eyebrow.textContent).toBe("Our legacy");
    expect(eyebrow.className).toContain("t-h5");
    expect(eyebrow.className).toContain("text-primary");
    // The cards come first in the DOM, so a partner's name must not be a
    // heading: an h3 ahead of this band's h2 belongs, in the outline, to the
    // PREVIOUS band's h2. This is the only guard. axe's heading-order was tried
    // and passes with the names as h3s — the hero's "Our specialty" h2 precedes
    // them on the homepage, and h2 → h3 skips no level.
    expect(getAllByRole("heading").map((h) => h.tagName)).toEqual(["H2"]);
  });

  it("puts the cards BEFORE the text in the DOM, and reorders nothing with CSS", () => {
    const { container, getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const list = getByRole("list");
    const h2 = getByRole("heading", { level: 2 });
    expect(list.compareDocumentPosition(h2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The 390 comp's order IS the DOM's; from `lg` the grid places the first
    // child left. An `order-*` here would split focus order from what is drawn.
    expect(section(container).innerHTML).not.toMatch(/\border-(first|last|none|\d)/);
  });

  it("uses the site's one grid and caps the LEFT column at the comp's 371", () => {
    const { container, getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const grid = section(container).querySelector(".lg\\:grid")!;
    expect(grid.className).toContain("lg:grid-cols-[397fr_847fr]");
    expect(grid.className).toContain("lg:gap-9");
    expect(getByRole("list").parentElement!.className).toContain("lg:max-w-[371px]");
  });

  it("renders the body's paragraphs on the comp's measure, a blank line apart", () => {
    const { container } = render(Partners, { props: { slice: partnersFixture() } });
    const body = section(container).querySelector<HTMLElement>("[data-partners-body]")!;
    const paragraphs = [...body.querySelectorAll("p")];
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].textContent).toMatch(/^Roalson Interests was formed in 1983\./);
    expect(paragraphs[1].textContent).toMatch(/San Antonio and South Texas\.$/);
    expect(body.className).toContain("t-body-1");
    expect(body.className).toContain("max-w-[519px]");
    expect(body.className).toContain("[&_p+p]:mt-6");
  });

  it("draws no buttons — the comp has none — until an editor fills them", () => {
    const bare = render(Partners, { props: { slice: partnersFixture() } });
    expect(bare.queryByRole("link", { name: /portfolio/i })).toBeNull();
    // Every link in the launch state is a partner's CONTACT.
    expect(bare.getAllByRole("link").map((a) => a.textContent?.trim())).toEqual([
      "Contact Matt Howard",
      "Contact Bart Wilson",
    ]);
    cleanup();

    const slice = partnersFixture({
      buttons: [
        { label: "No link", link: { link_type: "Any" } },
        { label: "Our portfolio", link: { link_type: "Web", url: "https:///properties" } },
        { label: "Contact us", link: { link_type: "Web", url: "/contact" } },
        { label: "Third", link: { link_type: "Web", url: "/third" } },
      ],
    } as never);
    const filled = render(Partners, { props: { slice } });
    const portfolio = filled.getByRole("link", { name: "Our portfolio" });
    expect(portfolio.getAttribute("href")).toBe("/properties");
    // The garnet tone — the one for a light ground.
    expect(portfolio.className).toContain("border-primary");
    expect(filled.getByRole("link", { name: "Contact us" }).getAttribute("href")).toBe("/contact");
    expect(filled.queryByRole("link", { name: "Third" })).toBeNull();
    expect(filled.queryByRole("link", { name: "No link" })).toBeNull();
  });

  it("drops the card column when there are no partners, and the text column when there is no text", () => {
    const noCards = render(Partners, {
      props: { slice: partnersFixture({ eyebrow: "", partners: [] } as never) },
    });
    expect(noCards.queryByRole("list")).toBeNull();
    expect(noCards.getByRole("heading", { level: 2 })).toBeTruthy();
    cleanup();

    const noText = render(Partners, {
      props: { slice: partnersFixture({ heading: [], body: [], buttons: [] } as never) },
    });
    expect(noText.queryByRole("heading")).toBeNull();
    expect(section(noText.container).hasAttribute("aria-labelledby")).toBe(false);
    expect(noText.getAllByRole("listitem").length).toBe(2);
  });

  it("tolerates a slice whose fields are all empty", () => {
    const empty = {
      slice_type: "partners",
      variation: "default",
      primary: { eyebrow: null, heading: [], body: [], buttons: [], partners: [] },
      items: [],
    } as unknown as Content.PartnersSlice;
    const { container, queryByRole } = render(Partners, { props: { slice: empty } });
    expect(section(container)).not.toBeNull();
    expect(queryByRole("heading")).toBeNull();
    expect(queryByRole("list")).toBeNull();
    expect(queryByRole("link")).toBeNull();
  });
});

describe("Partners slice — a card", () => {
  it("lists the partners under the eyebrow's name: name, role, in the editor's order", () => {
    const { getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const list = getByRole("list", { name: "Our legacy" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector(".t-h3")?.textContent)).toEqual([
      "Matt Howard",
      "Bart Wilson",
    ]);
    expect(items.map((li) => li.querySelector(".t-h4")?.textContent)).toEqual([
      "Partner",
      "Partner",
    ]);
    for (const li of items) {
      expect(li.querySelector(".t-h3")!.className).toContain("text-dark");
      expect(li.querySelector(".bg-light"), "the sand panel").not.toBeNull();
    }
  });

  it("drops a row with no name, and a blank role's line", () => {
    const slice = partnersFixture({
      partners: [
        partnerFixture({ name: "  " }),
        partnerFixture({ name: null } as never),
        partnerFixture({ name: "Bart Wilson", role: " " }),
      ],
    });
    const { container } = render(Partners, { props: { slice } });
    expect(cards(container).length).toBe(1);
    expect(cards(container)[0].querySelector(".t-h3")?.textContent).toBe("Bart Wilson");
    expect(cards(container)[0].querySelector(".t-h4")).toBeNull();
  });

  it("sends CONTACT to /contact when the editor has set no link (operator call 12)", () => {
    const { getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    expect(getByRole("link", { name: "Contact Matt Howard" }).getAttribute("href")).toBe(
      "/contact",
    );
    expect(getByRole("link", { name: "Contact Bart Wilson" }).getAttribute("href")).toBe(
      "/contact",
    );
  });

  it("sends CONTACT where the editor said, through cms-href, whatever shape was stored", () => {
    const slice = partnersFixture({
      partners: [
        partnerFixture({
          contact_link: { link_type: "Web", url: "mailto:partner@example.com" },
        } as never),
        partnerFixture({
          name: "Bart Wilson",
          contact_link: { link_type: "Web", url: "https://www.roalson.com/contact?who=bart" },
        } as never),
        partnerFixture({
          name: "A Third",
          contact_link: { link_type: "Web", url: "tel:+12104965800" },
        } as never),
      ],
    });
    const { getByRole } = render(Partners, { props: { slice } });
    expect(getByRole("link", { name: "Contact Matt Howard" }).getAttribute("href")).toBe(
      "mailto:partner@example.com",
    );
    // The client's own domain, pasted: reduced to the path, so a preview build
    // does not send its visitor to production.
    expect(getByRole("link", { name: "Contact Bart Wilson" }).getAttribute("href")).toBe(
      "/contact?who=bart",
    );
    expect(getByRole("link", { name: "Contact A Third" }).getAttribute("href")).toBe(
      "tel:+12104965800",
    );
  });

  it("names each CONTACT for its partner — two links reading 'Contact' are one name twice", () => {
    const { getAllByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const names = getAllByRole("link").map((a) => a.textContent?.trim());
    expect(new Set(names).size).toBe(names.length);
    // WCAG 2.5.3: the drawn label opens the accessible name.
    for (const name of names) expect(name).toMatch(/^Contact /);
  });

  it("gives every text link the padded 24px target, with the ramp class on an INNER element", () => {
    const { container } = render(Partners, { props: { slice: withBio() } });
    const targets = [
      ...section(container).querySelectorAll<HTMLElement>("[data-partner-links] > a, summary"),
    ];
    expect(targets.length).toBe(3);
    for (const target of targets) {
      const classes = target.className.split(/\s+/);
      expect(classes).toEqual(expect.arrayContaining(["py-2", "-my-2"]));
      // `t-h5` carries its own margin-block; on the padded element it would
      // fight `-my-2` for one property.
      expect(classes).not.toContain("t-h5");
      expect(target.querySelector(".t-h5")).not.toBeNull();
    }
  });

  it("ships the Figma export's arrow bytes on every text link, not a redraw and not ArrowRight", () => {
    const { container } = render(Partners, { props: { slice: withBio() } });
    const arrows = [...section(container).querySelectorAll<SVGElement>("[data-partner-links] svg")];
    // PROFILE + CONTACT on the first card, CONTACT on the second.
    expect(arrows.length).toBe(3);
    for (const arrow of arrows) {
      expect(arrow.getAttribute("viewBox")).toBe("0 0 11 8");
      expect(arrow.getAttribute("aria-hidden")).toBe("true");
      expect(arrow.getAttribute("fill")).toBe("currentColor");
      const paths = arrow.querySelectorAll("path");
      expect(paths.length).toBe(1);
      const d = paths[0].getAttribute("d")!;
      // sha256 of the `d` exported from 6822:501 (PROFILE's arrow) — and, byte
      // for byte, from 6822:504 (CONTACT's). 179 characters.
      expect(d.length).toBe(179);
      expect(createHash("sha256").update(d).digest("hex")).toBe(
        "dd219714cd2519a16d161dbb2daa04d095fea68a97747503af8d0c45f2b19c43",
      );
    }
  });
});

describe("Partners slice — PROFILE and the bio", () => {
  it("WITHOUT a bio renders no PROFILE at all: no <details>, no <summary>, no bio region", () => {
    const { container, queryByText } = render(Partners, { props: { slice: partnersFixture() } });
    const root = section(container);
    expect(root.querySelector("details")).toBeNull();
    expect(root.querySelector("summary")).toBeNull();
    expect(root.querySelector("[data-partner-bio]")).toBeNull();
    expect(queryByText(/profile/i)).toBeNull();
  });

  it("treats an empty paragraph as no bio — what the editor leaves behind after deleting one", () => {
    const slice = partnersFixture({
      partners: [partnerFixture({ bio: [{ type: "paragraph", text: "", spans: [] }] } as never)],
    });
    const { container } = render(Partners, { props: { slice } });
    expect(section(container).querySelector("details")).toBeNull();
    expect(section(container).querySelector("[data-partner-bio]")).toBeNull();
  });

  it("WITH a bio renders PROFILE as a native <details>/<summary>, closed, on that card only", () => {
    const { container } = render(Partners, { props: { slice: withBio() } });
    const [matt, bart] = cards(container);

    const details = matt.querySelector("details")!;
    expect(details).not.toBeNull();
    expect(details.hasAttribute("open")).toBe(false);
    const summary = details.querySelector("summary")!;
    expect(summary.textContent?.trim()).toBe("Profile, Matt Howard");
    // PROFILE comes before CONTACT, as drawn.
    const links = matt.querySelector("[data-partner-links]")!;
    expect([...links.children].map((el) => el.tagName)).toEqual(["DETAILS", "A"]);

    expect(bart.querySelector("details")).toBeNull();
    expect(bart.querySelector("[data-partner-bio]")).toBeNull();
    expect(bart.querySelector("a")?.textContent?.trim()).toBe("Contact Bart Wilson");
  });

  it("holds the bio in the markup from the start, OUTSIDE the <details>, at the card's full width", () => {
    const { container } = render(Partners, { props: { slice: withBio() } });
    const [matt] = cards(container);
    const bio = matt.querySelector<HTMLElement>("[data-partner-bio]")!;
    expect(bio).not.toBeNull();
    expect(bio.querySelectorAll("p").length).toBe(2);
    expect(bio.textContent).toContain("Fixture copy, not a biography.");
    // The <details> holds the summary and nothing else: its box is a flex item
    // in a 188px panel, and a bio set inside it would be set on that measure.
    const details = matt.querySelector("details")!;
    expect([...details.children].map((el) => el.tagName)).toEqual(["SUMMARY"]);
    expect(details.contains(bio)).toBe(false);
    // The card's LAST child, a direct child of the <li> — which is what the
    // stylesheet's `li:has(…) > [data-partner-bio]` needs it to be.
    expect(bio.parentElement).toBe(matt);
    expect(matt.lastElementChild).toBe(bio);
    expect(bio.className).toContain("bg-light");
    expect(bio.className).toContain("t-body-2");
    // And the summary says what it controls.
    expect(details.querySelector("summary")!.getAttribute("aria-controls")).toBe(bio.id);
    expect(bio.id).not.toBe("");
  });

  it("writes the closing rule as HIDE-WHILE-CLOSED, so a browser without :has() shows the bio", () => {
    // Chromium cannot tell the two directions apart — both work where :has()
    // does. Only the source can: "show while open" hides every bio for good in
    // a browser that drops the rule.
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/slices/Partners/index.svelte"),
      "utf8",
    );
    const style = /<style>([\s\S]*?)<\/style>/.exec(source)?.[1] ?? "";
    const rules = style.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(rules.replace(/\s+/g, " ")).toBe(
      "li:has(details:not([open])) > [data-partner-bio] { display: none; }",
    );
    // …and nothing in the markup hides it by default.
    const { container } = render(Partners, { props: { slice: withBio() } });
    const bio = section(container).querySelector<HTMLElement>("[data-partner-bio]")!;
    expect(bio.hasAttribute("hidden")).toBe(false);
    expect(bio.className.split(/\s+/)).not.toContain("hidden");
  });
});

describe("Partners slice — the headshot", () => {
  it("WITHOUT a photo has no photo box and no <img> — the panel is the whole card", () => {
    const { container } = render(Partners, { props: { slice: partnersFixture() } });
    for (const card of cards(container)) {
      expect(card.querySelector("[data-partner-photo]")).toBeNull();
      expect(card.querySelector("img")).toBeNull();
      const row = card.firstElementChild!;
      expect(row.children.length).toBe(1);
      // …and still the comp's height, so the band stays 556 tall at 1440.
      expect(row.className).toContain("min-h-[153px]");
    }
  });

  it("WITH a photo renders a 153px box and a srcset that tops out at 3×", () => {
    const slice = partnersFixture({
      partners: [
        partnerFixture({
          photo: {
            url: "https://images.prismic.io/roalson-interests/matt.jpg?auto=format,compress&rect=0,0,1200,1200&w=612&h=612",
            alt: null,
            dimensions: { width: 612, height: 612 },
          },
        } as never),
      ],
    });
    const { container } = render(Partners, { props: { slice } });
    const box = cards(container)[0].querySelector<HTMLElement>("[data-partner-photo]")!;
    expect(box.className).toContain("size-[153px]");
    expect(box.className).toContain("bg-dark");
    // First in the row: the photo is left of the panel.
    expect(box.parentElement!.firstElementChild).toBe(box);
    const img = box.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("sizes")).toBe("153px");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("object-cover");
    const widths = [...img.getAttribute("srcset")!.matchAll(/ (\d+)w/g)].map((m) => Number(m[1]));
    expect(widths).toEqual([153, 306, 459]);
    // The editor's square crop survives the resize: `rect` kept, stale `h` gone.
    expect(img.getAttribute("src")).toContain("rect=0%2C0%2C1200%2C1200");
    expect(img.getAttribute("src")).toContain("w=306");
    expect(img.getAttribute("src")).not.toMatch(/[?&]h=/);
  });

  it("uses the editor's alt text when there is one", () => {
    const slice = partnersFixture({
      partners: [
        partnerFixture({ photo: { ...PARTNER_PHOTO_FIXTURE, alt: "Matt Howard" } } as never),
      ],
    });
    const { container } = render(Partners, { props: { slice } });
    expect(cards(container)[0].querySelector("img")!.getAttribute("alt")).toBe("Matt Howard");
  });
});

describe("the /dev/home partner states", () => {
  it("default is launch: no bios, no photos, no contact links", () => {
    const rows = partnersFixture().primary.partners;
    expect(rows.map((row) => row.name)).toEqual(["Matt Howard", "Bart Wilson"]);
    for (const row of rows) {
      expect(row.bio).toEqual([]);
      expect(row.photo).toEqual({});
      expect(row.contact_link).toEqual({ link_type: "Any" });
    }
  });

  it("?bio gives ONE partner a bio, so both PROFILE states are on the page together", () => {
    const { container } = render(Partners, {
      props: { slice: partnersFixtureState({ bio: true }) },
    });
    expect(cards(container).map((card) => card.querySelector("details") !== null)).toEqual([
      true,
      false,
    ]);
    expect(section(container).querySelector("img")).toBeNull();
  });

  it("?photos gives both a generated headshot — a drawing, from no host", () => {
    const { container } = render(Partners, {
      props: { slice: partnersFixtureState({ photos: true }) },
    });
    const images = [...section(container).querySelectorAll("img")];
    expect(images.length).toBe(2);
    for (const img of images) {
      expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
      // Not a Prismic URL, so no srcset is invented for it.
      expect(img.hasAttribute("srcset")).toBe(false);
    }
    expect(section(container).querySelector("details")).toBeNull();
  });
});
