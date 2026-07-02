export interface BookingSuggestion {
  date: string;
  time: string;
  label: string;
}

export interface AnalyzedBooking {
  clientName: string;
  clientId: string | null;
  clientPhone: string | null;
  detectedRequest: string;
  intent: "specific_slot" | "general_inquiry";
  targetSlot: {
    date: string;
    time: string;
    isConflict: boolean;
  } | null;
  suggestions: BookingSuggestion[];
  draftReply: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function isValidBookingSuggestion(value: unknown): value is BookingSuggestion {
  if (!value || typeof value !== "object") return false;
  const s = value as BookingSuggestion;
  return (
    typeof s.date === "string" &&
    DATE_RE.test(s.date) &&
    typeof s.time === "string" &&
    TIME_RE.test(s.time) &&
    typeof s.label === "string" &&
    s.label.length > 0
  );
}

export function isValidAnalyzedBooking(value: unknown): value is AnalyzedBooking {
  if (!value || typeof value !== "object") return false;
  const b = value as AnalyzedBooking;

  if (typeof b.clientName !== "string" || b.clientName.length === 0) return false;
  if (b.clientId !== null && typeof b.clientId !== "string") return false;
  if (b.clientPhone !== null && typeof b.clientPhone !== "string") return false;
  if (typeof b.detectedRequest !== "string") return false;
  if (b.intent !== "specific_slot" && b.intent !== "general_inquiry") return false;
  if (typeof b.draftReply !== "string" || b.draftReply.length === 0) return false;
  if (!Array.isArray(b.suggestions) || b.suggestions.length === 0) return false;
  if (!b.suggestions.every(isValidBookingSuggestion)) return false;

  if (b.targetSlot !== null) {
    if (typeof b.targetSlot !== "object") return false;
    if (!DATE_RE.test(b.targetSlot.date) || !TIME_RE.test(b.targetSlot.time)) return false;
    if (typeof b.targetSlot.isConflict !== "boolean") return false;
  }

  return true;
}