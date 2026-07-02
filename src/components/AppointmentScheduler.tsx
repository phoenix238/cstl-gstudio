import React, { useState, useEffect } from 'react';
import { 
  Calendar, 
  Clock, 
  Plus, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  ChevronRight, 
  ChevronLeft, 
  User, 
  Loader2, 
  Sparkles, 
  RefreshCw, 
  Eye, 
  Copy, 
  Check, 
  Info, 
  List, 
  CalendarCheck, 
  MapPin, 
  HelpCircle 
} from 'lucide-react';
import { Appointment, Client } from '../types';
import { 
  createGoogleCalendarEvent, 
  deleteGoogleCalendarEvent, 
  fetchGoogleCalendarEvents, 
  CalendarEvent,
  fetchGoogleCalendarList,
  fetchGoogleCalendarEventsForCalendar
} from '../googleApi';
import { motion, AnimatePresence } from 'motion/react';

interface AppointmentSchedulerProps {
  appointments: Appointment[];
  clients: Client[];
  accessToken: string;
  onAddAppointment: (appointment: Appointment) => void;
  onCancelAppointment: (appointmentId: string) => void;
  onCompleteAppointment: (appointmentId: string) => void;
}

interface SelectedSlot {
  date: string;
  time: string;
  label: string;
}

