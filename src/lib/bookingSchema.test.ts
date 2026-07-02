import { describe, expect, it } from "vitest";
import { isValidAnalyzedBooking, isValidBookingSuggestion } from "./bookingSchema";

describe("bookingSchema", () => {
  it("accepts a valid booking suggestion", () => {
    expect(
      isValidBookingSuggestion({
        date: "2026-07-10",
        time: "14:30",
        label: "Thursday, July 10th at 2:30 PM",
      })
    ).toBe(true);
  });

  it("rejects malformed suggestion times", () => {
    expect(
      isValidBookingSuggestion({
        date: "2026-07-10",
        time: "2:30pm",
        label: "Bad",
      })
    ).toBe(false);
  });

  it("accepts a valid analyzed booking payload", () => {
    expect(
      isValidAnalyzedBooking({
        clientName: "Alex",
        clientId: "abc123",
        clientPhone: "+44 7700 900123",
        detectedRequest: "Tuesday morning",
        intent: "general_inquiry",
        targetSlot: null,
        suggestions: [
          { date: "2026-07-08", time: "10:00", label: "Tuesday at 10:00" },
          { date: "2026-07-09", time: "11:00", label: "Wednesday at 11:00" },
          { date: "2026-07-10", time: "09:30", label: "Thursday at 9:30" },
        ],
        draftReply: "Hi Alex, lovely to hear from you.\n\nwith gratitude Phoenix",
      })
    ).toBe(true);
  });

  it("rejects analyzed booking without suggestions", () => {
    expect(
      isValidAnalyzedBooking({
        clientName: "Alex",
        clientId: null,
        clientPhone: null,
        detectedRequest: "next week",
        intent: "general_inquiry",
        targetSlot: null,
        suggestions: [],
        draftReply: "Hi",
      })
    ).toBe(false);
  });
});