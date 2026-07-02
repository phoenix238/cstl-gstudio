import { describe, expect, it } from "vitest";
import {
  formatDateISO,
  getOffsetDateString,
  getStartOfWeek,
  parseTimeToDecimal,
  toggleSelectedSlot,
} from "./calendarUtils";

describe("calendarUtils", () => {
  it("formats ISO dates consistently", () => {
    expect(formatDateISO(new Date(2026, 6, 2))).toBe("2026-07-02");
  });

  it("finds Monday as week start", () => {
    const wednesday = new Date(2026, 6, 1);
    const monday = getStartOfWeek(wednesday);
    expect(monday.getDay()).toBe(1);
  });

  it("computes offset date strings from Monday", () => {
    const monday = new Date(2026, 5, 29);
    expect(getOffsetDateString(monday, 2)).toBe("2026-07-01");
  });

  it("parses HH:MM to decimal hours", () => {
    expect(parseTimeToDecimal("09:30")).toBe(9.5);
    expect(parseTimeToDecimal("14:15")).toBe(14.25);
  });

  it("toggles selected slots on and off", () => {
    const first = toggleSelectedSlot([], "2026-07-10", 10, 0);
    expect(first).toHaveLength(1);
    expect(first[0].time).toBe("10:00");

    const second = toggleSelectedSlot(first, "2026-07-10", 10, 0);
    expect(second).toHaveLength(0);
  });
});