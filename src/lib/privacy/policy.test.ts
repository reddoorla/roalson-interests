import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { formatEffectiveDate } from "./policy";

const savedTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Los_Angeles";
});
afterAll(() => {
  process.env.TZ = savedTz;
});

describe("formatEffectiveDate", () => {
  it("formats an ISO date in UTC, so the day never shifts", () => {
    expect(formatEffectiveDate("2026-10-04")).toBe("October 4, 2026");
    expect(formatEffectiveDate("2026-01-01")).toBe("January 1, 2026");
  });

  it("rejects an impossible or malformed date instead of rolling it over", () => {
    expect(formatEffectiveDate("2026-02-30")).toBeNull();
    expect(formatEffectiveDate("10/04/2026")).toBeNull();
    expect(formatEffectiveDate("")).toBeNull();
    expect(formatEffectiveDate(undefined)).toBeNull();
  });
});
