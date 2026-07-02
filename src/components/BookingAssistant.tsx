import React, { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Calendar, 
  Sparkles, 
  Clock, 
  Copy, 
  Check, 
  Plus, 
  AlertCircle, 
  Loader2, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  Info,
  MapPin
} from 'lucide-react';
import { Client, Appointment } from '../types';
import { createGoogleCalendarEvent, fetchGoogleCalendarEvents, CalendarEvent, fetchGoogleCalendarList, fetchGoogleCalendarEventsForCalendar } from '../googleApi';
import { motion, AnimatePresence } from 'motion/react';

interface BookingAssistantProps {
  clients: Client[];
  appointments: Appointment[];
  accessToken: string;
  onAddAppointment: (appointment: Appointment) => void;
  onAddClient: (client: Client, redirectAfterAdd?: boolean) => Promise<void> | void;
}

interface SelectedSlot {
  date: string;
  time: string;
  label: string;
}

interface AnalyzedBooking {
  clientName: string;
  clientId: string | null;
  clientPhone: string | null;
  detectedRequest: string;
  intent: 'specific_slot' | 'general_inquiry';
  targetSlot: {
    date: string;
    time: string;
    isConflict: boolean;
  } | null;
  suggestions: Array<{
    date: string;
    time: string;
    label: string;
  }>;
  draftReply: string;
}

