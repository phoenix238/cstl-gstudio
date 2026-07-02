export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  docId: string; // Google Doc ID for clinical notes
  createdAt: string;
  notesSummary?: string;
}

export interface Appointment {
  id: string;
  clientId: string;
  clientName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  duration: number; // minutes
  status: 'scheduled' | 'completed' | 'cancelled';
  calendarEventId?: string; // Sync'd Google Calendar Event ID
  notes?: string;
}
