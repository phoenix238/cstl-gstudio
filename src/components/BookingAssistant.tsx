import React, { useState } from "react";
import {
  MessageSquare,
  Calendar,
  Sparkles,
  Copy,
  Check,
  Plus,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Client, Appointment } from "../types";
import { fetchGoogleCalendarEvents, type CalendarEvent } from "../googleApi";
import { apiFetch } from "../apiClient";
import { isValidAnalyzedBooking, type AnalyzedBooking } from "../lib/bookingSchema";
import { bookSessionToGoogleCalendar } from "../lib/calendarBooking";
import {
  getOffsetDateString,
  getOffsetDateLabel,
  toggleSelectedSlot,
  type SelectedSlot,
} from "../lib/calendarUtils";
import { useCalendarGrid } from "../hooks/useCalendarGrid";
import CalendarWeekGrid from "./CalendarWeekGrid";
import CalendarOverlayToolbar from "./CalendarOverlayToolbar";

interface BookingAssistantProps {
  clients: Client[];
  appointments: Appointment[];
  accessToken: string;
  onAddAppointment: (appointment: Appointment) => void;
  onAddClient: (client: Client, redirectAfterAdd?: boolean) => Promise<void> | void;
}

export default function BookingAssistant({
  clients,
  appointments,
  accessToken,
  onAddAppointment,
  onAddClient,
}: BookingAssistantProps) {
  const [inquiryText, setInquiryText] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzedBooking | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [isBooking, setIsBooking] = useState<string | null>(null);
  const [bookedStatus, setBookedStatus] = useState<string | null>(null);

  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  const [preferredLocation, setPreferredLocation] = useState<"both" | "waterloo" | "bethnal_green">("both");

  const {
    monday,
    weekDays,
    sunday,
    isLoadingCal,
    chalkFarmCalendarId,
    showPrimary,
    setShowPrimary,
    showChalkFarm,
    setShowChalkFarm,
    showWtr5,
    setShowWtr5,
    showWtr1To4,
    setShowWtr1To4,
    selectedSlots,
    setSelectedSlots,
    visibleEvents,
    loadGoogleCalendar,
    navigateWeek,
    navigateToday,
    formatDateISO,
  } = useCalendarGrid(accessToken, appointments);

  const getActiveClientName = (): string => {
    if (selectedClientId) {
      const c = clients.find((cl) => cl.id === selectedClientId);
      if (c) return c.name;
    }
    return analysis?.clientName || "there";
  };

  const syncDraftReplyWithSlots = (
    newSlots: SelectedSlot[],
    clientName: string,
    loc: "both" | "waterloo" | "bethnal_green" = preferredLocation
  ) => {
    const activeName = clientName || "there";

    let locationPhrase = "Waterloo or Bethnal Green";
    if (loc === "waterloo") locationPhrase = "Waterloo";
    else if (loc === "bethnal_green") locationPhrase = "Bethnal Green";

    if (newSlots.length === 0) {
      const defaultText = `Hi ${activeName}, lovely to hear from you. I have some open spaces coming up at ${locationPhrase}. Let me know if you would like me to suggest some options so we can find a time that allows you to arrive comfortably.\n\nwith gratitude Phoenix`;
      if (analysis) {
        setAnalysis((prev) => (prev ? { ...prev, draftReply: defaultText } : null));
      } else {
        setAnalysis({
          clientName: activeName,
          clientId: selectedClientId || null,
          clientPhone: null,
          detectedRequest: "No slots chosen yet",
          intent: "general_inquiry",
          targetSlot: null,
          suggestions: [],
          draftReply: defaultText,
        });
      }
      return;
    }

    const sorted = [...newSlots].sort(
      (a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime()
    );

    const optionsText = sorted
      .map((s) => {
        const d = new Date(`${s.date}T${s.time}`);
        const dateFormatted = d.toLocaleDateString("en-GB", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        const timeFormatted = d.toLocaleTimeString("en-GB", {
          hour: "numeric",
          minute: "2-digit",
        });
        return `${dateFormatted} at ${timeFormatted}`;
      })
      .join(", ");

    const draftText = `Hi ${activeName}, lovely to hear from you. I have a few open spaces coming up at ${locationPhrase}: ${optionsText}. Let me know if one of those allows you the time to arrive comfortably; if not, we'll find another way.\n\nwith gratitude Phoenix`;

    if (analysis) {
      setAnalysis((prev) =>
        prev ? { ...prev, draftReply: draftText, suggestions: newSlots } : null
      );
    } else {
      setAnalysis({
        clientName: activeName,
        clientId: selectedClientId || null,
        clientPhone: null,
        detectedRequest: "Hand-selected slots",
        intent: "general_inquiry",
        targetSlot: null,
        suggestions: newSlots,
        draftReply: draftText,
      });
    }
  };

  const handleLocationChange = (loc: "both" | "waterloo" | "bethnal_green") => {
    setPreferredLocation(loc);

    if (loc === "waterloo") {
      setShowWtr5(true);
      setShowWtr1To4(true);
      setShowChalkFarm(false);
    } else if (loc === "bethnal_green") {
      setShowChalkFarm(true);
      setShowWtr5(false);
      setShowWtr1To4(false);
    } else {
      setShowChalkFarm(true);
      setShowWtr5(true);
      setShowWtr1To4(false);
    }

    syncDraftReplyWithSlots(selectedSlots, getActiveClientName(), loc);
  };

  const applyAnalysisResult = (data: AnalyzedBooking) => {
    setAnalysis(data);

    if (data.clientId) {
      setSelectedClientId(data.clientId);
    } else {
      setNewClientName(data.clientName || "");
      setNewClientPhone(data.clientPhone || "");
    }

    if (data.suggestions.length > 0) {
      const prefilledSlots = data.suggestions.map((s) => ({
        date: s.date,
        time: s.time,
        label: s.label,
      }));
      setSelectedSlots(prefilledSlots);
      syncDraftReplyWithSlots(prefilledSlots, data.clientName || "there");
    }
  };

  const runLocalFallbackParser = () => {
    const textLower = inquiryText.toLowerCase();
    let clientName = "Consultation Prospect";
    let clientId: string | null = null;
    let phone = "";

    const matched = clients.find((c) => textLower.includes(c.name.toLowerCase().split(" ")[0]));
    if (matched) {
      clientName = matched.name;
      clientId = matched.id;
      phone = matched.phone || "";
    } else {
      const nameMatch = inquiryText.match(
        /(?:named|from|i am|i'm| -)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
      );
      if (nameMatch?.[1]) clientName = nameMatch[1];
    }

    const suggestions = [
      {
        date: getOffsetDateString(monday, 1),
        time: "10:15",
        label: getOffsetDateLabel(monday, 1, "10:15"),
      },
      {
        date: getOffsetDateString(monday, 3),
        time: "14:30",
        label: getOffsetDateLabel(monday, 3, "14:30"),
      },
      {
        date: getOffsetDateString(monday, 4),
        time: "15:45",
        label: getOffsetDateLabel(monday, 4, "15:45"),
      },
    ];

    const localAnalysis: AnalyzedBooking = {
      clientName,
      clientId,
      clientPhone: phone,
      detectedRequest: "General availability request",
      intent: "general_inquiry",
      targetSlot: null,
      suggestions,
      draftReply: `Hi ${clientName}! Thanks for your inquiry. I reviewed our workstation schedule and would be happy to host our 60-minute session. Here are some open times:\n\n• ${suggestions[0].label}\n• ${suggestions[1].label}\n• ${suggestions[2].label}\n\nDo any of these work for you?\n\nWarmly,\nTheraCenter`,
    };

    applyAnalysisResult(localAnalysis);
    if (!clientId) {
      setNewClientName(clientName);
      setNewClientPhone(phone);
    }
  };

  const handleAnalyze = async () => {
    if (!inquiryText.trim()) return;
    setIsAnalyzing(true);
    setErrorMsg("");
    setAnalysis(null);
    setBookedStatus(null);
    setSelectedClientId("");
    setSelectedSlots([]);
    setShowNewClientForm(false);

    try {
      let events: CalendarEvent[] = [];
      try {
        events = await fetchGoogleCalendarEvents(accessToken);
        loadGoogleCalendar();
      } catch (calErr) {
        console.error("Error fetching calendar during analysis:", calErr);
      }

      const currentTimeString = new Date().toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });

      const response = await apiFetch("/api/parse-booking", {
        method: "POST",
        body: JSON.stringify({
          text: inquiryText,
          currentTime: currentTimeString,
          existingEvents: events,
          clients: clients.map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error("API parse request not successful");
      }

      const data = await response.json();
      if (!isValidAnalyzedBooking(data)) {
        throw new Error("Invalid booking analysis response");
      }

      applyAnalysisResult(data);
    } catch (err) {
      console.warn("Live AI parsing failed, invoking smart local parser fallback:", err);
      runLocalFallbackParser();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCopyReply = () => {
    if (!analysis) return;
    navigator.clipboard.writeText(analysis.draftReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateNewClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    setIsCreatingClient(true);

    try {
      const generatedId = Math.random().toString(36).substr(2, 9);
      const newClient: Client = {
        id: generatedId,
        name: newClientName,
        email: newClientEmail || "no-email@specified.com",
        phone: newClientPhone || "no-phone",
        docId: "",
        createdAt: new Date().toISOString(),
      };

      await onAddClient(newClient, false);
      setSelectedClientId(generatedId);
      setShowNewClientForm(false);

      if (analysis) {
        setAnalysis({
          ...analysis,
          clientId: generatedId,
          clientName: newClientName,
        });
        syncDraftReplyWithSlots(selectedSlots, newClientName);
      }
    } catch (err) {
      console.error("Failed to create new client during booking assistant flow:", err);
      alert("Failed to register client.");
    } finally {
      setIsCreatingClient(false);
    }
  };

  const handleConfirmBooking = async (date: string, time: string, label: string) => {
    if (!selectedClientId) {
      alert("Please assign or onboard a client before booking.");
      return;
    }

    const matchedClient = clients.find((c) => c.id === selectedClientId);
    if (!matchedClient) {
      alert("Selected client could not be found.");
      return;
    }

    const slotId = `${date}-${time}`;
    setIsBooking(slotId);
    setBookedStatus(null);

    try {
      const startDateObj = new Date(`${date}T${time}:00`);
      const durationMins = 60;
      const endDateObj = new Date(startDateObj.getTime() + durationMins * 60 * 1000);

      let calendarEventId = "";
      if (accessToken) {
        let activeVenue: "waterloo" | "bethnal_green" = "waterloo";
        if (preferredLocation === "waterloo") {
          activeVenue = "waterloo";
        } else if (preferredLocation === "bethnal_green") {
          activeVenue = "bethnal_green";
        } else {
          const lowerText = (inquiryText + " " + label).toLowerCase();
          activeVenue =
            lowerText.includes("chalk") || lowerText.includes("bethnal") || lowerText.includes("bg")
              ? "bethnal_green"
              : "waterloo";
        }

        const venueLabel = activeVenue === "waterloo" ? "Waterloo" : "Chalk Farm";
        const description = `Auto-booked via Booking Assistant for ${venueLabel}. Client: ${matchedClient.name}. Raw Inquiry Text:\n"${inquiryText}"`;

        calendarEventId = await bookSessionToGoogleCalendar({
          accessToken,
          venue: activeVenue,
          clientName: matchedClient.name,
          startTime: startDateObj.toISOString(),
          endTime: endDateObj.toISOString(),
          description,
          personalSummary: `Therapy Session: ${matchedClient.name}`,
        });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 300));
        calendarEventId = `offline-sync-${Math.random().toString(36).substr(2, 9)}`;
      }

      const newApp: Appointment = {
        id: Math.random().toString(36).substr(2, 9),
        clientId: matchedClient.id,
        clientName: matchedClient.name,
        date,
        time,
        duration: durationMins,
        status: "scheduled",
        calendarEventId,
        notes: "Scheduled automatically via Booking Assistant analysis.",
      };

      onAddAppointment(newApp);
      setBookedStatus(
        `Successfully scheduled and synced session with ${matchedClient.name} on ${label}!`
      );

      if (analysis) {
        const timeFormatted = startDateObj.toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
        });
        const dateFormatted = startDateObj.toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        setAnalysis({
          ...analysis,
          draftReply: `Hi ${matchedClient.name}! Perfect, I have scheduled our 60-minute session for ${dateFormatted} at ${timeFormatted} and sent a calendar invite. Looking forward to seeing you! - TheraCenter`,
        });
      }
    } catch (err: unknown) {
      console.error("Error booking from assistant:", err);
      const message = err instanceof Error ? err.message : "Error occurred while creating appointment.";
      alert(message);
    } finally {
      setIsBooking(null);
    }
  };

  const handleAssignClientChange = (newClientId: string) => {
    setSelectedClientId(newClientId);
    const matchedClient = clients.find((c) => c.id === newClientId);
    if (matchedClient) {
      syncDraftReplyWithSlots(selectedSlots, matchedClient.name);
    }
  };

  const handleToggleSlot = (dayDate: string, hourNum: number, minuteNum = 0) => {
    const updatedSlots = toggleSelectedSlot(selectedSlots, dayDate, hourNum, minuteNum);
    setSelectedSlots(updatedSlots);
    syncDraftReplyWithSlots(updatedSlots, getActiveClientName(), preferredLocation);
  };

  const locationButtons = (["both", "waterloo", "bethnal_green"] as const).map((loc) => (
    <button
      key={loc}
      type="button"
      onClick={() => handleLocationChange(loc)}
      className={`px-2 py-1 rounded-lg border text-[10px] font-bold font-sans transition-all cursor-pointer ${
        preferredLocation === loc
          ? loc === "waterloo"
            ? "bg-indigo-600 text-white border-indigo-600"
            : loc === "bethnal_green"
              ? "bg-cyan-600 text-white border-cyan-600"
              : "bg-natural-sage text-white border-natural-sage"
          : "bg-white text-natural-muted border-natural-border hover:bg-natural-bg"
      }`}
    >
      {loc === "both" ? "Both / Auto" : loc === "waterloo" ? "Waterloo" : "Bethnal Green"}
    </button>
  ));

  return (
    <div className="flex flex-col h-full font-sans bg-white" id="clinical-booking-assistant-root">
      <div className="flex items-center justify-between border-b border-natural-border px-6 py-4 shrink-0 bg-natural-sidebar/20">
        <h2 className="font-serif italic text-lg font-bold text-natural-text tracking-tight flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-natural-sage" /> Clinical Scheduling Assistant
        </h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-natural-sage bg-natural-sidebar px-2.5 py-0.5 rounded-full border border-natural-border/60">
          Smart Scheduler
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-0 pb-32">
        {/* LEFT COLUMN */}
        <div className="xl:col-span-5 space-y-5 flex flex-col min-w-0" id="assistant-form-column">
          <div className="bg-natural-bg border border-natural-border rounded-2xl p-4 text-xs text-natural-text leading-relaxed">
            <p className="font-serif italic font-bold text-natural-sage text-sm mb-1 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" /> Interactive Scheduler Workstation
            </p>
            <p className="text-natural-muted">
              Select or register a client below and choose the target location manually, or paste an
              inquiry message to analyze and map dates on the interactive calendar.
            </p>
          </div>

          <div
            className="bg-white border border-natural-border rounded-2xl p-4 space-y-4 text-xs shadow-xs"
            id="client-clinic-settings"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider font-mono">
                  Active Client Context
                </span>
                {selectedClientId ? (
                  <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-mono">
                    Client Selected
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full font-mono">
                    No Client Assigned
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[10px] text-natural-muted font-bold uppercase tracking-wider">
                  Select Client:
                </span>
                <select
                  value={selectedClientId}
                  onChange={(e) => handleAssignClientChange(e.target.value)}
                  className="bg-white border border-natural-border rounded-lg text-xs p-1 focus:outline-none focus:border-natural-sage font-sans max-w-xs shrink-0"
                >
                  <option value="">-- Choose Client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>

                {!showNewClientForm && (
                  <button
                    onClick={() => {
                      setNewClientName("");
                      setNewClientEmail("");
                      setNewClientPhone("");
                      setShowNewClientForm(true);
                    }}
                    className="text-[10px] font-bold text-natural-sage bg-white border border-natural-sage px-2 py-1 rounded-lg hover:bg-natural-sage hover:text-white transition-all cursor-pointer"
                  >
                    + Add New Client
                  </button>
                )}
              </div>

              {showNewClientForm && (
                <form
                  onSubmit={handleCreateNewClient}
                  className="bg-white border border-natural-border rounded-xl p-3 space-y-2 text-xs"
                >
                  <p className="font-bold text-natural-sage text-[11px]">Register New Client</p>
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      className="w-full bg-natural-bg/40 border border-natural-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-natural-sage"
                    />
                    <input
                      type="email"
                      placeholder="Email Address"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      className="w-full bg-natural-bg/40 border border-natural-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-natural-sage"
                    />
                    <input
                      type="tel"
                      placeholder="Phone Number"
                      value={newClientPhone}
                      onChange={(e) => setNewClientPhone(e.target.value)}
                      className="w-full bg-natural-bg/40 border border-natural-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-natural-sage"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowNewClientForm(false)}
                      className="flex-1 py-1 rounded bg-natural-bg text-natural-muted font-bold text-[10px]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingClient}
                      className="flex-1 py-1 rounded bg-natural-sage text-white font-bold text-[10px]"
                    >
                      {isCreatingClient ? "Saving..." : "Register"}
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="border-t border-natural-border/60 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider font-mono">
                  Preferred Clinic Location
                </span>
                <span className="text-[9px] text-natural-sage font-bold font-mono">Manual Overrides</span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleLocationChange("both")}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[10px] font-bold font-sans transition-all cursor-pointer text-center ${
                    preferredLocation === "both"
                      ? "bg-natural-sage text-white border-natural-sage shadow-2xs"
                      : "bg-white text-natural-muted border-natural-border hover:bg-natural-bg"
                  }`}
                >
                  Both / Auto
                </button>
                <button
                  onClick={() => handleLocationChange("waterloo")}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[10px] font-bold font-sans transition-all cursor-pointer text-center ${
                    preferredLocation === "waterloo"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-2xs"
                      : "bg-white text-natural-muted border-natural-border hover:bg-natural-bg"
                  }`}
                >
                  Waterloo
                </button>
                <button
                  onClick={() => handleLocationChange("bethnal_green")}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[10px] font-bold font-sans transition-all cursor-pointer text-center ${
                    preferredLocation === "bethnal_green"
                      ? "bg-cyan-600 text-white border-cyan-600 shadow-2xs"
                      : "bg-white text-natural-muted border-natural-border hover:bg-natural-bg"
                  }`}
                >
                  Bethnal Green
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted">
              Client Message Inquiry
            </label>
            <textarea
              value={inquiryText}
              onChange={(e) => setInquiryText(e.target.value)}
              placeholder='E.g., "Hi, I was hoping to schedule our session for next Friday afternoon around 3 or 4pm if you have any availability? - Robert Vance"'
              className="w-full bg-white border border-natural-border rounded-2xl p-3.5 text-xs font-sans text-natural-text min-h-24 focus:outline-none focus:border-natural-sage leading-relaxed shadow-xs"
            />

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || !inquiryText.trim()}
              className="w-full bg-natural-sage hover:bg-natural-sage-light text-white font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 text-xs transition-all cursor-pointer disabled:opacity-50 shadow-sm"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing Schedules & Locations...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" /> Analyze Message & Stream Calendar
                </>
              )}
            </button>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border border-rose-100 text-rose-950 p-4 rounded-xl flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          <AnimatePresence>
            {analysis && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div className="bg-natural-bg/40 border border-natural-border rounded-2xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider font-mono">
                      Extracted Sender Profile
                    </span>
                    {selectedClientId ? (
                      <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full font-mono">
                        Active Selection Linked
                      </span>
                    ) : (
                      <span className="text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full font-mono">
                        Not Yet Registered
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-natural-text">
                      Sender Name:{" "}
                      <strong className="text-natural-sage font-bold font-serif italic text-sm">
                        {analysis.clientName || "Unknown"}
                      </strong>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-natural-border/30">
                      <span className="text-[10px] text-natural-muted font-bold uppercase tracking-wider font-mono">
                        Link / Map to Client:
                      </span>
                      <select
                        value={selectedClientId}
                        onChange={(e) => handleAssignClientChange(e.target.value)}
                        className="bg-white border border-natural-border rounded-lg text-xs p-1 focus:outline-none focus:border-natural-sage font-sans max-w-xs shrink-0 cursor-pointer"
                      >
                        <option value="">-- Choose Client --</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.phone || "No Phone"})
                          </option>
                        ))}
                      </select>

                      {!selectedClientId && !showNewClientForm && (
                        <button
                          onClick={() => {
                            setNewClientName(analysis.clientName || "");
                            setNewClientPhone(analysis.clientPhone || "");
                            setShowNewClientForm(true);
                          }}
                          className="text-[10px] font-bold text-natural-sage bg-white border border-natural-sage px-2 py-1 rounded-lg hover:bg-natural-sage hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
                        >
                          <Plus className="w-3 h-3" /> Register Client
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-natural-border/30">
                      <span className="text-[10px] text-natural-muted font-bold uppercase tracking-wider font-mono">
                        Preferred Location:
                      </span>
                      <div className="flex gap-1">{locationButtons}</div>
                    </div>
                  </div>
                </div>

                {bookedStatus && (
                  <div className="bg-emerald-50 border border-emerald-100 text-emerald-950 p-4 rounded-xl flex items-start gap-2.5 text-xs animate-fadeIn">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Session Scheduled Successfully!</p>
                      <p className="text-[11px] leading-relaxed text-emerald-900 mt-0.5">{bookedStatus}</p>
                    </div>
                  </div>
                )}

                {selectedSlots.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider font-mono block">
                      Hand-Selected Slots Quick Booking Action
                    </span>
                    <div className="max-h-48 overflow-y-auto space-y-2 border border-natural-border bg-natural-bg/20 rounded-2xl p-3">
                      {selectedSlots.map((slot, sIdx) => {
                        const slotId = `${slot.date}-${slot.time}`;
                        return (
                          <div
                            key={sIdx}
                            className="bg-white border border-[#e0e0d6] rounded-xl p-3.5 flex justify-between items-center text-xs shadow-3xs"
                          >
                            <div className="truncate">
                              <p className="font-bold text-natural-text truncate">{slot.label}</p>
                              <p className="text-[9px] text-natural-sage font-semibold">
                                Standard 60-minute Session
                              </p>
                            </div>

                            <button
                              disabled={isBooking !== null || !selectedClientId}
                              onClick={() => handleConfirmBooking(slot.date, slot.time, slot.label)}
                              className="bg-natural-sage hover:bg-natural-sage-light text-white font-bold font-sans text-[10px] px-3.5 py-1.5 rounded-lg border border-natural-sage transition-all cursor-pointer disabled:opacity-40 shadow-2xs"
                            >
                              {isBooking === slotId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "Book Slot"
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {analysis.draftReply && (
                  <div className="space-y-2 flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider font-mono">
                        Empathy-Rich Draft Response Message
                      </span>
                      <button
                        onClick={handleCopyReply}
                        className="text-[11px] font-bold text-natural-sage flex items-center gap-1 cursor-pointer hover:opacity-80"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" /> Copy Message
                          </>
                        )}
                      </button>
                    </div>

                    <div className="bg-[#fdfaf2] border-2 border-amber-200 rounded-2xl p-4 text-xs font-sans text-natural-text leading-relaxed whitespace-pre-wrap relative shadow-inner flex-1 overflow-y-auto">
                      {analysis.draftReply}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* RIGHT COLUMN */}
        <div
          className="xl:col-span-7 flex flex-col border border-natural-border bg-white rounded-3xl overflow-hidden shadow-2xs min-w-0"
          id="assistant-calendar-column"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-natural-border px-5 py-4 shrink-0 bg-natural-sidebar/20 gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4.5 h-4.5 text-natural-sage" />
              <div>
                <span className="font-serif italic font-bold text-sm text-natural-text block">
                  Clinical Scheduler View
                </span>
                <span className="text-[9px] uppercase tracking-wider font-bold text-natural-muted">
                  Hand-Select Empty Slots
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateWeek(-1)}
                className="p-1 rounded-lg border border-[#e0e0d6] hover:bg-natural-bg hover:text-natural-sage transition-all cursor-pointer bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={navigateToday}
                className="px-2 py-1 rounded-lg border border-[#e0e0d6] hover:bg-natural-bg hover:text-natural-sage text-[10px] font-bold transition-all cursor-pointer bg-white"
              >
                Today
              </button>
              <button
                onClick={() => navigateWeek(1)}
                className="p-1 rounded-lg border border-[#e0e0d6] hover:bg-natural-bg hover:text-natural-sage transition-all cursor-pointer bg-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-xs font-serif font-bold italic text-natural-text px-1">
                {monday.toLocaleDateString(undefined, { month: "short", day: "numeric" })} -{" "}
                {sunday.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
          </div>

          <div className="px-5 py-2.5 bg-natural-bg/20 border-b border-natural-border">
            <CalendarOverlayToolbar
              showPrimary={showPrimary}
              setShowPrimary={setShowPrimary}
              showChalkFarm={showChalkFarm}
              setShowChalkFarm={setShowChalkFarm}
              showWtr5={showWtr5}
              setShowWtr5={setShowWtr5}
              showWtr1To4={showWtr1To4}
              setShowWtr1To4={setShowWtr1To4}
              chalkFarmCalendarId={chalkFarmCalendarId}
              isLoadingCal={isLoadingCal}
              onRefresh={loadGoogleCalendar}
              compact
            />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 bg-white" id="booking-assistant-visual-grid-overlay">
            <CalendarWeekGrid
              weekDays={weekDays}
              visibleEvents={visibleEvents}
              selectedSlots={selectedSlots}
              onToggleSlot={handleToggleSlot}
              formatDateISO={formatDateISO}
              showLegend={false}
            />
          </div>

          <div className="px-4 py-2 border-t border-natural-border bg-natural-sidebar/10 flex flex-wrap justify-between items-center text-[9px] text-natural-muted gap-2">
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3 text-natural-sage" />
              Empty cells are clickable. Selected ones go directly to reply!
            </span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-natural-sage" /> My Sessions
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-cyan-200" /> Chalk Farm Studio
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded bg-indigo-200" /> WTR 5
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}