export default function AppointmentScheduler({
  appointments,
  clients,
  accessToken,
  onAddAppointment,
  onCancelAppointment,
  onCompleteAppointment,
}: AppointmentSchedulerProps) {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'grid' | 'agenda'>('grid');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  
  // Appointment scheduling states
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(60); // standard clinical hour
  const [privateNotes, setPrivateNotes] = useState('');
  
  // Google API Sync states
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingCal, setIsLoadingCal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Real Google Calendar for Chalk Farm Studio
  const [chalkFarmCalendarId, setChalkFarmCalendarId] = useState<string | null>(null);
  const [realChalkFarmEvents, setRealChalkFarmEvents] = useState<CalendarEvent[]>([]);

  // Shared Clinic Calendars Toggles
  const [showPrimary, setShowPrimary] = useState(true);
  const [showChalkFarm, setShowChalkFarm] = useState(true);
  const [showWtr5, setShowWtr5] = useState(true);
  const [showWtr1To4, setShowWtr1To4] = useState(false);

  // Manual slot selection & offer generator states
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerText, setOfferText] = useState('');
  const [copied, setCopied] = useState(false);
  const [syncLocation, setSyncLocation] = useState<'waterloo' | 'bethnal_green'>('waterloo');

  // Grid Constants
  const startHour = 8; // 8 AM
  const endHour = 19;  // 7 PM
  const rowHeight = 100; // pixels per hour block for 15-minute resolution (25px per cell)
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  // Sync / Load Google Calendar Events
  const loadGoogleCalendar = async () => {
    if (!accessToken || accessToken === 'null') {
      setIsLoadingCal(false);
      return;
    }
    setIsLoadingCal(true);
    try {
      // 1. Fetch primary calendar events
      const events = await fetchGoogleCalendarEvents(accessToken);
      setGoogleEvents(events);

      // 2. Fetch all calendars to find "Chalk Farm Studio"
      const calendarList = await fetchGoogleCalendarList(accessToken);
      const matchedCal = calendarList.find(cal => 
        cal.summary.toLowerCase().includes('chalk farm') || 
        cal.summary.toLowerCase().includes('chalkfarm')
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
      console.warn('Unable to sync google calendar:', err);
    } finally {
      setIsLoadingCal(false);
    }
  };

  useEffect(() => {
    loadGoogleCalendar();
  }, [appointments]);

  // Handle schedule submit
  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) return;

    const client = clients.find((c) => c.id === selectedClientId);
    if (!client) return;

    setIsSyncing(true);

    try {
      const startDateTimeStr = `${date}T${time}:00`;
      const startDateObj = new Date(startDateTimeStr);
      const endDateObj = new Date(startDateObj.getTime() + duration * 60 * 1000);

      // Create Event on Google Calendar
      let calendarEventId = '';
      if (accessToken) {
        if (syncLocation === 'waterloo') {
          calendarEventId = await createGoogleCalendarEvent(
            {
              summary: 'R5 phoenix',
              description: `Scheduled via Therapy Control Center for Waterloo. Client: ${client.name}. Notes: ${privateNotes}`,
              startTime: startDateObj.toISOString(),
              endTime: endDateObj.toISOString(),
              calendarId: '7cd19a8a0df5e5ff621f3400d0cc2ca78ee6b76b3d6f56740a4be51b03a3ec98@group.calendar.google.com'
            },
            accessToken
          );
        } else {
          // Chalk Farm Studio (Bethnal Green)
          // 1. Shared Calendar (chalkfarm215@gmail.com) with exact title "chalk farm phoenix"
          calendarEventId = await createGoogleCalendarEvent(
            {
              summary: 'chalk farm phoenix',
              description: `Scheduled via Therapy Control Center for Chalk Farm. Client: ${client.name}. Notes: ${privateNotes}`,
              startTime: startDateObj.toISOString(),
              endTime: endDateObj.toISOString(),
              calendarId: 'chalkfarm215@gmail.com'
            },
            accessToken
          );

          // 2. Personal Calendar (phoenix@tanner.me) for exactly 60 minutes
          try {
            await createGoogleCalendarEvent(
              {
                summary: `Therapy Session: ${client.name}`,
                description: `Scheduled via Therapy Control Center for Chalk Farm. Notes: ${privateNotes}`,
                startTime: startDateObj.toISOString(),
                endTime: endDateObj.toISOString(),
                calendarId: 'phoenix@tanner.me'
              },
              accessToken
            );
          } catch (personalErr) {
            console.warn('Unable to book to personal calendar phoenix@tanner.me, trying primary:', personalErr);
            try {
              await createGoogleCalendarEvent(
                {
                  summary: `Therapy Session: ${client.name}`,
                  description: `Scheduled via Therapy Control Center for Chalk Farm. Notes: ${privateNotes}`,
                  startTime: startDateObj.toISOString(),
                  endTime: endDateObj.toISOString(),
                  calendarId: 'primary'
                },
                accessToken
              );
            } catch (fallbackErr) {
              console.error('Failed to create event on primary calendar:', fallbackErr);
            }
          }
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150));
        calendarEventId = `offline-sync-${Math.random().toString(36).substr(2, 9)}`;
      }

      // Create appointment object inside state
      const newApp: Appointment = {
        id: Math.random().toString(36).substr(2, 9),
        clientId: client.id,
        clientName: client.name,
        date,
        time,
        duration,
        status: 'scheduled',
        calendarEventId,
        notes: privateNotes,
      };

      onAddAppointment(newApp);

      // Reset form
      setShowAddForm(false);
      setSelectedClientId('');
      setPrivateNotes('');
      setDate(new Date().toISOString().split('T')[0]);
      setTime('09:00');
    } catch (err) {
      console.error('Error scheduling session with Calendar sync:', err);
      alert('Could not fully sync session to Google Calendar, but scheduled in local database.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Cancel Appointment
  const handleCancelApp = async (app: Appointment) => {
    const confirmCancel = window.confirm(
      `Are you sure you want to cancel the session with ${app.clientName}? This will remove the event from Google Calendar.`
    );
    if (!confirmCancel) return;

    if (app.calendarEventId && accessToken) {
      try {
        await deleteGoogleCalendarEvent(app.calendarEventId, accessToken);
      } catch (err) {
        console.error('Failed to delete Google Calendar Event:', err);
      }
    }

    onCancelAppointment(app.id);
  };

  // Date utilities
  const getStartOfWeek = (d: Date) => {
    const temp = new Date(d);
    const day = temp.getDay();
    // Adjust to Monday as start of week
    const diff = temp.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(temp.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  };

  const getWeekDays = (monday: Date) => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const formatDateISO = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const monday = getStartOfWeek(currentDate);
  const weekDays = getWeekDays(monday);
  const sunday = weekDays[6];

  const getOffsetDateString = (offset: number) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    return formatDateISO(d);
  };

  const getOffsetDateLabel = (offset: number, time: string) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    const dayName = d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
    return `${dayName} at ${time}`;
  };

  const navigateWeek = (weeks: number) => {
    const nextDate = new Date(currentDate);
    nextDate.setDate(currentDate.getDate() + weeks * 7);
    setCurrentDate(nextDate);
  };

  const navigateToday = () => {
    setCurrentDate(new Date());
  };

  // Parse time "HH:MM" to decimal hours (e.g. "09:30" -> 9.5)
  const parseTimeToDecimal = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return h + m / 60;
  };

  // Generate mock shared calendar events anchored to the current week
  const getSharedCalendarEvents = (mon: Date) => {
    const formatDateOffset = (offset: number) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + offset);
      return formatDateISO(d);
    };

    return [
      // Bethnal Green Center = "Chalk Farm" shared calendar (Cyan/Teal theme)
      {
        id: 'chalk-1',
        calendar: 'chalk',
        summary: 'BG Center: Room A (Clinical Intake)',
        date: formatDateOffset(1), // Tuesday
        time: '09:30',
        duration: 90,
        color: 'cyan',
        center: 'Bethnal Green (Chalk Farm)'
      },
      {
        id: 'chalk-2',
        calendar: 'chalk',
        summary: 'BG Center: Case Supervision Meeting',
        date: formatDateOffset(3), // Thursday
        time: '14:00',
        duration: 120,
        color: 'cyan',
        center: 'Bethnal Green (Chalk Farm)'
      },
      {
        id: 'chalk-3',
        calendar: 'chalk',
        summary: 'BG Center: Room B (Urgent Consultation)',
        date: formatDateOffset(4), // Friday
        time: '11:00',
        duration: 60,
        color: 'cyan',
        center: 'Bethnal Green (Chalk Farm)'
      },

      // Waterloo Center = "WTR 5" shared calendar (Indigo theme)
      {
        id: 'wtr5-1',
        calendar: 'wtr5',
        summary: 'Waterloo: WTR 5 (Group Mindfulness)',
        date: formatDateOffset(2), // Wednesday
        time: '10:00',
        duration: 110,
        color: 'indigo',
        center: 'Waterloo Center (WTR 5)'
      },
      {
        id: 'wtr5-2',
        calendar: 'wtr5',
        summary: 'Waterloo: WTR 5 (Somatic Healing Block)',
        date: formatDateOffset(2), // Wednesday
        time: '14:30',
        duration: 80,
        color: 'indigo',
        center: 'Waterloo Center (WTR 5)'
      },
      {
        id: 'wtr5-3',
        calendar: 'wtr5',
        summary: 'Waterloo: WTR 5 (Clinical Seminar)',
        date: formatDateOffset(4), // Friday
        time: '14:00',
        duration: 90,
        color: 'indigo',
        center: 'Waterloo Center (WTR 5)'
      },

      // Waterloo Center = "WTR 1-4" shared calendars (Amber theme)
      {
        id: 'wtr14-1',
        calendar: 'wtr14',
        summary: 'Waterloo: Room WTR 2 (Intake Session)',
        date: formatDateOffset(0), // Monday
        time: '11:00',
        duration: 120,
        color: 'amber',
        center: 'Waterloo Center (WTR 2)'
      },
      {
        id: 'wtr14-2',
        calendar: 'wtr14',
        summary: 'Waterloo: Room WTR 3 (ADHD Testing)',
        date: formatDateOffset(3), // Thursday
        time: '09:00',
        duration: 150,
        color: 'amber',
        center: 'Waterloo Center (WTR 3)'
      },
      {
        id: 'wtr14-3',
        calendar: 'wtr14',
        summary: 'Waterloo: Room WTR 1 (Couples Therapy Seminar)',
        date: formatDateOffset(4), // Friday
        time: '15:30',
        duration: 90,
        color: 'amber',
        center: 'Waterloo Center (WTR 1)'
      }
    ];
  };

  const sharedEvents = getSharedCalendarEvents(monday);
  const visibleEvents: any[] = [];

  // Merge events based on active toggles
  if (showPrimary) {
    // Firestore appointments
    appointments
      .filter((app) => app.status !== 'cancelled')
      .forEach((app) => {
        visibleEvents.push({
          id: `app-${app.id}`,
          source: 'firestore',
          summary: `Session: ${app.clientName}`,
          date: app.date,
          time: app.time,
          duration: app.duration,
          color: 'sage',
          center: 'Primary Registry',
          raw: app
        });
      });

    // Google Calendar events (deduplicate if synced)
    const eventsToRender = (googleEvents.length === 0)
      ? [
          {
            id: 'demo-gcal-1',
            summary: 'Personal Work Calendar Sync Block',
            start: { dateTime: `${getOffsetDateString(1)}T15:00:00` },
            end: { dateTime: `${getOffsetDateString(1)}T16:00:00` }
          },
          {
            id: 'demo-gcal-2',
            summary: 'Clinic Management Alignment Sync',
            start: { dateTime: `${getOffsetDateString(3)}T10:00:00` },
            end: { dateTime: `${getOffsetDateString(3)}T11:30:00` }
          }
        ]
      : googleEvents;

    eventsToRender.forEach((e) => {
      if (e.start.dateTime) {
        const startD = new Date(e.start.dateTime);
        const endD = e.end.dateTime ? new Date(e.end.dateTime) : new Date(startD.getTime() + 60 * 60 * 1000);
        const durationMins = Math.round((endD.getTime() - startD.getTime()) / (60 * 1000));
        
        const isoDate = startD.toISOString().split('T')[0];
        const timeStr = startD.toTimeString().split(' ')[0].substring(0, 5);

        const isAlreadyLocal = appointments.some((app) => app.calendarEventId === e.id);
        if (!isAlreadyLocal) {
          visibleEvents.push({
            id: `gcal-${e.id}`,
            source: 'gcal',
            summary: e.summary || 'Blocked Slot',
            date: isoDate,
            time: timeStr,
            duration: durationMins,
            color: 'slate',
            center: 'Google Calendar Sync'
          });
        }
      }
    });
  }

  if (showChalkFarm) {
    if (chalkFarmCalendarId && realChalkFarmEvents.length > 0) {
      realChalkFarmEvents.forEach((e) => {
        if (e.start.dateTime) {
          const startD = new Date(e.start.dateTime);
          const endD = e.end.dateTime ? new Date(e.end.dateTime) : new Date(startD.getTime() + 60 * 60 * 1000);
          const durationMins = Math.round((endD.getTime() - startD.getTime()) / (60 * 1000));
          
          const isoDate = startD.toISOString().split('T')[0];
          const timeStr = startD.toTimeString().split(' ')[0].substring(0, 5);

          visibleEvents.push({
            id: `chalk-real-${e.id}`,
            source: 'gcal',
            summary: e.summary || 'Blocked Slot (Chalk Farm Studio)',
            date: isoDate,
            time: timeStr,
            duration: durationMins,
            color: 'cyan',
            center: 'Chalk Farm Studio (Live Google Calendar)'
          });
        }
      });
    } else {
      sharedEvents.filter((e) => e.calendar === 'chalk').forEach((e) => {
        visibleEvents.push({
          ...e,
          center: 'Chalk Farm Studio (Demo Mode)'
        });
      });
    }
  }
  if (showWtr5) {
    sharedEvents.filter((e) => e.calendar === 'wtr5').forEach((e) => visibleEvents.push(e));
  }
  if (showWtr1To4) {
    sharedEvents.filter((e) => e.calendar === 'wtr14').forEach((e) => visibleEvents.push(e));
  }

  // Handle click on grid cell for manual slot selection
  const handleToggleSlot = (dayDate: string, hourNum: number, minuteNum: number = 0) => {
    const hourStr = String(hourNum).padStart(2, '0') + ':' + String(minuteNum).padStart(2, '0');
    const [yr, mo, dy] = dayDate.split('-').map(Number);
    const d = new Date(yr, mo - 1, dy, hourNum, minuteNum);
    const label = d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const isSelected = selectedSlots.some((s) => s.date === dayDate && s.time === hourStr);

    if (isSelected) {
      setSelectedSlots((prev) => prev.filter((s) => !(s.date === dayDate && s.time === hourStr)));
    } else {
      setSelectedSlots((prev) => [...prev, { date: dayDate, time: hourStr, label }]);
    }
  };

  // Generate scheduling proposal offer text for clinical clients
  const generateOfferText = () => {
    if (selectedSlots.length === 0) return;

    const sorted = [...selectedSlots].sort((a, b) => {
      return new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime();
    });

    const optionsText = sorted.map((s) => {
      const d = new Date(`${s.date}T${s.time}`);
      const dateFormatted = d.toLocaleDateString('en-GB', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      const timeFormatted = d.toLocaleTimeString('en-GB', {
        hour: 'numeric',
        minute: '2-digit',
      });
      return `${dateFormatted} at ${timeFormatted}`;
    }).join(', ');

    const locationName = syncLocation === 'waterloo' ? 'Waterloo' : 'Bethnal Green';

    const text = `Hi, lovely to hear from you. I have a few open spaces coming up at ${locationName}: ${optionsText}. Let me know if one of those allows you the time to arrive comfortably; if not, we'll find another way.\n\nwith gratitude Phoenix`;

    setOfferText(text);
    setShowOfferModal(true);
  };

  const handleCopyOffer = () => {
    navigator.clipboard.writeText(offerText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col h-full font-sans bg-white" id="scheduler-workstation-root">
      
      {/* Sub Header / Control Bar */}
      <div className="flex flex-col border-b border-natural-border bg-natural-sidebar/10 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 gap-3 border-b border-natural-border/60">
          <div>
            <h2 className="font-serif italic text-xl font-bold text-natural-text tracking-tight flex items-center gap-2">
              <CalendarCheck className="w-5.5 h-5.5 text-natural-sage" /> Schedule Workstation
            </h2>
            <p className="text-[10px] text-natural-muted font-sans mt-0.5 font-medium uppercase tracking-wider">
              Clinical calendar overlay & availability coordinator
            </p>
          </div>
          
          <div className="flex items-center gap-2">


            {/* View Mode Switcher */}
            <div className="flex bg-natural-sidebar p-1 rounded-xl border border-natural-border">
              <button
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid' 
                    ? 'bg-white text-natural-sage shadow-xs' 
                    : 'text-natural-muted hover:text-natural-sage'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Weekly Grid</span>
              </button>
              <button
                onClick={() => setViewMode('agenda')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'agenda' 
                    ? 'bg-white text-natural-sage shadow-xs' 
                    : 'text-natural-muted hover:text-natural-sage'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>Agenda List</span>
              </button>
            </div>

            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-natural-sage hover:bg-natural-sage-light text-white font-sans text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-all shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Book Session
            </button>
          </div>
        </div>

        {/* Navigation & Active Filters Toolbar */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-3.5 gap-4">
          
          {/* Week Nav controls */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigateWeek(-1)}
                className="p-1.5 rounded-lg bg-white border border-[#e0e0d6] text-natural-muted hover:text-natural-sage hover:bg-natural-bg cursor-pointer shadow-2xs transition-colors"
                title="Previous Week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={navigateToday}
                className="px-3 py-1.5 rounded-lg bg-white border border-[#e0e0d6] text-xs font-bold text-natural-muted hover:text-natural-sage hover:bg-natural-bg cursor-pointer shadow-2xs transition-colors"
              >
                Today
              </button>
              <button
                onClick={() => navigateWeek(1)}
                className="p-1.5 rounded-lg bg-white border border-[#e0e0d6] text-natural-muted hover:text-natural-sage hover:bg-natural-bg cursor-pointer shadow-2xs transition-colors"
                title="Next Week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <span className="text-xs font-bold text-natural-text font-serif italic">
              {monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              {' — '}
              {sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          {/* Shared calendars overlay pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[9px] uppercase font-bold tracking-wider text-natural-muted mr-1">Overlays:</span>
            
            <button
              onClick={() => setShowPrimary(!showPrimary)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                showPrimary 
                  ? 'bg-natural-sage/10 border-natural-sage text-natural-sage font-semibold' 
                  : 'bg-white border-[#e0e0d6] text-natural-muted/60 hover:text-natural-muted'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${showPrimary ? 'bg-natural-sage' : 'bg-natural-muted/40'}`}></div>
              My Schedule
            </button>

            <button
              onClick={() => setShowChalkFarm(!showChalkFarm)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                showChalkFarm 
                  ? 'bg-cyan-50 border-cyan-400 text-cyan-800 font-semibold' 
                  : 'bg-white border-[#e0e0d6] text-natural-muted/60 hover:text-natural-muted'
              }`}
              title={chalkFarmCalendarId ? 'Connected to live Google Calendar!' : 'No custom Google Calendar found for "Chalk Farm Studio". Showing demo events.'}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${showChalkFarm ? 'bg-cyan-500' : 'bg-natural-muted/40'}`}></div>
              Chalk Farm Studio {chalkFarmCalendarId ? '(Live)' : '(Demo)'}
            </button>

            <button
              onClick={() => setShowWtr5(!showWtr5)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                showWtr5 
                  ? 'bg-indigo-50 border-indigo-400 text-indigo-800 font-semibold' 
                  : 'bg-white border-[#e0e0d6] text-natural-muted/60 hover:text-natural-muted'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${showWtr5 ? 'bg-indigo-500' : 'bg-natural-muted/40'}`}></div>
              Waterloo (WTR 5)
            </button>

            <button
              onClick={() => setShowWtr1To4(!showWtr1To4)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                showWtr1To4 
                  ? 'bg-amber-50 border-amber-400 text-amber-800 font-semibold' 
                  : 'bg-white border-[#e0e0d6] text-natural-muted/60 hover:text-natural-muted'
              }`}
            >
              <div className={`w-1.5 h-1.5 rounded-full ${showWtr1To4 ? 'bg-amber-500' : 'bg-natural-muted/40'}`}></div>
              Waterloo (WTR 1-4)
            </button>
            
            <button
              onClick={loadGoogleCalendar}
              disabled={isLoadingCal}
              className="p-1 rounded bg-white border border-[#e0e0d6] text-natural-sage disabled:opacity-50 cursor-pointer shadow-2xs ml-1"
              title="Refresh Google Calendar Stream"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingCal ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-5 pb-32">
        
        {/* Book Session Form Dropdown/Collapse */}
        <AnimatePresence>
          {showAddForm && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onSubmit={handleScheduleSubmit}
              className="bg-natural-bg/50 border border-natural-border rounded-2xl p-5 mb-5 space-y-4 overflow-hidden text-xs"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-serif italic font-bold text-natural-sage text-sm flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-amber-500" /> New Session Reservation
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider text-natural-muted font-mono">
                  Google Workspace Sync Enabled
                </span>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                  Select Registered Client
                </label>
                <select
                  required
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                >
                  <option value="">-- Select Client --</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                    Time
                  </label>
                  <input
                    type="time"
                    required
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                    Duration
                  </label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                  >
                    <option value={30}>30 mins (Check-in)</option>
                    <option value={60}>60 mins (Standard Hour)</option>
                    <option value={90}>90 mins (Extended Session)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                    Location Sync Target
                  </label>
                  <select
                    value={syncLocation}
                    onChange={(e) => setSyncLocation(e.target.value as 'waterloo' | 'bethnal_green')}
                    className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                  >
                    <option value="waterloo">Waterloo (WTR Room 5)</option>
                    <option value="bethnal_green">Chalk Farm Studio (Bethnal Green)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold tracking-wider text-natural-muted mb-1">
                  Intake Notes / Clinical Directives
                </label>
                <textarea
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  placeholder="Focus areas or therapeutic goals for this session..."
                  rows={2}
                  className="w-full bg-white border border-natural-border rounded-xl px-3 py-2 text-natural-text font-sans focus:outline-none focus:border-natural-sage"
                />
              </div>

              <div className="flex gap-2 pt-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 bg-white border border-natural-border text-natural-text hover:bg-natural-bg font-bold py-2 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSyncing}
                  className="flex-1 bg-natural-sage hover:bg-natural-sage-light text-white font-bold py-2 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing with Google...
                    </>
                  ) : (
                    'Confirm Schedule'
                  )}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* -------------------- VIEW 1: WEEKLY VISUAL GRID CALENDAR -------------------- */}
        {viewMode === 'grid' && (
          <div className="bg-white rounded-2xl border border-natural-border overflow-hidden shadow-2xs" id="visual-grid-container">
            {/* Legend / Info bar */}
            <div className="px-4 py-2 bg-natural-bg/40 border-b border-natural-border flex flex-wrap items-center justify-between text-[10px] text-natural-muted font-sans gap-2">
              <span className="flex items-center gap-1">
                <Info className="w-3 h-3 text-natural-sage" />
                Tap/click any empty time slot cell to manually compile availability options.
              </span>
              
              <div className="flex items-center gap-2">
                <span className="font-semibold">Grid Key:</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-natural-sage"></span> My Sessions</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-cyan-200 border border-cyan-300"></span> Chalk Farm Studio</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-indigo-200 border border-indigo-300"></span> WTR 5</span>
              </div>
            </div>

            {/* Horizontal Scroll wrapper for responsive mobile grids */}
            <div className="overflow-x-auto">
              <div className="min-w-[750px] grid grid-cols-8 divide-x divide-natural-border/60 relative">
                
                {/* 1. First column: Time Row Labels */}
                <div className="col-span-1 pt-12 select-none">
                  {hours.map((hr) => (
                    <div 
                      key={hr} 
                      className="text-right pr-3 font-mono text-[10px] text-natural-muted/80 font-semibold"
                      style={{ height: `${rowHeight}px`, lineHeight: '14px' }}
                    >
                      {hr > 12 ? `${hr - 12}:00 PM` : hr === 12 ? '12:00 PM' : `${hr}:00 AM`}
                    </div>
                  ))}
                </div>

                {/* 2. Next 7 columns: Days */}
                {weekDays.map((dayDateObj) => {
                  const dayStr = formatDateISO(dayDateObj);
                  const isToday = formatDateISO(new Date()) === dayStr;
                  const dayEvents = visibleEvents.filter((ev) => ev.date === dayStr);

                  return (
                    <div key={dayStr} className="col-span-1 relative flex flex-col">
                      
                      {/* Day Header */}
                      <div className={`h-12 border-b border-natural-border flex flex-col justify-center items-center py-1 select-none ${
                        isToday ? 'bg-natural-sage/5 border-b-2 border-b-natural-sage' : ''
                      }`}>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          isToday ? 'text-natural-sage font-extrabold' : 'text-natural-muted'
                        }`}>
                          {dayDateObj.toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                        <span className={`text-xs font-serif italic ${
                          isToday ? 'text-natural-sage font-extrabold text-sm' : 'text-natural-text font-bold'
                        }`}>
                          {dayDateObj.getDate()}
                        </span>
                      </div>

                      {/* Day Grid Column */}
                      <div className="relative bg-gradient-to-b from-white to-natural-bg/5" style={{ height: `${hours.length * rowHeight}px` }}>
                        
                        {/* Render background grid cells with 15-minute subdivisions */}
                        {hours.map((hr) => {
                          return (
                            <div
                              key={hr}
                              className="relative border-b border-natural-border/20 flex flex-col"
                              style={{ height: `${rowHeight}px` }}
                            >
                              {[0, 15, 30, 45].map((minVal, qIdx) => {
                                const timeStr = String(hr).padStart(2, '0') + ':' + String(minVal).padStart(2, '0');
                                const slotDecimal = hr + minVal / 60;
                                const slotEndDecimal = slotDecimal + 1; // 60 mins session
                                
                                const hasEvent = dayEvents.some((e) => {
                                  const evStartDecimal = parseTimeToDecimal(e.time);
                                  const evEndDecimal = evStartDecimal + (e.duration / 60);
                                  return Math.max(slotDecimal, evStartDecimal) < Math.min(slotEndDecimal, evEndDecimal);
                                });

                                return (
                                  <div
                                    key={minVal}
                                    onClick={() => {
                                      if (!hasEvent) {
                                        handleToggleSlot(dayStr, hr, minVal);
                                      }
                                    }}
                                    className={`flex-1 relative group cursor-pointer transition-colors ${
                                      qIdx < 3 ? 'border-b border-dashed border-natural-border/10' : ''
                                    } ${
                                      hasEvent 
                                        ? 'bg-natural-sidebar/5 cursor-not-allowed opacity-40' 
                                        : 'hover:bg-natural-sage/15'
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
                          );
                        })}

                        {/* Render active selected proposals overlay blocks */}
                        {selectedSlots.filter((s) => s.date === dayStr).map((s, idx) => {
                          const startDecimal = parseTimeToDecimal(s.time);
                          const topPx = (startDecimal - startHour) * rowHeight;
                          const heightPx = rowHeight; // exactly 1 hour session

                          return (
                            <div
                              key={`selected-${s.time}-${idx}`}
                              onClick={() => {
                                const [hStr, mStr] = s.time.split(':');
                                handleToggleSlot(dayStr, parseInt(hStr), parseInt(mStr));
                              }}
                              className="absolute left-0.5 right-0.5 bg-[#fdfaf2]/95 hover:bg-[#fdfaf2] border-2 border-amber-400 rounded-xl p-2 text-[10px] leading-tight flex flex-col justify-between shadow-xs cursor-pointer z-20 group animate-fade-in"
                              style={{
                                top: `${topPx}px`,
                                height: `${heightPx}px`
                              }}
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

                        {/* Event Cards Overlay rendering */}
                        {dayEvents.map((ev, idx) => {
                          const evStartDecimal = parseTimeToDecimal(ev.time);
                          // Calculate vertical positions
                          const topPx = (evStartDecimal - startHour) * rowHeight;
                          const heightPx = (ev.duration / 60) * rowHeight;

                          // Theme based on calendar or source
                          let cardStyles = 'bg-slate-100 border-slate-300 text-slate-800';
                          if (ev.color === 'sage') cardStyles = 'bg-natural-sage text-white border-emerald-700';
                          if (ev.color === 'cyan') cardStyles = 'bg-cyan-50 text-cyan-900 border-cyan-300 hover:bg-cyan-100';
                          if (ev.color === 'indigo') cardStyles = 'bg-indigo-50 text-indigo-900 border-indigo-300 hover:bg-indigo-100';
                          if (ev.color === 'amber') cardStyles = 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100';

                          return (
                            <div
                              key={`${ev.id}-${idx}`}
                              className={`absolute left-0.5 right-0.5 rounded-lg border px-1.5 py-1 text-[9px] leading-tight flex flex-col justify-between shadow-3xs overflow-hidden select-none transition-transform z-10 ${cardStyles}`}
                              style={{ 
                                top: `${topPx}px`, 
                                height: `${heightPx}px`,
                                minHeight: '18px'
                              }}
                              title={`${ev.summary}\n${ev.center}\nTime: ${ev.time} (${ev.duration} mins)`}
                            >
                              <div className="truncate font-bold font-sans">
                                {ev.summary}
                              </div>
                              <div className="flex items-center justify-between text-[8px] opacity-90 truncate font-mono mt-0.5">
                                <span>{ev.time} ({ev.duration}m)</span>
                                <span className="opacity-75 uppercase tracking-wide text-[7px] font-bold">
                                  {ev.color === 'sage' ? 'Mine' : 'Room Busy'}
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
        )}

        {/* -------------------- VIEW 2: AGENDA LIST VIEW -------------------- */}
        {viewMode === 'agenda' && (
          <div className="space-y-6" id="agenda-list-view">
            
            {/* Local Therapist Center appointments */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-natural-muted font-mono flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-natural-sage" />
                Active Clinical Registry Appointments
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {appointments.length === 0 ? (
                  <p className="col-span-full text-xs text-natural-muted italic text-center py-8 bg-natural-bg/40 rounded-2xl border border-dashed border-natural-border">
                    No appointments currently scheduled in clinical registry.
                  </p>
                ) : (
                  [...appointments]
                    .sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime())
                    .map((app) => (
                      <div
                        key={app.id}
                        className="bg-white border border-[#e0e0d6] rounded-2xl p-4 flex justify-between items-start text-xs shadow-xs"
                      >
                        <div className="space-y-1 truncate pr-2">
                          <p className="font-bold text-natural-text text-sm truncate">{app.clientName}</p>
                          <p className="text-[11px] text-natural-sage font-medium flex items-center gap-1 font-mono">
                            <Calendar className="w-3 h-3" />
                            {new Date(app.date).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            at {app.time} ({app.duration} mins)
                          </p>
                          {app.notes && (
                            <p className="text-[11px] text-natural-muted bg-natural-bg/30 p-2 rounded-lg border border-natural-border/60 italic truncate">
                              "{app.notes}"
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                                app.status === 'scheduled'
                                  ? 'bg-natural-bg text-natural-sage border border-natural-border'
                                  : app.status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                  : 'bg-rose-50 text-rose-700 border border-rose-100'
                              }`}
                            >
                              {app.status}
                            </span>
                            {app.calendarEventId && (
                              <span className="text-[8px] bg-natural-sidebar/50 text-natural-sage border border-natural-border/60 rounded px-1.5 py-0.5 font-mono">
                                Google Synced
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {app.status === 'scheduled' && (
                            <>
                              <button
                                onClick={() => onCompleteAppointment(app.id)}
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                                title="Mark Completed"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleCancelApp(app)}
                                className="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 cursor-pointer"
                                title="Cancel Appointment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Google Calendar Streams List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-natural-muted font-mono flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-natural-sage" />
                  Live Google Calendar Sync Stream
                </h3>
              </div>

              <div className="space-y-2">
                {isLoadingCal ? (
                  <div className="flex items-center justify-center py-6 text-xs text-natural-muted gap-2">
                    <Loader2 className="w-4 h-4 text-natural-sage animate-spin" />
                    <span>Streaming calendar databases...</span>
                  </div>
                ) : googleEvents.length === 0 ? (
                  <p className="text-xs text-natural-muted italic text-center py-4 bg-natural-bg/30 rounded-xl">
                    No active external calendar events streamed for the current window.
                  </p>
                ) : (
                  googleEvents
                    .slice(0, 6)
                    .map((e) => (
                      <div
                        key={e.id}
                        className="bg-natural-bg/40 border border-natural-border/60 rounded-xl p-3 flex justify-between items-center text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-natural-text">{e.summary}</p>
                          <p className="text-[10px] text-natural-muted">
                            {e.start.dateTime
                              ? new Date(e.start.dateTime).toLocaleString(undefined, {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                 })
                              : e.start.date}
                          </p>
                        </div>
                        <span className="text-[9px] bg-white border border-natural-border text-natural-sage font-medium px-2.5 py-0.5 rounded-full font-mono shrink-0">
                          External Lockout
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* STICKY BOTTOM OFFER GENERATION BANNER (Flashes when slots are selected in grid view) */}
      <AnimatePresence>
        {selectedSlots.length > 0 && viewMode === 'grid' && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-16 md:bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl bg-[#fdfaf2] border-2 border-amber-300 shadow-xl rounded-[24px] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 z-40 animate-fadeIn"
          >
            <div className="flex items-center gap-2.5 text-xs text-amber-950 font-sans">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-800 font-mono shrink-0">
                {selectedSlots.length}
              </div>
              <div>
                <p className="font-bold font-serif italic text-sm">Clinical Slots Selected</p>
                <p className="text-[11px] text-amber-800 leading-tight">Directly compiling a formatted schedule offer for the client</p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => setSelectedSlots([])}
                className="flex-1 sm:flex-none px-3.5 py-2 rounded-xl bg-white border border-amber-200 text-xs font-bold text-amber-900 hover:bg-amber-50 cursor-pointer transition-colors"
              >
                Clear Selection
              </button>
              <button
                onClick={generateOfferText}
                className="flex-1 sm:flex-none px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> Generate Offer Text
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* COMPILATION OFFER MODAL DIALOG */}
      <AnimatePresence>
        {showOfferModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-natural-border rounded-[32px] p-6 max-w-md w-full shadow-2xl relative space-y-4"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-serif italic text-lg font-bold text-natural-text flex items-center gap-1.5">
                  <Sparkles className="w-5 h-5 text-amber-500" /> Compiled Availability Offer
                </h3>
                <button
                  onClick={() => setShowOfferModal(false)}
                  className="p-1 rounded-full text-natural-muted hover:text-natural-text hover:bg-natural-bg transition-colors cursor-pointer"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-natural-muted leading-relaxed">
                Here is a clean, empathetic availability template containing your selected dates across centers. You can copy this and send it directly to your client.
              </p>

              <textarea
                value={offerText}
                readOnly
                rows={10}
                className="w-full bg-natural-bg/40 border border-natural-border rounded-2xl p-4 text-xs font-sans text-natural-text focus:outline-none focus:border-natural-sage leading-relaxed resize-none shadow-inner"
              />

              <div className="flex gap-2">
                <button
                  onClick={() => setShowOfferModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-natural-border text-natural-text font-bold text-xs hover:bg-natural-bg transition-all cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={handleCopyOffer}
                  className="flex-1 py-2.5 rounded-xl bg-natural-sage hover:bg-natural-sage-light text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copy Offer to Clipboard
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
