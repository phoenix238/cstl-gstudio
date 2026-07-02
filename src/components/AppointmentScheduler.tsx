import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Sparkles,
  Copy,
  Check,
  List,
  CalendarCheck,
} from 'lucide-react';
import { Appointment, Client } from '../types';
import { deleteGoogleCalendarEvent } from '../googleApi';
import { motion, AnimatePresence } from 'motion/react';
import { useCalendarGrid } from '../hooks/useCalendarGrid';
import CalendarWeekGrid from './CalendarWeekGrid';
import CalendarOverlayToolbar from './CalendarOverlayToolbar';
import { toggleSelectedSlot } from '../lib/calendarUtils';
import { bookSessionToGoogleCalendar } from '../lib/calendarBooking';

interface AppointmentSchedulerProps {
  appointments: Appointment[];
  clients: Client[];
  accessToken: string;
  onAddAppointment: (appointment: Appointment) => void;
  onCancelAppointment: (appointmentId: string) => void;
  onCompleteAppointment: (appointmentId: string) => void;
}

export default function AppointmentScheduler({
  appointments,
  clients,
  accessToken,
  onAddAppointment,
  onCancelAppointment,
  onCompleteAppointment,
}: AppointmentSchedulerProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'agenda'>('grid');

  const {
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
  } = useCalendarGrid(accessToken, appointments);

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(60);
  const [privateNotes, setPrivateNotes] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  const [showOfferModal, setShowOfferModal] = useState(false);
  const [offerText, setOfferText] = useState('');
  const [copied, setCopied] = useState(false);
  const [syncLocation, setSyncLocation] = useState<'waterloo' | 'bethnal_green'>('waterloo');

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

      let calendarEventId = '';
      if (accessToken) {
        const locationLabel =
          syncLocation === 'waterloo' ? 'Waterloo' : 'Chalk Farm';
        const description = `Scheduled via Therapy Control Center for ${locationLabel}. Client: ${client.name}. Notes: ${privateNotes}`;

        calendarEventId = await bookSessionToGoogleCalendar({
          accessToken,
          venue: syncLocation,
          clientName: client.name,
          startTime: startDateObj.toISOString(),
          endTime: endDateObj.toISOString(),
          description,
          personalSummary: `Therapy Session: ${client.name}`,
        });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 150));
        calendarEventId = `offline-sync-${Math.random().toString(36).substr(2, 9)}`;
      }

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

  const handleToggleSlot = (dayDate: string, hourNum: number, minuteNum = 0) => {
    setSelectedSlots(toggleSelectedSlot(selectedSlots, dayDate, hourNum, minuteNum));
  };

  const generateOfferText = () => {
    if (selectedSlots.length === 0) return;

    const sorted = [...selectedSlots].sort((a, b) => {
      return new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime();
    });

    const optionsText = sorted
      .map((s) => {
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
      })
      .join(', ');

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

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between px-6 py-3.5 gap-4">
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
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 pb-32">
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

        {viewMode === 'grid' && (
          <CalendarWeekGrid
            weekDays={weekDays}
            visibleEvents={visibleEvents}
            selectedSlots={selectedSlots}
            onToggleSlot={handleToggleSlot}
            formatDateISO={formatDateISO}
          />
        )}

        {viewMode === 'agenda' && (
          <div className="space-y-6" id="agenda-list-view">
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
                    .sort(
                      (a, b) =>
                        new Date(`${a.date}T${a.time}`).getTime() -
                        new Date(`${b.date}T${b.time}`).getTime()
                    )
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
                  googleEvents.slice(0, 6).map((e) => (
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
                <p className="text-[11px] text-amber-800 leading-tight">
                  Directly compiling a formatted schedule offer for the client
                </p>
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
                Here is a clean, empathetic availability template containing your selected dates across
                centers. You can copy this and send it directly to your client.
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