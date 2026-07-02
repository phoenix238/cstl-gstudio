import type { Appointment } from "../types";
import type { CalendarEvent } from "../googleApi";

export interface SelectedSlot {
  date: string;
  time: string;
  label: string;
}

export interface CalendarGridEvent {
  id: string;
  source?: string;
  summary: string;
  date: string;
  time: string;
  duration: number;
  color: string;
  center: string;
  raw?: unknown;
}

export const CALENDAR_START_HOUR = 8;
export const CALENDAR_END_HOUR = 19;
export const CALENDAR_ROW_HEIGHT = 100;

export const calendarHours = Array.from(
  { length: CALENDAR_END_HOUR - CALENDAR_START_HOUR + 1 },
  (_, i) => CALENDAR_START_HOUR + i
);

export function getStartOfWeek(d: Date): Date {
  const temp = new Date(d);
  const day = temp.getDay();
  const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(temp.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function getWeekDays(monday: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    days.push(day);
  }
  return days;
}

export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getOffsetDateString(monday: Date, offset: number): string {
  const d = new Date(monday);
  d.setDate(monday.getDate() + offset);
  return formatDateISO(d);
}

export function getOffsetDateLabel(monday: Date, offset: number, time: string): string {
  const d = new Date(monday);
  d.setDate(monday.getDate() + offset);
  const dayName = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return `${dayName} at ${time}`;
}

export function parseTimeToDecimal(timeStr: string): number {
  const [h, m] = timeStr.split(":").map(Number);
  return h + m / 60;
}

export function buildSlotLabel(dayDate: string, hourNum: number, minuteNum = 0): string {
  const hourStr = `${String(hourNum).padStart(2, "0")}:${String(minuteNum).padStart(2, "0")}`;
  const [yr, mo, dy] = dayDate.split("-").map(Number);
  const d = new Date(yr, mo - 1, dy, hourNum, minuteNum);
  const label = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return label || `${dayDate} ${hourStr}`;
}

export function getSharedCalendarEvents(monday: Date): CalendarGridEvent[] {
  const formatDateOffset = (offset: number) => getOffsetDateString(monday, offset);

  return [
    {
      id: "chalk-1",
      summary: "BG Center: Room A (Clinical Intake)",
      date: formatDateOffset(1),
      time: "09:30",
      duration: 90,
      color: "cyan",
      center: "Bethnal Green (Chalk Farm)",
    },
    {
      id: "chalk-2",
      summary: "BG Center: Case Supervision Meeting",
      date: formatDateOffset(3),
      time: "14:00",
      duration: 120,
      color: "cyan",
      center: "Bethnal Green (Chalk Farm)",
    },
    {
      id: "chalk-3",
      summary: "BG Center: Room B (Urgent Consultation)",
      date: formatDateOffset(4),
      time: "11:00",
      duration: 60,
      color: "cyan",
      center: "Bethnal Green (Chalk Farm)",
    },
    {
      id: "wtr5-1",
      summary: "Waterloo: WTR 5 (Group Mindfulness)",
      date: formatDateOffset(2),
      time: "10:00",
      duration: 110,
      color: "indigo",
      center: "Waterloo Center (WTR 5)",
    },
    {
      id: "wtr5-2",
      summary: "Waterloo: WTR 5 (Somatic Healing Block)",
      date: formatDateOffset(2),
      time: "14:30",
      duration: 80,
      color: "indigo",
      center: "Waterloo Center (WTR 5)",
    },
    {
      id: "wtr5-3",
      summary: "Waterloo: WTR 5 (Clinical Seminar)",
      date: formatDateOffset(4),
      time: "14:00",
      duration: 90,
      color: "indigo",
      center: "Waterloo Center (WTR 5)",
    },
    {
      id: "wtr14-1",
      summary: "Waterloo: Room WTR 2 (Intake Session)",
      date: formatDateOffset(0),
      time: "11:00",
      duration: 120,
      color: "amber",
      center: "Waterloo Center (WTR 2)",
    },
    {
      id: "wtr14-2",
      summary: "Waterloo: Room WTR 3 (ADHD Testing)",
      date: formatDateOffset(3),
      time: "09:00",
      duration: 150,
      color: "amber",
      center: "Waterloo Center (WTR 3)",
    },
    {
      id: "wtr14-3",
      summary: "Waterloo: Room WTR 1 (Couples Therapy Seminar)",
      date: formatDateOffset(4),
      time: "15:30",
      duration: 90,
      color: "amber",
      center: "Waterloo Center (WTR 1)",
    },
  ];
}

export function buildVisibleCalendarEvents(options: {
  monday: Date;
  appointments: Appointment[];
  googleEvents: CalendarEvent[];
  realChalkFarmEvents: CalendarEvent[];
  chalkFarmCalendarId: string | null;
  showPrimary: boolean;
  showChalkFarm: boolean;
  showWtr5: boolean;
  showWtr1To4: boolean;
}): CalendarGridEvent[] {
  const {
    monday,
    appointments,
    googleEvents,
    realChalkFarmEvents,
    chalkFarmCalendarId,
    showPrimary,
    showChalkFarm,
    showWtr5,
    showWtr1To4,
  } = options;

  const sharedEvents = getSharedCalendarEvents(monday);
  const visibleEvents: CalendarGridEvent[] = [];

  if (showPrimary) {
    appointments
      .filter((app) => app.status !== "cancelled")
      .forEach((app) => {
        visibleEvents.push({
          id: `app-${app.id}`,
          source: "firestore",
          summary: `Session: ${app.clientName}`,
          date: app.date,
          time: app.time,
          duration: app.duration,
          color: "sage",
          center: "Primary Registry",
          raw: app,
        });
      });

    const eventsToRender =
      googleEvents.length === 0
        ? [
            {
              id: "demo-gcal-1",
              summary: "Personal Work Calendar Sync Block",
              start: { dateTime: `${getOffsetDateString(monday, 1)}T15:00:00` },
              end: { dateTime: `${getOffsetDateString(monday, 1)}T16:00:00` },
            },
            {
              id: "demo-gcal-2",
              summary: "Clinic Management Alignment Sync",
              start: { dateTime: `${getOffsetDateString(monday, 3)}T10:00:00` },
              end: { dateTime: `${getOffsetDateString(monday, 3)}T11:30:00` },
            },
          ]
        : googleEvents;

    eventsToRender.forEach((e) => {
      if (!e.start.dateTime) return;
      const startD = new Date(e.start.dateTime);
      const endD = e.end.dateTime
        ? new Date(e.end.dateTime)
        : new Date(startD.getTime() + 60 * 60 * 1000);
      const durationMins = Math.round((endD.getTime() - startD.getTime()) / (60 * 1000));
      const isoDate = startD.toISOString().split("T")[0];
      const timeStr = startD.toTimeString().split(" ")[0].substring(0, 5);
      const isAlreadyLocal = appointments.some((app) => app.calendarEventId === e.id);
      if (!isAlreadyLocal) {
        visibleEvents.push({
          id: `gcal-${e.id}`,
          source: "gcal",
          summary: e.summary || "Blocked Slot",
          date: isoDate,
          time: timeStr,
          duration: durationMins,
          color: "slate",
          center: "Google Calendar Sync",
        });
      }
    });
  }

  if (showChalkFarm) {
    if (chalkFarmCalendarId && realChalkFarmEvents.length > 0) {
      realChalkFarmEvents.forEach((e) => {
        if (!e.start.dateTime) return;
        const startD = new Date(e.start.dateTime);
        const endD = e.end.dateTime
          ? new Date(e.end.dateTime)
          : new Date(startD.getTime() + 60 * 60 * 1000);
        const durationMins = Math.round((endD.getTime() - startD.getTime()) / (60 * 1000));
        const isoDate = startD.toISOString().split("T")[0];
        const timeStr = startD.toTimeString().split(" ")[0].substring(0, 5);
        visibleEvents.push({
          id: `chalk-real-${e.id}`,
          source: "gcal",
          summary: e.summary || "Blocked Slot (Chalk Farm Studio)",
          date: isoDate,
          time: timeStr,
          duration: durationMins,
          color: "cyan",
          center: "Chalk Farm Studio (Live Google Calendar)",
        });
      });
    } else {
      sharedEvents
        .filter((e) => e.id.startsWith("chalk"))
        .forEach((e) => {
          visibleEvents.push({ ...e, center: "Chalk Farm Studio (Demo Mode)" });
        });
    }
  }

  if (showWtr5) {
    sharedEvents.filter((e) => e.id.startsWith("wtr5")).forEach((e) => visibleEvents.push(e));
  }
  if (showWtr1To4) {
    sharedEvents.filter((e) => e.id.startsWith("wtr14")).forEach((e) => visibleEvents.push(e));
  }

  return visibleEvents;
}

export function toggleSelectedSlot(
  selectedSlots: SelectedSlot[],
  dayDate: string,
  hourNum: number,
  minuteNum = 0
): SelectedSlot[] {
  const hourStr = `${String(hourNum).padStart(2, "0")}:${String(minuteNum).padStart(2, "0")}`;
  const isSelected = selectedSlots.some((s) => s.date === dayDate && s.time === hourStr);
  if (isSelected) {
    return selectedSlots.filter((s) => !(s.date === dayDate && s.time === hourStr));
  }
  return [
    ...selectedSlots,
    { date: dayDate, time: hourStr, label: buildSlotLabel(dayDate, hourNum, minuteNum) },
  ];
}