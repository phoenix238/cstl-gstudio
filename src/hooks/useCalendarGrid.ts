import { useEffect, useMemo, useState } from "react";
import type { Appointment } from "../types";
import {
  fetchGoogleCalendarEvents,
  fetchGoogleCalendarEventsForCalendar,
  fetchGoogleCalendarList,
  type CalendarEvent,
} from "../googleApi";
import {
  buildVisibleCalendarEvents,
  formatDateISO,
  getStartOfWeek,
  getWeekDays,
  type SelectedSlot,
} from "../lib/calendarUtils";

export function useCalendarGrid(accessToken: string, appointments: Appointment[]) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingCal, setIsLoadingCal] = useState(false);
  const [chalkFarmCalendarId, setChalkFarmCalendarId] = useState<string | null>(null);
  const [realChalkFarmEvents, setRealChalkFarmEvents] = useState<CalendarEvent[]>([]);
  const [showPrimary, setShowPrimary] = useState(true);
  const [showChalkFarm, setShowChalkFarm] = useState(true);
  const [showWtr5, setShowWtr5] = useState(true);
  const [showWtr1To4, setShowWtr1To4] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);

  const monday = useMemo(() => getStartOfWeek(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(monday), [monday]);
  const sunday = weekDays[6];

  const loadGoogleCalendar = async () => {
    if (!accessToken || accessToken === "null") {
      setIsLoadingCal(false);
      return;
    }
    setIsLoadingCal(true);
    try {
      const events = await fetchGoogleCalendarEvents(accessToken);
      setGoogleEvents(events);

      const calendarList = await fetchGoogleCalendarList(accessToken);
      const matchedCal = calendarList.find(
        (cal) =>
          cal.summary.toLowerCase().includes("chalk farm") ||
          cal.summary.toLowerCase().includes("chalkfarm")
      );

      if (matchedCal) {
        setChalkFarmCalendarId(matchedCal.id);
        const cfEvents = await fetchGoogleCalendarEventsForCalendar(matchedCal.id, accessToken);
        setRealChalkFarmEvents(cfEvents);
      } else {
        setChalkFarmCalendarId(null);
        setRealChalkFarmEvents([]);
      }
    } catch (err) {
      console.warn("Unable to sync google calendar:", err);
    } finally {
      setIsLoadingCal(false);
    }
  };

  useEffect(() => {
    loadGoogleCalendar();
  }, [accessToken, appointments.length]);

  const visibleEvents = useMemo(
    () =>
      buildVisibleCalendarEvents({
        monday,
        appointments,
        googleEvents,
        realChalkFarmEvents,
        chalkFarmCalendarId,
        showPrimary,
        showChalkFarm,
        showWtr5,
        showWtr1To4,
      }),
    [
      monday,
      appointments,
      googleEvents,
      realChalkFarmEvents,
      chalkFarmCalendarId,
      showPrimary,
      showChalkFarm,
      showWtr5,
      showWtr1To4,
    ]
  );

  const navigateWeek = (weeks: number) => {
    const nextDate = new Date(currentDate);
    nextDate.setDate(currentDate.getDate() + weeks * 7);
    setCurrentDate(nextDate);
  };

  const navigateToday = () => setCurrentDate(new Date());

  return {
    currentDate,
    monday,
    weekDays,
    sunday,
    googleEvents,
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
  };
}