import { cleanup, render, within } from "@testing-library/svelte";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Content } from "@prismicio/client";

import {
  PARTNER_PHOTO_FIXTURE,
  partnerFixture,
  partnersFixture,
  partnersFixtureState,
} from "$lib/home-fixture";
import { components } from "$lib/slices";
import Partners from "./index.svelte";

afterEach(cleanup);

// jsdom resolves no stylesheets: where the blocks sit and how big a target is
// are tests/interaction/partners.spec.ts's. What is checked
// here is what the markup says — what renders for which fields, in what order,
// under what names.

const section = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slice-type="partners"]')!;
const cards = (container: HTMLElement) => [
  ...section(container).querySelectorAll<HTMLElement>("[data-partner]"),
];

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
    // and passes with the names as h3s — an h2 precedes them on the homepage
    // (the featured band's, since the hero's "Our specialty" went), and h2 → h3
    // skips no level.
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

  it("uses the site's one grid and caps the LEFT column at the comp's 371 from `sm` up", () => {
    const { container, getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const grid = section(container).querySelector(".lg\\:grid")!;
    expect(grid.className).toContain("lg:grid-cols-[397fr_847fr]");
    expect(grid.className).toContain("lg:gap-9");
    // Not `lg:` only: a tablet drew the cards 704 to 959 wide (#54).
    const column = getByRole("list").parentElement!.className.split(/\s+/);
    expect(column).toContain("sm:max-w-[371px]");
    expect(column).not.toContain("lg:max-w-[371px]");
  });

  it("draws the rule half a pixel from 2x up, and a half-alpha pixel below 1.5dppx (#53)", () => {
    const { container } = render(Partners, { props: { slice: partnersFixture() } });
    const rule = section(container).querySelector("[data-partners-rule]")!;
    const classes = rule.getAttribute("class")!.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining([
        "h-px",
        "-mb-px",
        "origin-top",
        "scale-y-50",
        "bg-primary",
        "[@media(max-resolution:1.5dppx)]:scale-y-100",
        "[@media(max-resolution:1.5dppx)]:bg-primary/50",
      ]),
    );
    expect(rule.getAttribute("aria-hidden")).toBe("true");
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
    expect(bare.queryByRole("link", { name: /properties/i })).toBeNull();
    // Every link in the default state is a partner's PROFILE or CONTACT.
    expect(bare.getAllByRole("link").map((a) => a.textContent?.trim())).toEqual([
      "Profile, Matt Howard",
      "Contact Matt Howard",
      "Profile, Bart Wilson",
      "Contact Bart Wilson",
    ]);
    cleanup();

    const slice = partnersFixture({
      buttons: [
        { label: "No link", link: { link_type: "Any" } },
        { label: "Properties", link: { link_type: "Web", url: "https:///properties" } },
        { label: "Contact us", link: { link_type: "Web", url: "/contact" } },
        { label: "Third", link: { link_type: "Web", url: "/third" } },
      ],
    } as never);
    const filled = render(Partners, { props: { slice } });
    const portfolio = filled.getByRole("link", { name: "Properties" });
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

describe("Partners slice — a card is its Person (#179)", () => {
  it("lists the partners under the eyebrow's name: the Person's name and role, in the editor's order", () => {
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

  it("reads every word on the card from the Person: a renamed Person is a renamed card", () => {
    const slice = partnersFixture({
      partners: [
        partnerFixture({
          name: " Jonathan Collins ",
          role: " Principal ",
          email: "jcollins@roalson.com",
        }),
      ],
    });
    const { container, getByRole } = render(Partners, { props: { slice } });
    const [card] = cards(container);
    expect(card.querySelector(".t-h3")?.textContent).toBe("Jonathan Collins");
    expect(card.querySelector(".t-h4")?.textContent).toBe("Principal");
    expect(getByRole("link", { name: "Profile, Jonathan Collins" }).getAttribute("href")).toBe(
      "/team/jonathan-collins",
    );
    expect(getByRole("link", { name: "Contact Jonathan Collins" }).getAttribute("href")).toBe(
      "mailto:jcollins@roalson.com",
    );
  });

  it("draws NO card for a Person that is unpublished, unset or nameless — and says so on the band", () => {
    const unpublished = partnerFixture({ name: "Bart Wilson" }, {
      profile: { link_type: "Document", id: "fixture-person-bart-wilson", isBroken: true },
    } as never);
    const slice = partnersFixture({
      partners: [
        partnerFixture(),
        unpublished,
        partnerFixture({}, { profile: { link_type: "Any" } } as never),
        partnerFixture({ name: "  " }),
        partnerFixture({ name: null } as never),
      ],
    });
    const { container, queryByText } = render(Partners, { props: { slice } });
    expect(cards(container).map((c) => c.querySelector(".t-h3")?.textContent)).toEqual([
      "Matt Howard",
    ]);
    // An unpublished Person's page would 404, and the row has no name of its
    // own any more to draw a card without one.
    expect(queryByText("Bart Wilson")).toBeNull();
    expect(container.innerHTML).not.toContain("/team/bart-wilson");
    const root = section(container);
    expect(root.getAttribute("data-partners-linked")).toBe("3");
    expect(root.getAttribute("data-partners-shown")).toBe("1");
    expect(root.getAttribute("data-partners-unembedded")).toBe("0");
  });

  it("drops a Person the API sent BARE, and counts it apart from an editor's drop", () => {
    // A live link with no `data`: the repository's model does not ask for the
    // four fields yet. Never the editor's doing, so it is counted separately.
    const bare = partnerFixture({ name: "Bart Wilson" });
    delete (bare.profile as { data?: unknown }).data;
    const slice = partnersFixture({ partners: [partnerFixture(), bare] });
    const { container } = render(Partners, { props: { slice } });
    expect(cards(container).length).toBe(1);
    const root = section(container);
    expect(root.getAttribute("data-partners-linked")).toBe("2");
    expect(root.getAttribute("data-partners-shown")).toBe("1");
    expect(root.getAttribute("data-partners-unembedded")).toBe("1");
  });

  it("with every Person gone draws no cards, no rule and no list — the text column stays", () => {
    const slice = partnersFixture({
      partners: [
        partnerFixture({}, {
          profile: { link_type: "Document", id: "x", isBroken: true },
        } as never),
      ],
    });
    const { container, getByRole } = render(Partners, { props: { slice } });
    expect(cards(container)).toEqual([]);
    expect(section(container).querySelector("[data-partners-rule]")).toBeNull();
    expect(section(container).querySelector("[data-partners-list]")).toBeNull();
    expect(getByRole("heading", { level: 2 })).toBeTruthy();
  });

  it("drops a blank role's line", () => {
    const slice = partnersFixture({
      partners: [partnerFixture({ name: "Bart Wilson", role: " " })],
    });
    const { container } = render(Partners, { props: { slice } });
    expect(cards(container)[0].querySelector(".t-h3")?.textContent).toBe("Bart Wilson");
    expect(cards(container)[0].querySelector(".t-h4")).toBeNull();
  });

  it("sends CONTACT to /contact when the row has no link and the Person no email", () => {
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
        partnerFixture({ email: "mhoward@roalson.com" }, {
          contact_link: { link_type: "Web", url: "mailto:partner@example.com" },
        } as never),
        partnerFixture({ name: "Bart Wilson" }, {
          contact_link: { link_type: "Web", url: "https://www.roalson.com/contact?who=bart" },
        } as never),
        partnerFixture({ name: "A Third" }, {
          contact_link: { link_type: "Web", url: "tel:+12104965800" },
        } as never),
      ],
    });
    const { getByRole } = render(Partners, { props: { slice } });
    // The row's link overrides the Person's email.
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

  it("mails the Person's own address when the row has no link (D3)", () => {
    const slice = partnersFixture({
      partners: [
        partnerFixture({ email: " mhoward@roalson.com " }),
        partnerFixture({ name: "Bart Wilson", email: "not an address" }),
      ],
    });
    const { getByRole } = render(Partners, { props: { slice } });
    expect(getByRole("link", { name: "Contact Matt Howard" }).getAttribute("href")).toBe(
      "mailto:mhoward@roalson.com",
    );
    // An unusable address falls back rather than shipping a broken mailto:.
    expect(getByRole("link", { name: "Contact Bart Wilson" }).getAttribute("href")).toBe(
      "/contact",
    );
  });

  it("names each link for its partner — two links reading 'Contact' are one name twice", () => {
    const { getAllByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const names = getAllByRole("link").map((a) => a.textContent?.trim());
    expect(new Set(names).size).toBe(names.length);
    // WCAG 2.5.3: the drawn label opens the accessible name.
    for (const name of names) expect(name).toMatch(/^(Contact |Profile, )/);
  });

  it("gives every text link the padded 24px target, with the ramp class on an INNER element", () => {
    const { container } = render(Partners, { props: { slice: partnersFixture() } });
    const targets = [
      ...section(container).querySelectorAll<HTMLElement>("[data-partner-links] > a"),
    ];
    expect(targets.length).toBe(4);
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
    const { container } = render(Partners, { props: { slice: partnersFixture() } });
    const arrows = [...section(container).querySelectorAll<SVGElement>("[data-partner-links] svg")];
    // PROFILE + CONTACT on each card.
    expect(arrows.length).toBe(4);
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

describe("Partners slice — PROFILE, the partner's page", () => {
  it("renders PROFILE as a link to /team/<uid>, before CONTACT, on every card", () => {
    const { container, getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const profile = getByRole("link", { name: "Profile, Matt Howard" });
    expect(profile.getAttribute("href")).toBe("/team/matt-howard");
    expect(profile.hasAttribute("data-partner-profile")).toBe(true);
    for (const card of cards(container)) {
      const links = card.querySelector("[data-partner-links]")!;
      expect(
        [...links.children].map((el) =>
          el.hasAttribute("data-partner-profile")
            ? "profile"
            : el.hasAttribute("data-partner-contact")
              ? "contact"
              : el.tagName,
        ),
      ).toEqual(["profile", "contact"]);
    }
    expect(getByRole("link", { name: "Profile, Bart Wilson" }).getAttribute("href")).toBe(
      "/team/bart-wilson",
    );
  });

  it("no longer carries the <details> bio disclosure or its stylesheet", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/lib/slices/Partners/index.svelte"),
      "utf8",
    );
    expect(source).not.toMatch(/<details|<summary|<style>/);
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

  it("WITH the Person's photo renders a 153px box and a srcset that tops out at 3×", () => {
    // The live Person's own field, as the Content API embeds it (read
    // 2026-09-29 from the published `home` document's relationship).
    const slice = partnersFixture({
      partners: [
        partnerFixture({
          photo: {
            dimensions: { width: 612, height: 612 },
            alt: "Matt Howard",
            copyright: null,
            url: "https://images.prismic.io/roalson-interests/FQHPWT2UEH21pF58_partner-matt-howard.jpg?auto=format%2Ccompress&rect=0%2C0%2C847%2C847&w=612&h=612",
            id: "FQHPWT2UEH21pF58",
            edit: { x: 0, y: 0, zoom: 1, background: "#ffffff" },
          },
        } as never),
      ],
    });
    const { container } = render(Partners, { props: { slice } });
    const box = cards(container)[0].querySelector<HTMLElement>("[data-partner-photo]")!;
    // 153 wide, at least 153 tall, and stretched to its row — never a fixed
    // square, which notched the card where the panel beside it grew.
    const boxClasses = box.className.split(/\s+/);
    expect(boxClasses).toEqual(
      expect.arrayContaining(["w-[153px]", "min-h-[153px]", "self-stretch"]),
    );
    expect(boxClasses).not.toContain("size-[153px]");
    expect(box.className).toContain("bg-dark");
    // First in the row: the photo is left of the panel.
    expect(box.parentElement!.firstElementChild).toBe(box);
    const img = box.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("Matt Howard");
    expect(img.getAttribute("sizes")).toBe("153px");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.className).toContain("object-cover");
    const widths = [...img.getAttribute("srcset")!.matchAll(/ (\d+)w/g)].map((m) => Number(m[1]));
    expect(widths).toEqual([153, 306, 459]);
    // The editor's square crop survives the resize: `rect` kept, stale `h` gone.
    expect(img.getAttribute("src")).toContain("rect=0%2C0%2C847%2C847");
    expect(img.getAttribute("src")).toContain("w=306");
    expect(img.getAttribute("src")).not.toMatch(/[?&]h=/);
  });

  it("uses an empty alt when the Person's photo has none: the name is the next thing read", () => {
    const slice = partnersFixture({
      partners: [partnerFixture({ photo: { ...PARTNER_PHOTO_FIXTURE, alt: null } } as never)],
    });
    const { container } = render(Partners, { props: { slice } });
    expect(cards(container)[0].querySelector("img")!.getAttribute("alt")).toBe("");
  });
});

describe("the /dev/home partner states", () => {
  it("default: both partners are live Persons with no photo, no email and no contact link", () => {
    const rows = partnersFixture().primary.partners;
    expect(rows.map((row) => Object.keys(row).sort())).toEqual([
      ["contact_link", "profile"],
      ["contact_link", "profile"],
    ]);
    for (const row of rows) {
      const person = row.profile as unknown as {
        isBroken: boolean;
        data: Record<string, unknown>;
      };
      expect(person.isBroken).toBe(false);
      expect(person.data.photo).toEqual({});
      expect(person.data.email).toBeNull();
      expect(row.contact_link).toEqual({ link_type: "Any" });
    }
  });

  it("?unpublished draws the first partner only", () => {
    const { container } = render(Partners, {
      props: { slice: partnersFixtureState({ unpublished: true }) },
    });
    expect(cards(container).map((c) => c.querySelector(".t-h3")?.textContent)).toEqual([
      "Matt Howard",
    ]);
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
  });
});
