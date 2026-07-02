import { Check, Info } from "lucide-react";
import {
  CALENDAR_END_HOUR,
  CALENDAR_ROW_HEIGHT,
  CALENDAR_START_HOUR,
  calendarHours,
  parseTimeToDecimal,
  type CalendarGridEvent,
  type SelectedSlot,
} from "../lib/calendarUtils";

interface CalendarWeekGridProps {
  weekDays: Date[];
  visibleEvents: CalendarGridEvent[];
  selectedSlots: SelectedSlot[];
  onToggleSlot: (dayDate: string, hourNum: number, minuteNum?: number) => void;
  formatDateISO: (d: Date) => string;
  showLegend?: boolean;
}

export default function CalendarWeekGrid({
  weekDays,
  visibleEvents,
  selectedSlots,
  onToggleSlot,
  formatDateISO,
  showLegend = true,
}: CalendarWeekGridProps) {
  return (
    <div className="bg-white rounded-2xl border border-natural-border overflow-hidden shadow-2xs" id="visual-grid-container">
      {showLegend && (
        <div className="px-4 py-2 bg-natural-bg/40 border-b border-natural-border flex flex-wrap items-center justify-between text-[10px] text-natural-muted font-sans gap-2">
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3 text-natural-sage" />
            Tap/click any empty time slot cell to manually compile availability options.
          </span>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Grid Key:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-natural-sage" /> My Sessions
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-cyan-200 border border-cyan-300" /> Chalk Farm Studio
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-indigo-200 border border-indigo-300" /> WTR 5
            </span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[750px] grid grid-cols-8 divide-x divide-natural-border/60 relative">
          <div className="col-span-1 pt-12 select-none">
            {calendarHours.map((hr) => (
              <div
                key={hr}
                className="text-right pr-3 font-mono text-[10px] text-natural-muted/80 font-semibold"
                style={{ height: `${CALENDAR_ROW_HEIGHT}px`, lineHeight: "14px" }}
              >
                {hr > 12 ? `${hr - 12}:00 PM` : hr === 12 ? "12:00 PM" : `${hr}:00 AM`}
              </div>
            ))}
          </div>

          {weekDays.map((dayDateObj) => {
            const dayStr = formatDateISO(dayDateObj);
            const isToday = formatDateISO(new Date()) === dayStr;
            const dayEvents = visibleEvents.filter((ev) => ev.date === dayStr);

            return (
              <div key={dayStr} className="col-span-1 relative flex flex-col">
                <div
                  className={`h-12 border-b border-natural-border flex flex-col justify-center items-center py-1 select-none ${
                    isToday ? "bg-natural-sage/5 border-b-2 border-b-natural-sage" : ""
                  }`}
                >
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider ${
                      isToday ? "text-natural-sage font-extrabold" : "text-natural-muted"
                    }`}
                  >
                    {dayDateObj.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span
                    className={`text-xs font-serif italic ${
                      isToday ? "text-natural-sage font-extrabold text-sm" : "text-natural-text font-bold"
                    }`}
                  >
                    {dayDateObj.getDate()}
                  </span>
                </div>

                <div
                  className="relative bg-gradient-to-b from-white to-natural-bg/5"
                  style={{ height: `${calendarHours.length * CALENDAR_ROW_HEIGHT}px` }}
                >
                  {calendarHours.map((hr) => (
                    <div
                      key={hr}
                      className="relative border-b border-natural-border/20 flex flex-col"
                      style={{ height: `${CALENDAR_ROW_HEIGHT}px` }}
                    >
                      {[0, 15, 30, 45].map((minVal, qIdx) => {
                        const timeStr = `${String(hr).padStart(2, "0")}:${String(minVal).padStart(2, "0")}`;
                        const slotDecimal = hr + minVal / 60;
                        const slotEndDecimal = slotDecimal + 1;

                        const hasEvent = dayEvents.some((e) => {
                          const evStartDecimal = parseTimeToDecimal(e.time);
                          const evEndDecimal = evStartDecimal + e.duration / 60;
                          return Math.max(slotDecimal, evStartDecimal) < Math.min(slotEndDecimal, evEndDecimal);
                        });

                        return (
                          <div
                            key={minVal}
                            onClick={() => {
                              if (!hasEvent) onToggleSlot(dayStr, hr, minVal);
                            }}
                            className={`flex-1 relative group cursor-pointer transition-colors ${
                              qIdx < 3 ? "border-b border-dashed border-natural-border/10" : ""
                            } ${
                              hasEvent
                                ? "bg-natural-sidebar/5 cursor-not-allowed opacity-40"
                                : "hover:bg-natural-sage/15"
                            }`}
                            title={hasEvent ? "Room Booked / Conflict" : `Tap to select 1-hour slot starting at ${timeStr}`}
                          >
                            {!hasEvent && (
                              <span className="absolute left-2 top-0.5 text-[8px] font-mono text-natural-muted font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                +{timeStr}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {selectedSlots
                    .filter((s) => s.date === dayStr)
                    .map((s, idx) => {
                      const startDecimal = parseTimeToDecimal(s.time);
                      const topPx = (startDecimal - CALENDAR_START_HOUR) * CALENDAR_ROW_HEIGHT;
                      const heightPx = CALENDAR_ROW_HEIGHT;

                      return (
                        <div
                          key={`selected-${s.time}-${idx}`}
                          onClick={() => {
                            const [hStr, mStr] = s.time.split(":");
                            onToggleSlot(dayStr, parseInt(hStr, 10), parseInt(mStr, 10));
                          }}
                          className="absolute left-0.5 right-0.5 bg-[#fdfaf2]/95 hover:bg-[#fdfaf2] border-2 border-amber-400 rounded-xl p-2 text-[10px] leading-tight flex flex-col justify-between shadow-xs cursor-pointer z-20 group animate-fade-in"
                          style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                          title="Tap to unselect this proposed session"
                        >
                          <div className="flex items-center justify-between font-bold text-amber-900 font-sans">
                            <span className="flex items-center gap-1 text-[9px] truncate">
                              <Check className="w-3 h-3 text-amber-600 shrink-0" />
                              Proposed Session
                            </span>
                            <span className="text-[8px] bg-amber-200/80 px-1 py-0.5 rounded font-mono shrink-0">
                              Selected
                            </span>
                          </div>
                          <div className="text-[9px] text-amber-800 font-medium truncate font-mono">
                            60m starts {s.time}
                          </div>
                        </div>
                      );
                    })}

                  {dayEvents.map((ev, idx) => {
                    const evStartDecimal = parseTimeToDecimal(ev.time);
                    const topPx = (evStartDecimal - CALENDAR_START_HOUR) * CALENDAR_ROW_HEIGHT;
                    const heightPx = (ev.duration / 60) * CALENDAR_ROW_HEIGHT;

                    let cardStyles = "bg-slate-100 border-slate-300 text-slate-800";
                    if (ev.color === "sage") cardStyles = "bg-natural-sage text-white border-emerald-700";
                    if (ev.color === "cyan") cardStyles = "bg-cyan-50 text-cyan-900 border-cyan-300 hover:bg-cyan-100";
                    if (ev.color === "indigo") cardStyles = "bg-indigo-50 text-indigo-900 border-indigo-300 hover:bg-indigo-100";
                    if (ev.color === "amber") cardStyles = "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100";

                    return (
                      <div
                        key={`${ev.id}-${idx}`}
                        className={`absolute left-0.5 right-0.5 rounded-lg border px-1.5 py-1 text-[9px] leading-tight flex flex-col justify-between shadow-3xs overflow-hidden select-none transition-transform z-10 ${cardStyles}`}
                        style={{ top: `${topPx}px`, height: `${heightPx}px`, minHeight: "18px" }}
                        title={`${ev.summary}\n${ev.center}\nTime: ${ev.time} (${ev.duration} mins)`}
                      >
                        <div className="truncate font-bold font-sans">{ev.summary}</div>
                        <div className="flex items-center justify-between text-[8px] opacity-90 truncate font-mono mt-0.5">
                          <span>
                            {ev.time} ({ev.duration}m)
                          </span>
                          <span className="opacity-75 uppercase tracking-wide text-[7px] font-bold">
                            {ev.color === "sage" ? "Mine" : "Room Busy"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}