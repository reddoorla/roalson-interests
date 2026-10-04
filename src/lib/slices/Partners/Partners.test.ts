import { cleanup, render, within } from "@testing-library/svelte";
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
/** Whether a card draws `text` itself: a link's hidden name does not count. */
const draws = (card: HTMLElement, text: string) =>
  within(card)
    .queryAllByText(text)
    .some((el) => !el.closest("a"));

describe("Partners slice — the band", () => {
  it("is registered, so a SliceZone renders it rather than a TodoComponent", () => {
    expect(components.partners).toBe(Partners);
  });

  it("is named by its headline", () => {
    const { container, getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const root = section(container);
    expect(root.getAttribute("data-slice-variation")).toBe("default");
    const h2 = getByRole("heading", { level: 2 });
    expect(h2.textContent).toBe("Representing Your Best Interests in Acquisition and Disposition");
    expect(root.getAttribute("aria-labelledby")).toBe(h2.id);
  });

  it("sets the eyebrow as a <p> — no heading comes before the headline", () => {
    const { getByText, getAllByRole } = render(Partners, { props: { slice: partnersFixture() } });
    expect(getByText("Our legacy").tagName).toBe("P");
    // The cards come first in the DOM, so a partner's name must not be a
    // heading: an h3 ahead of this band's h2 belongs, in the outline, to the
    // PREVIOUS band's h2. This is the only guard. axe's heading-order was tried
    // and passes with the names as h3s — an h2 precedes them on the homepage
    // (the featured band's, since the hero's "Our specialty" went), and h2 → h3
    // skips no level.
    expect(getAllByRole("heading")[0].tagName).toBe("H2");
  });

  it("reorders nothing with CSS, so tab order is drawn order", () => {
    // From `lg` the grid places the first child left. An `order-*` here would
    // split focus order from what is drawn.
    const slice = partnersFixture({
      buttons: [
        { label: "Properties", link: { link_type: "Web", url: "/properties" } },
        { label: "Contact us", link: { link_type: "Web", url: "/contact" } },
      ],
    } as never);
    const { container } = render(Partners, { props: { slice } });
    expect(section(container).innerHTML).not.toMatch(/\border-(first|last|none|\d)/);
  });

  it("renders the body's paragraphs", () => {
    const { container } = render(Partners, { props: { slice: partnersFixture() } });
    const body = section(container).querySelector<HTMLElement>("[data-partners-body]")!;
    const paragraphs = [...body.querySelectorAll("p")];
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[0].textContent).toMatch(/^Roalson Interests was formed in 1983\./);
    expect(paragraphs[1].textContent).toMatch(/San Antonio and South Texas\.$/);
  });

  it("draws an editor's buttons: the first two with a label and somewhere to go", () => {
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
  });
});

describe("Partners slice — a card is its Person (#179)", () => {
  it("lists the partners under the eyebrow's name: the Person's name and role, in the editor's order", () => {
    const { getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const list = getByRole("list", { name: "Our legacy" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(draws(items[0], "Matt Howard")).toBe(true);
    expect(draws(items[1], "Bart Wilson")).toBe(true);
    for (const li of items) expect(draws(li, "Partner")).toBe(true);
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
    expect(draws(card, "Jonathan Collins")).toBe(true);
    expect(draws(card, "Principal")).toBe(true);
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
    const shown = cards(container);
    expect(shown).toHaveLength(1);
    expect(draws(shown[0], "Matt Howard")).toBe(true);
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
    const card = (role: string) => {
      const slice = partnersFixture({ partners: [partnerFixture({ name: "Bart Wilson", role })] });
      return cards(render(Partners, { props: { slice } }).container)[0];
    };
    const blank = card(" ");
    const filled = card("Partner");
    expect(draws(blank, "Bart Wilson")).toBe(true);
    expect(blank.querySelectorAll("*").length).toBeLessThan(filled.querySelectorAll("*").length);
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
    const { container, getAllByRole } = render(Partners, { props: { slice: partnersFixture() } });
    const names = getAllByRole("link").map((a) => a.textContent?.trim());
    expect(new Set(names).size).toBe(names.length);
    // WCAG 2.5.3: the drawn label opens the accessible name.
    for (const card of cards(container)) {
      expect(within(card).getByRole("link", { name: /^Profile, / })).toBeTruthy();
      expect(within(card).getByRole("link", { name: /^Contact / })).toBeTruthy();
    }
  });
});

describe("Partners slice — PROFILE, the partner's page", () => {
  it("renders PROFILE as a link to /team/<uid> on every card", () => {
    const { container, getByRole } = render(Partners, { props: { slice: partnersFixture() } });
    expect(getByRole("link", { name: "Profile, Matt Howard" }).getAttribute("href")).toBe(
      "/team/matt-howard",
    );
    for (const card of cards(container)) {
      expect(
        within(card)
          .getByRole("link", { name: /^Profile, / })
          .getAttribute("href"),
      ).toMatch(/^\/team\/[a-z0-9-]+$/);
    }
    expect(getByRole("link", { name: "Profile, Bart Wilson" }).getAttribute("href")).toBe(
      "/team/bart-wilson",
    );
  });
});

describe("Partners slice — the headshot", () => {
  it("WITHOUT a photo has no photo box and no <img> — the panel is the whole card", () => {
    const { container } = render(Partners, { props: { slice: partnersFixture() } });
    for (const card of cards(container)) {
      expect(card.querySelector("[data-partner-photo]")).toBeNull();
      expect(card.querySelector("img")).toBeNull();
    }
  });

  it("WITH the Person's photo renders it, keeping the editor's crop", () => {
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
    const img = box.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("Matt Howard");
    // The editor's square crop survives the resize: `rect` kept, stale `h` gone.
    expect(img.getAttribute("src")).toContain("rect=0%2C0%2C847%2C847");
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
    const shown = cards(container);
    expect(shown).toHaveLength(1);
    expect(draws(shown[0], "Matt Howard")).toBe(true);
  });

  it("?photos gives both a generated headshot — a drawing, from no host", () => {
    const { container } = render(Partners, {
      props: { slice: partnersFixtureState({ photos: true }) },
    });
    const shown = cards(container);
    expect(shown).toHaveLength(2);
    for (const card of shown) {
      const img = card.querySelector("[data-partner-photo] img")!;
      expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml,/);
      // Not a Prismic URL, so no srcset is invented for it.
      expect(img.hasAttribute("srcset")).toBe(false);
    }
  });
});
