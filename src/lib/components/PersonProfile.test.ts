import { cleanup, render } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";

import { PARTNER_PHOTO_FIXTURE } from "$lib/home-fixture";
import { personFixture } from "$lib/person-fixture";
import PersonProfile from "./PersonProfile.svelte";

afterEach(cleanup);

describe("PersonProfile", () => {
  it("has one h1, the person's name, on the site's grid", () => {
    const { getAllByRole, container } = render(PersonProfile, {
      props: { person: personFixture({ credentials: "CCIM" }) },
    });
    const headings = getAllByRole("heading");
    expect(headings.map((h) => h.tagName)).toEqual(["H1"]);
    expect(headings[0].textContent).toBe("Matt Howard, CCIM");
    expect(container.querySelector("article")!.getAttribute("aria-labelledby")).toBe(
      headings[0].id,
    );
    expect(container.querySelector(".lg\\:grid")!.className).toContain(
      "lg:grid-cols-[397fr_847fr]",
    );
  });

  it("marks a placeholder biography — and only a placeholder", () => {
    const placeholder = render(PersonProfile, { props: { person: personFixture() } });
    expect(placeholder.getByText("Placeholder bio")).toBeTruthy();
    cleanup();
    const real = render(PersonProfile, {
      props: { person: personFixture({ bio_is_placeholder: false }) },
    });
    expect(real.queryByText("Placeholder bio")).toBeNull();
  });

  it("renders the biography's paragraphs", () => {
    const { container } = render(PersonProfile, {
      props: {
        person: personFixture({
          bio: [
            { type: "paragraph", text: "One.", spans: [] },
            { type: "paragraph", text: "Two.", spans: [] },
          ],
        }),
      },
    });
    const bio = container.querySelector("[data-person-bio]")!;
    expect([...bio.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["One.", "Two."]);
  });


  it("draws no photo box without a photo, and one with", () => {
    const bare = render(PersonProfile, { props: { person: personFixture() } });
    expect(bare.container.querySelector("[data-person-photo]")).toBeNull();
    cleanup();
    const withPhoto = render(PersonProfile, {
      props: { person: personFixture({ photo: PARTNER_PHOTO_FIXTURE } as never) },
    });
    expect(withPhoto.container.querySelector("[data-person-photo] img")).not.toBeNull();
  });
});