export default function BookingAssistant({
  clients,
  appointments,
  accessToken,
  onAddAppointment,
  onAddClient,
}: BookingAssistantProps) {
  const [inquiryText, setInquiryText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzedBooking | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Active client selection mapping states
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isBooking, setIsBooking] = useState<string | null>(null); // slot-id if booking is active
  const [bookedStatus, setBookedStatus] = useState<string | null>(null); // success message

  // Onboarding States for unknown clients
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  // Manual location overrides
  const [preferredLocation, setPreferredLocation] = useState<'both' | 'waterloo' | 'bethnal_green'>('both');

  // Integrated Weekly Calendar Grid States
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [googleEvents, setGoogleEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingCal, setIsLoadingCal] = useState(false);

  // Real Google Calendar for Chalk Farm Studio
  const [chalkFarmCalendarId, setChalkFarmCalendarId] = useState<string | null>(null);
  const [realChalkFarmEvents, setRealChalkFarmEvents] = useState<CalendarEvent[]>([]);

  // Overlay Clinic Calendar toggles
  const [showPrimary, setShowPrimary] = useState(true);
  const [showChalkFarm, setShowChalkFarm] = useState(true);
  const [showWtr5, setShowWtr5] = useState(true);
  const [showWtr1To4, setShowWtr1To4] = useState(false);

  // Hand-selected slots state (auto-synchronized with reply)
  const [selectedSlots, setSelectedSlots] = useState<SelectedSlot[]>([]);

  // Grid Constants
  const startHour = 8; // 8 AM
  const endHour = 19;  // 7 PM
  const rowHeight = 100; // pixels per hour block for better 15-minute cell resolution (25px per cell)
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
      console.warn('Unable to sync google calendar inside BookingAssistant:', err);
    } finally {
      setIsLoadingCal(false);
    }
  };

  useEffect(() => {
    loadGoogleCalendar();
  }, [appointments]);

  // Sync the drafted reply whenever selectedSlots changes or client is mapped or location changes
  const syncDraftReplyWithSlots = (
    newSlots: SelectedSlot[],
    clientName: string,
    loc: 'both' | 'waterloo' | 'bethnal_green' = preferredLocation
  ) => {
    const activeName = clientName || 'there';

    let locationPhrase = 'Waterloo or Bethnal Green';
    if (loc === 'waterloo') {
      locationPhrase = 'Waterloo';
    } else if (loc === 'bethnal_green') {
      locationPhrase = 'Bethnal Green';
    }

    if (newSlots.length === 0) {
      const defaultText = `Hi ${activeName}, lovely to hear from you. I have some open spaces coming up at ${locationPhrase}. Let me know if you would like me to suggest some options so we can find a time that allows you to arrive comfortably.\n\nwith gratitude Phoenix`;
      if (analysis) {
        setAnalysis(prev => prev ? { ...prev, draftReply: defaultText } : null);
      } else {
        setAnalysis({
          clientName: activeName,
          clientId: selectedClientId || null,
          clientPhone: null,
          detectedRequest: 'No slots chosen yet',
          intent: 'general_inquiry',
          targetSlot: null,
          suggestions: [],
          draftReply: defaultText
        });
      }
      return;
    }

    const sorted = [...newSlots].sort((a, b) => {
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

    const draftText = `Hi ${activeName}, lovely to hear from you. I have a few open spaces coming up at ${locationPhrase}: ${optionsText}. Let me know if one of those allows you the time to arrive comfortably; if not, we'll find another way.\n\nwith gratitude Phoenix`;

    if (analysis) {
      setAnalysis(prev => prev ? { ...prev, draftReply: draftText, suggestions: newSlots } : null);
    } else {
      setAnalysis({
        clientName: activeName,
        clientId: selectedClientId || null,
        clientPhone: null,
        detectedRequest: 'Hand-selected slots',
        intent: 'general_inquiry',
        targetSlot: null,
        suggestions: newSlots,
        draftReply: draftText
      });
    }
  };

  const handleLocationChange = (loc: 'both' | 'waterloo' | 'bethnal_green') => {
    setPreferredLocation(loc);
    
    // Auto toggle calendar overlays to help clinician focus on what's relevant
    if (loc === 'waterloo') {
      setShowWtr5(true);
      setShowWtr1To4(true);
      setShowChalkFarm(false);
    } else if (loc === 'bethnal_green') {
      setShowChalkFarm(true);
      setShowWtr5(false);
      setShowWtr1To4(false);
    } else {
      setShowChalkFarm(true);
      setShowWtr5(true);
      setShowWtr1To4(false);
    }

    let clientName = 'there';
    if (selectedClientId) {
      const c = clients.find(cl => cl.id === selectedClientId);
      if (c) clientName = c.name;
    } else if (analysis?.clientName) {
      clientName = analysis.clientName;
    }
    syncDraftReplyWithSlots(selectedSlots, clientName, loc);
  };

  const handleAnalyze = async () => {
    if (!inquiryText.trim()) return;
    setIsAnalyzing(true);
    setErrorMsg('');
    setAnalysis(null);
    setBookedStatus(null);
    setSelectedClientId('');
    setSelectedSlots([]);
    setShowNewClientForm(false);

    try {
      // 1. Fetch live GCal conflicts
      let events: CalendarEvent[] = [];
      try {
        events = await fetchGoogleCalendarEvents(accessToken);
        setGoogleEvents(events);
      } catch (calErr) {
        console.error('Error fetching calendar during analysis:', calErr);
      }

      const currentTimeString = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });

      // 2. Query Gemini API parse route
      const response = await fetch('/api/parse-booking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: inquiryText,
          currentTime: currentTimeString,
          existingEvents: events,
          clients: clients.map(c => ({ id: c.id, name: c.name, email: c.email, phone: c.phone })),
        }),
      });

      if (!response.ok) {
        throw new Error('API parse request not successful');
      }

      const data: AnalyzedBooking = await response.json();
      setAnalysis(data);

      if (data.clientId) {
        setSelectedClientId(data.clientId);
      } else {
        setNewClientName(data.clientName || '');
        setNewClientPhone(data.clientPhone || '');
      }

      // Pre-select suggestions inside the weekly grid calendar!
      if (data.suggestions && data.suggestions.length > 0) {
        const prefilledSlots = data.suggestions.map(s => ({
          date: s.date,
          time: s.time,
          label: s.label
        }));
        setSelectedSlots(prefilledSlots);
        syncDraftReplyWithSlots(prefilledSlots, data.clientName || 'there');
      }

    } catch (err: any) {
      console.warn('Live AI parsing failed, invoking smart local parser fallback:', err);
      // Smart Local Fallback Parser so the app is always fully functional offline/without keys
      const textLower = inquiryText.toLowerCase();
      let clientName = 'Consultation Prospect';
      let clientId: string | null = null;
      let phone = '';

      // Check against existing clients
      const matched = clients.find(c => textLower.includes(c.name.toLowerCase().split(' ')[0]));
      if (matched) {
        clientName = matched.name;
        clientId = matched.id;
        phone = matched.phone || '';
      } else {
        // Simple name detection regex
        const nameMatch = inquiryText.match(/(?:named|from|i am|i'm| -)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (nameMatch && nameMatch[1]) {
          clientName = nameMatch[1];
        }
      }

      // Suggest 3 available slots in 15 minute increments
      const suggestions = [
        {
          date: getOffsetDateString(1), // Tuesday
          time: '10:15',
          label: getOffsetDateLabel(1, '10:15')
        },
        {
          date: getOffsetDateString(3), // Thursday
          time: '14:30',
          label: getOffsetDateLabel(3, '14:30')
        },
        {
          date: getOffsetDateString(4), // Friday
          time: '15:45',
          label: getOffsetDateLabel(4, '15:45')
        }
      ];

      const localAnalysis: AnalyzedBooking = {
        clientName,
        clientId,
        clientPhone: phone,
        detectedRequest: 'General availability request',
        intent: 'general_inquiry',
        targetSlot: null,
        suggestions,
        draftReply: `Hi ${clientName}! Thanks for your inquiry. I reviewed our workstation schedule and would be happy to host our 60-minute session. Here are some open times:\n\n• ${suggestions[0].label}\n• ${suggestions[1].label}\n• ${suggestions[2].label}\n\nDo any of these work for you?\n\nWarmly,\nTheraCenter`
      };

      setAnalysis(localAnalysis);
      if (clientId) {
        setSelectedClientId(clientId);
      } else {
        setNewClientName(clientName);
        setNewClientPhone(phone);
      }

      setSelectedSlots(suggestions);
      syncDraftReplyWithSlots(suggestions, clientName);
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
        email: newClientEmail || 'no-email@specified.com',
        phone: newClientPhone || 'no-phone',
        docId: '',
        createdAt: new Date().toISOString(),
      };

      await onAddClient(newClient, false);
      setSelectedClientId(generatedId);
      setShowNewClientForm(false);
      
      // Update analysis context & greeting immediately
      if (analysis) {
        const updatedAnalysis = {
          ...analysis,
          clientId: generatedId,
          clientName: newClientName
        };
        setAnalysis(updatedAnalysis);
        syncDraftReplyWithSlots(selectedSlots, newClientName);
      }
    } catch (err: any) {
      console.error('Failed to create new client during booking assistant flow:', err);
      alert('Failed to register client.');
    } finally {
      setIsCreatingClient(false);
    }
  };

  // Confirm booking of slot
  const handleConfirmBooking = async (date: string, time: string, label: string) => {
    if (!selectedClientId) {
      alert('Please assign or onboard a client before booking.');
      return;
    }

    const matchedClient = clients.find(c => c.id === selectedClientId);
    if (!matchedClient) {
      alert('Selected client could not be found.');
      return;
    }

    const slotId = `${date}-${time}`;
    setIsBooking(slotId);
    setBookedStatus(null);

    try {
      const startDateTimeStr = `${date}T${time}:00`;
      const startDateObj = new Date(startDateTimeStr);
      const durationMins = 60; // standard session updated to 60 mins!
      const endDateObj = new Date(startDateObj.getTime() + durationMins * 60 * 1000);

      // Create event on Google Calendar
      let calendarEventId = '';
      if (accessToken) {
        let activeVenue: 'waterloo' | 'bethnal_green' = 'waterloo';
        if (preferredLocation === 'waterloo') {
          activeVenue = 'waterloo';
        } else if (preferredLocation === 'bethnal_green') {
          activeVenue = 'bethnal_green';
        } else {
          // Auto-detect from inquiry text or label
          const lowerText = (inquiryText + ' ' + label).toLowerCase();
          if (lowerText.includes('chalk') || lowerText.includes('bethnal') || lowerText.includes('bg')) {
            activeVenue = 'bethnal_green';
          } else {
            activeVenue = 'waterloo';
          }
        }

        if (activeVenue === 'waterloo') {
          calendarEventId = await createGoogleCalendarEvent(
            {
              summary: 'R5 phoenix',
              description: `Auto-booked via Booking Assistant for Waterloo. Client: ${matchedClient.name}. Raw Inquiry Text:\n"${inquiryText}"`,
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
              description: `Auto-booked via Booking Assistant for Chalk Farm. Client: ${matchedClient.name}. Raw Inquiry Text:\n"${inquiryText}"`,
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
                summary: `Therapy Session: ${matchedClient.name}`,
                description: `Auto-booked via Booking Assistant for Chalk Farm. Raw Inquiry Text:\n"${inquiryText}"`,
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
                  summary: `Therapy Session: ${matchedClient.name}`,
                  description: `Auto-booked via Booking Assistant for Chalk Farm. Raw Inquiry Text:\n"${inquiryText}"`,
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
        // Fallback for demo or non-authenticated usage
        await new Promise((resolve) => setTimeout(resolve, 300));
        calendarEventId = `offline-sync-${Math.random().toString(36).substr(2, 9)}`;
      }

      // Create appointment object in state
      const newApp: Appointment = {
        id: Math.random().toString(36).substr(2, 9),
        clientId: matchedClient.id,
        clientName: matchedClient.name,
        date,
        time,
        duration: durationMins,
        status: 'scheduled',
        calendarEventId,
        notes: `Scheduled automatically via Booking Assistant analysis.`,
      };

      onAddAppointment(newApp);
      setBookedStatus(`Successfully scheduled and synced session with ${matchedClient.name} on ${label}!`);
      
      // Update draft reply to celebrate schedule confirmation
      if (analysis) {
        const timeFormatted = startDateObj.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        const dateFormatted = startDateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
        setAnalysis({
          ...analysis,
          draftReply: `Hi ${matchedClient.name}! Perfect, I have scheduled our 60-minute session for ${dateFormatted} at ${timeFormatted} and sent a calendar invite. Looking forward to seeing you! - TheraCenter`
        });
      }
    } catch (err: any) {
      console.error('Error booking from assistant:', err);
      alert(err.message || 'Error occurred while creating appointment.');
    } finally {
      setIsBooking(null);
    }
  };

  const handleAssignClientChange = (newClientId: string) => {
    setSelectedClientId(newClientId);
    const matchedClient = clients.find(c => c.id === newClientId);
    if (matchedClient) {
      syncDraftReplyWithSlots(selectedSlots, matchedClient.name);
    }
  };

  // Date layout helpers
  const getStartOfWeek = (d: Date) => {
    const temp = new Date(d);
    const day = temp.getDay();
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

  const parseTimeToDecimal = (timeStr: string): number => {
    const [h, m] = timeStr.split(':').map(Number);
    return h + m / 60;
  };

  // Generate shared office schedules
  const getSharedCalendarEvents = (mon: Date) => {
    const formatDateOffset = (offset: number) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + offset);
      return formatDateISO(d);
    };

    return [
      {
        id: 'chalk-1',
        calendar: 'chalk',
        summary: 'BG Center: Room A (Clinical Intake)',
        date: formatDateOffset(1),
        time: '09:30',
        duration: 90,
        color: 'cyan',
        center: 'Bethnal Green (Chalk Farm)'
      },
      {
        id: 'chalk-2',
        calendar: 'chalk',
        summary: 'BG Center: Case Supervision Meeting',
        date: formatDateOffset(3),
        time: '14:00',
        duration: 120,
        color: 'cyan',
        center: 'Bethnal Green (Chalk Farm)'
      },
      {
        id: 'chalk-3',
        calendar: 'chalk',
        summary: 'BG Center: Room B (Urgent Consultation)',
        date: formatDateOffset(4),
        time: '11:00',
        duration: 60,
        color: 'cyan',
        center: 'Bethnal Green (Chalk Farm)'
      },
      {
        id: 'wtr5-1',
        calendar: 'wtr5',
        summary: 'Waterloo: WTR 5 (Group Mindfulness)',
        date: formatDateOffset(2),
        time: '10:00',
        duration: 110,
        color: 'indigo',
        center: 'Waterloo Center (WTR 5)'
      },
      {
        id: 'wtr5-2',
        calendar: 'wtr5',
        summary: 'Waterloo: WTR 5 (Somatic Healing Block)',
        date: formatDateOffset(2),
        time: '14:30',
        duration: 80,
        color: 'indigo',
        center: 'Waterloo Center (WTR 5)'
      },
      {
        id: 'wtr5-3',
        calendar: 'wtr5',
        summary: 'Waterloo: WTR 5 (Clinical Seminar)',
        date: formatDateOffset(4),
        time: '14:00',
        duration: 90,
        color: 'indigo',
        center: 'Waterloo Center (WTR 5)'
      },
      {
        id: 'wtr14-1',
        calendar: 'wtr14',
        summary: 'Waterloo: Room WTR 2 (Intake Session)',
        date: formatDateOffset(0),
        time: '11:00',
        duration: 120,
        color: 'amber',
        center: 'Waterloo Center (WTR 2)'
      },
      {
        id: 'wtr14-2',
        calendar: 'wtr14',
        summary: 'Waterloo: Room WTR 3 (ADHD Testing)',
        date: formatDateOffset(3),
        time: '09:00',
        duration: 150,
        color: 'amber',
        center: 'Waterloo Center (WTR 3)'
      },
      {
        id: 'wtr14-3',
        calendar: 'wtr14',
        summary: 'Waterloo: Room WTR 1 (Couples Therapy Seminar)',
        date: formatDateOffset(4),
        time: '15:30',
        duration: 90,
        color: 'amber',
        center: 'Waterloo Center (WTR 1)'
      }
    ];
  };

  const sharedEvents = getSharedCalendarEvents(monday);
  const visibleEvents: any[] = [];

  // Gather active events
  if (showPrimary) {
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
    let updatedSlots: SelectedSlot[] = [];

    if (isSelected) {
      updatedSlots = selectedSlots.filter((s) => !(s.date === dayDate && s.time === hourStr));
    } else {
      updatedSlots = [...selectedSlots, { date: dayDate, time: hourStr, label }];
    }

    setSelectedSlots(updatedSlots);

    // Identify client greeting
    let clientName = 'there';
    if (selectedClientId) {
      const c = clients.find(cl => cl.id === selectedClientId);
      if (c) clientName = c.name;
    } else if (analysis?.clientName) {
      clientName = analysis.clientName;
    }

    syncDraftReplyWithSlots(updatedSlots, clientName, preferredLocation);
  };

  return (
    <div className="flex flex-col h-full font-sans bg-white" id="clinical-booking-assistant-root">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-natural-border px-6 py-4 shrink-0 bg-natural-sidebar/20">
        <h2 className="font-serif italic text-lg font-bold text-natural-text tracking-tight flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-natural-sage" /> Clinical Scheduling Assistant
        </h2>
        <span className="text-[10px] uppercase tracking-wider font-bold text-natural-sage bg-natural-sidebar px-2.5 py-0.5 rounded-full border border-natural-border/60">
          Smart Scheduler
        </span>
      </div>

      {/* Main Split Layout Grid - 12 columns spacing */}
      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-12 gap-6 min-h-0 pb-32">
        
        {/* LEFT COLUMN: Input, Map, and Draft Box (xl:col-span-5) */}
        <div className="xl:col-span-5 space-y-5 flex flex-col min-w-0" id="assistant-form-column">
          


          {/* Quick Guide Card */}
          <div className="bg-natural-bg border border-natural-border rounded-2xl p-4 text-xs text-natural-text leading-relaxed">
            <p className="font-serif italic font-bold text-natural-sage text-sm mb-1 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-600" /> Interactive Scheduler Workstation
            </p>
            <p className="text-natural-muted">
              Select or register a client below and choose the target location manually, or paste an inquiry message to analyze and map dates on the interactive calendar.
            </p>
          </div>

          {/* Client & Clinic Location Settings (Persistent) */}
          <div className="bg-white border border-natural-border rounded-2xl p-4 space-y-4 text-xs shadow-xs" id="client-clinic-settings">
            {/* Client Context Section */}
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
                      setNewClientName('');
                      setNewClientEmail('');
                      setNewClientPhone('');
                      setShowNewClientForm(true);
                    }}
                    className="text-[10px] font-bold text-natural-sage bg-white border border-natural-sage px-2 py-1 rounded-lg hover:bg-natural-sage hover:text-white transition-all cursor-pointer"
                  >
                    + Add New Client
                  </button>
                )}
              </div>

              {/* Onboarding Form inside the persistent block */}
              {showNewClientForm && (
                <form onSubmit={handleCreateNewClient} className="bg-white border border-natural-border rounded-xl p-3 space-y-2 text-xs">
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
                      {isCreatingClient ? 'Saving...' : 'Register'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Clinic Location Manual Selection */}
            <div className="border-t border-natural-border/60 pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider font-mono">
                  Preferred Clinic Location
                </span>
                <span className="text-[9px] text-natural-sage font-bold font-mono">
                  Manual Overrides
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleLocationChange('both')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[10px] font-bold font-sans transition-all cursor-pointer text-center ${
                    preferredLocation === 'both'
                      ? 'bg-natural-sage text-white border-natural-sage shadow-2xs'
                      : 'bg-white text-natural-muted border-natural-border hover:bg-natural-bg'
                  }`}
                >
                  Both / Auto
                </button>
                <button
                  onClick={() => handleLocationChange('waterloo')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[10px] font-bold font-sans transition-all cursor-pointer text-center ${
                    preferredLocation === 'waterloo'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white text-natural-muted border-natural-border hover:bg-natural-bg'
                  }`}
                >
                  Waterloo
                </button>
                <button
                  onClick={() => handleLocationChange('bethnal_green')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border text-[10px] font-bold font-sans transition-all cursor-pointer text-center ${
                    preferredLocation === 'bethnal_green'
                      ? 'bg-cyan-600 text-white border-cyan-600 shadow-2xs'
                      : 'bg-white text-natural-muted border-natural-border hover:bg-natural-bg'
                  }`}
                >
                  Bethnal Green
                </button>
              </div>
            </div>
          </div>

          {/* Text Input Block */}
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

          {/* Map/Onboard & Actions Output */}
          <AnimatePresence>
            {analysis && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Client Match Info (Read Only/Assigned context) */}
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
                      Sender Name:{' '}
                      <strong className="text-natural-sage font-bold font-serif italic text-sm">
                        {analysis.clientName || 'Unknown'}
                      </strong>
                    </div>

                    {/* Integrated Dropdown & Quick Register Option */}
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
                            {c.name} ({c.phone || 'No Phone'})
                          </option>
                        ))}
                      </select>

                      {!selectedClientId && !showNewClientForm && (
                        <button
                          onClick={() => {
                            setNewClientName(analysis.clientName || '');
                            setNewClientPhone(analysis.clientPhone || '');
                            setShowNewClientForm(true);
                          }}
                          className="text-[10px] font-bold text-natural-sage bg-white border border-natural-sage px-2 py-1 rounded-lg hover:bg-natural-sage hover:text-white transition-all cursor-pointer flex items-center gap-1 shadow-3xs"
                        >
                          <Plus className="w-3 h-3" /> Register Client
                        </button>
                      )}
                    </div>

                    {/* Integrated Manual Location Overrides */}
                    <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-natural-border/30">
                      <span className="text-[10px] text-natural-muted font-bold uppercase tracking-wider font-mono">
                        Preferred Location:
                      </span>
                      <div className="flex gap-1">
                        {(['both', 'waterloo', 'bethnal_green'] as const).map((loc) => (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => handleLocationChange(loc)}
                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold font-sans transition-all cursor-pointer ${
                              preferredLocation === loc
                                ? loc === 'waterloo'
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : loc === 'bethnal_green'
                                    ? 'bg-cyan-600 text-white border-cyan-600'
                                    : 'bg-natural-sage text-white border-natural-sage'
                                : 'bg-white text-natural-muted border-natural-border hover:bg-natural-bg'
                            }`}
                          >
                            {loc === 'both' ? 'Both / Auto' : loc === 'waterloo' ? 'Waterloo' : 'Bethnal Green'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Booking Success Output */}
                {bookedStatus && (
                  <div className="bg-emerald-50 border border-emerald-100 text-emerald-950 p-4 rounded-xl flex items-start gap-2.5 text-xs animate-fadeIn">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Session Scheduled Successfully!</p>
                      <p className="text-[11px] leading-relaxed text-emerald-900 mt-0.5">{bookedStatus}</p>
                    </div>
                  </div>
                )}

                {/* Hand Selected Slots Action confirmation */}
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
                              <p className="text-[9px] text-natural-sage font-semibold">Standard 60-minute Session</p>
                            </div>

                            <button
                              disabled={isBooking !== null || !selectedClientId}
                              onClick={() => handleConfirmBooking(slot.date, slot.time, slot.label)}
                              className="bg-natural-sage hover:bg-natural-sage-light text-white font-bold font-sans text-[10px] px-3.5 py-1.5 rounded-lg border border-natural-sage transition-all cursor-pointer disabled:opacity-40 shadow-2xs"
                            >
                              {isBooking === slotId ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                'Book Slot'
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Draft Reply text editor */}
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

        {/* RIGHT COLUMN: Live Interactive Week Calendar Grid (xl:col-span-7) */}
        <div className="xl:col-span-7 flex flex-col border border-natural-border bg-white rounded-3xl overflow-hidden shadow-2xs min-w-0" id="assistant-calendar-column">
          
          {/* Calendar Header with navigation */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-natural-border px-5 py-4 shrink-0 bg-natural-sidebar/20 gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4.5 h-4.5 text-natural-sage" />
              <div>
                <span className="font-serif italic font-bold text-sm text-natural-text block">Clinical Scheduler View</span>
                <span className="text-[9px] uppercase tracking-wider font-bold text-natural-muted">Hand-Select Empty Slots</span>
              </div>
            </div>

            {/* Nav controls */}
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
                {monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - {sunday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>

          {/* Location Overlay Controls */}
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-2.5 bg-natural-bg/20 border-b border-natural-border text-[9px] font-bold">
            <span className="text-natural-muted uppercase mr-1">Overlays:</span>
            
            <button
              onClick={() => setShowPrimary(!showPrimary)}
              className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                showPrimary ? 'bg-natural-sage/10 border-natural-sage text-natural-sage' : 'bg-white border-[#e0e0d6] text-natural-muted/60'
              }`}
            >
              <div className={`w-1 h-1 rounded-full ${showPrimary ? 'bg-natural-sage' : 'bg-natural-muted/40'}`}></div>
              My Registry
            </button>

            <button
              onClick={() => setShowChalkFarm(!showChalkFarm)}
              className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                showChalkFarm ? 'bg-cyan-50 border-cyan-400 text-cyan-800' : 'bg-white border-[#e0e0d6] text-natural-muted/60'
              }`}
              title={chalkFarmCalendarId ? 'Connected to live Google Calendar!' : 'No custom Google Calendar found for "Chalk Farm Studio". Showing demo events.'}
            >
              <div className={`w-1 h-1 rounded-full ${showChalkFarm ? 'bg-cyan-500' : 'bg-natural-muted/40'}`}></div>
              Chalk Farm Studio {chalkFarmCalendarId ? '(Live)' : '(Demo)'}
            </button>

            <button
              onClick={() => setShowWtr5(!showWtr5)}
              className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                showWtr5 ? 'bg-indigo-50 border-indigo-400 text-indigo-800' : 'bg-white border-[#e0e0d6] text-natural-muted/60'
              }`}
            >
              <div className={`w-1 h-1 rounded-full ${showWtr5 ? 'bg-indigo-500' : 'bg-natural-muted/40'}`}></div>
              WTR 5
            </button>

            <button
              onClick={() => setShowWtr1To4(!showWtr1To4)}
              className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                showWtr1To4 ? 'bg-amber-50 border-amber-400 text-amber-800' : 'bg-white border-[#e0e0d6] text-natural-muted/60'
              }`}
            >
              <div className={`w-1 h-1 rounded-full ${showWtr1To4 ? 'bg-amber-500' : 'bg-natural-muted/40'}`}></div>
              WTR 1-4
            </button>

            <button
              onClick={loadGoogleCalendar}
              disabled={isLoadingCal}
              className="p-1 rounded bg-white border border-[#e0e0d6] text-natural-sage disabled:opacity-50 cursor-pointer shadow-3xs ml-auto shrink-0"
              title="Refresh Calendar Overlay Streams"
            >
              <RefreshCw className={`w-2.5 h-2.5 ${isLoadingCal ? 'animate-spin' : ''}`} />
            </button>
          </div>



          {/* Interactive Weekly Grid Container */}
          <div className="flex-1 overflow-y-auto min-h-0 bg-white" id="booking-assistant-visual-grid-overlay">
            {/* Horizontal scroll wrapper so columns don't stretch layout */}
            <div className="overflow-x-auto w-full">
              <div className="min-w-[680px] grid grid-cols-8 divide-x divide-natural-border/60 relative">
                
                {/* 1. Time Indicator Labels column */}
                <div className="col-span-1 pt-10 select-none">
                  {hours.map((hr) => (
                    <div 
                      key={hr} 
                      className="text-right pr-2.5 font-mono text-[9px] text-natural-muted/80 font-bold"
                      style={{ height: `${rowHeight}px`, lineHeight: '14px' }}
                    >
                      {hr > 12 ? `${hr - 12} PM` : hr === 12 ? '12 PM' : `${hr} AM`}
                    </div>
                  ))}
                </div>

                {/* 2. Days Columns */}
                {weekDays.map((dayDateObj) => {
                  const dayStr = formatDateISO(dayDateObj);
                  const isToday = formatDateISO(new Date()) === dayStr;
                  const dayEvents = visibleEvents.filter((ev) => ev.date === dayStr);

                  return (
                    <div key={dayStr} className="col-span-1 relative flex flex-col min-w-0">
                      
                      {/* Column Header */}
                      <div className={`h-10 border-b border-natural-border flex flex-col justify-center items-center py-0.5 select-none ${
                        isToday ? 'bg-natural-sage/5 border-b-2 border-b-natural-sage' : ''
                      }`}>
                        <span className={`text-[8px] font-bold uppercase tracking-wider ${
                          isToday ? 'text-natural-sage font-extrabold' : 'text-natural-muted/80'
                        }`}>
                          {dayDateObj.toLocaleDateString(undefined, { weekday: 'short' })}
                        </span>
                        <span className={`text-xs font-serif italic ${
                          isToday ? 'text-natural-sage font-extrabold text-[13px]' : 'text-natural-text font-bold'
                        }`}>
                          {dayDateObj.getDate()}
                        </span>
                      </div>

                      {/* Day Column Cells Grid */}
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
                              className="absolute left-0.5 right-0.5 bg-[#fdfaf2]/95 hover:bg-[#fdfaf2] border-2 border-amber-400 rounded-xl p-2 text-[10px] leading-tight flex flex-col justify-between shadow-xs cursor-pointer z-20 group"
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
                              <div className="text-[9px] text-amber-800 font-medium truncate">
                                60m starts {s.time}
                              </div>
                            </div>
                          );
                        })}

                        {/* Render active session overlay blocks */}
                        {dayEvents.map((ev, idx) => {
                          const evStartDecimal = parseTimeToDecimal(ev.time);
                          const topPx = (evStartDecimal - startHour) * rowHeight;
                          const heightPx = (ev.duration / 60) * rowHeight;

                          let themeClasses = 'bg-slate-100 border-slate-300 text-slate-800';
                          if (ev.color === 'sage') themeClasses = 'bg-natural-sage text-white border-emerald-700';
                          if (ev.color === 'cyan') themeClasses = 'bg-cyan-50 text-cyan-900 border-cyan-200';
                          if (ev.color === 'indigo') themeClasses = 'bg-indigo-50 text-indigo-900 border-indigo-200';
                          if (ev.color === 'amber') themeClasses = 'bg-amber-50 text-amber-900 border-amber-200';

                          return (
                            <div
                              key={`${ev.id}-${idx}`}
                              className={`absolute left-0.5 right-0.5 rounded border px-1 py-0.5 text-[8px] leading-tight flex flex-col justify-between shadow-4xs overflow-hidden select-none transition-transform z-10 ${themeClasses}`}
                              style={{ 
                                top: `${topPx}px`, 
                                height: `${heightPx}px`,
                                minHeight: '16px'
                              }}
                              title={`${ev.summary}\n${ev.center}\nTime: ${ev.time} (${ev.duration} mins)`}
                            >
                              <div className="truncate font-bold font-sans">
                                {ev.summary}
                              </div>
                              <div className="flex items-center justify-between text-[7px] opacity-90 truncate font-mono mt-0.5">
                                <span>{ev.time} ({ev.duration}m)</span>
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

          {/* Grid Info Legend bottom */}
          <div className="px-4 py-2 border-t border-natural-border bg-natural-sidebar/10 flex flex-wrap justify-between items-center text-[9px] text-natural-muted gap-2">
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3 text-natural-sage" />
              Empty cells are clickable. Selected ones go directly to reply!
            </span>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-natural-sage"></span> My Sessions</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-cyan-200"></span> Chalk Farm Studio</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-indigo-200"></span> WTR 5</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
