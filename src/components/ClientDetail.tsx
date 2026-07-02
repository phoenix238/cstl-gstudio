import React, { useState, useEffect } from 'react';
import { User, FileText, Phone, Mail, ExternalLink, Calendar, Loader2, RefreshCw, AlertCircle, Sparkles, Clock, Edit3, Mic } from 'lucide-react';
import { Client, Appointment } from '../types';
import { getGoogleDocContent, createClientGoogleDoc, appendTextToGoogleDoc } from '../googleApi';
import AudioRecorder from './AudioRecorder';

interface ClientDetailProps {
  client: Client;
  appointments: Appointment[];
  accessToken: string;
  onBack: () => void;
  onUpdateClientDoc: (clientId: string, docId: string) => void;
}

export default function ClientDetail({
  client,
  appointments,
  accessToken,
  onBack,
  onUpdateClientDoc,
}: ClientDetailProps) {
  const [docContent, setDocContent] = useState<string>('');
  const [docTitle, setDocTitle] = useState<string>('');
  const [isLoadingDoc, setIsLoadingDoc] = useState(false);
  const [docError, setDocError] = useState<string>('');
  const [isProvisioningNew, setIsProvisioningNew] = useState(false);

  // States for manual and AI notes
  const [noteMode, setNoteMode] = useState<'ai' | 'manual'>('ai');
  const [manualNote, setManualNote] = useState('');
  const [isSavingManualNote, setIsSavingManualNote] = useState(false);
  const [manualNoteStatus, setManualNoteStatus] = useState('');

  // Helper to parse the most recent session summary (both AI and manual notes)
  const getLastSessionNote = (content: string) => {
    if (!content) return null;
    
    const markers = [
      '=== DICTATED SESSION SUMMARY ===',
      '=== MANUAL CLINICAL NOTE ===',
      '=== MANUAL SESSION NOTE ==='
    ];
    
    let lastIndex = -1;
    let selectedMarker = '';
    
    for (const marker of markers) {
      const idx = content.lastIndexOf(marker);
      if (idx > lastIndex) {
        lastIndex = idx;
        selectedMarker = marker;
      }
    }
    
    if (lastIndex === -1) return null;
    
    const parts = content.split(selectedMarker);
    const lastPart = parts[parts.length - 1];
    
    // Split at the separator if multiple, and take the first block
    const cleanPart = lastPart.split('=========================================')[0].trim();
    return cleanPart;
  };

  const handleSaveManualNote = async () => {
    if (!manualNote.trim() || !client.docId) return;
    setIsSavingManualNote(true);
    setManualNoteStatus('Saving manual note to Google Docs...');
    try {
      const localDate = new Date().toLocaleDateString(undefined, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const localTime = new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });

      const appendBlock = 
        `\n\n=== MANUAL CLINICAL NOTE ===\n` +
        `Date: ${localDate} at ${localTime}\n` +
        `-----------------------------------------\n` +
        `${manualNote.trim()}\n` +
        `=========================================\n`;

      await appendTextToGoogleDoc(client.docId, appendBlock, accessToken);
      setManualNote('');
      setManualNoteStatus('Successfully saved manual note!');
      
      // Instantly append to local content view and trigger refresh
      handleTranscriptionAppend(appendBlock);
      
      // Auto-clear success message after 4s
      setTimeout(() => setManualNoteStatus(''), 4000);
    } catch (err: any) {
      console.error('Failed to save manual note:', err);
      setManualNoteStatus('Error saving note: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSavingManualNote(false);
    }
  };

  const handleProvisionDoc = async () => {
    setIsProvisioningNew(true);
    setDocError('');
    try {
      const newDocId = await createClientGoogleDoc(client.name, accessToken);
      onUpdateClientDoc(client.id, newDocId);
    } catch (err: any) {
      console.error('Failed to provision new doc:', err);
      setDocError('Failed to create new document in Google Drive. Ensure you have permissions.');
    } finally {
      setIsProvisioningNew(false);
    }
  };

  // Fetch google doc content
  const loadGoogleDocContent = async () => {
    if (!client.docId) {
      setDocContent('No Google Doc notes attached to this client yet.');
      return;
    }

    setIsLoadingDoc(true);
    setDocError('');
    try {
      const { title, bodyText } = await getGoogleDocContent(client.docId, accessToken);
      setDocTitle(title);
      setDocContent(bodyText || 'Empty Therapy notes folder. Tap Dictate below to append your first session notes summary!');
    } catch (err: any) {
      console.error('Error fetching Google Doc content:', err);
      setDocError(err.message || 'Could not fetch client clinical notes from Google Docs.');
    } finally {
      setIsLoadingDoc(false);
    }
  };

  useEffect(() => {
    loadGoogleDocContent();
  }, [client.docId]);

  // Filter appointments for this specific client
  const clientAppointments = appointments.filter((app) => app.clientId === client.id);

  // When audio recorder successfully appends a note
  const handleTranscriptionAppend = (appendedText: string) => {
    // Instantly append to local view to keep interface fast, then reload from Drive
    setDocContent((prev) => prev + appendedText);
    setTimeout(() => {
      loadGoogleDocContent();
    }, 2000);
  };

  return (
    <div className="flex flex-col h-full font-sans max-w-lg mx-auto bg-white" id="client-detail-pane">
      {/* Header section (styled for macOS & iOS top bars) */}
      <div className="flex items-center justify-between border-b border-natural-border px-4 py-4 shrink-0 bg-natural-sidebar/20">
        <button
          onClick={onBack}
          className="text-sm font-bold text-natural-sage hover:text-natural-sage-light flex items-center gap-1 cursor-pointer"
        >
          ← Clients
        </button>
        <span className="font-serif italic text-lg font-bold text-natural-text tracking-tight">Client Profile</span>
        <div className="w-14" /> {/* spacer to center title */}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 pb-24">
        {/* Profile Card Summary */}
        <div className="bg-gradient-to-tr from-natural-sage to-natural-sage-light text-white rounded-[32px] p-6 shadow-sm relative overflow-hidden">
          {/* Subtle design element */}
          <div className="absolute right-0 top-0 -mt-4 -mr-4 w-28 h-28 rounded-full bg-white/10" />
          
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center text-white text-lg font-bold">
              {client.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight font-serif italic">{client.name}</h2>
              <p className="text-xs text-white/80 mt-0.5 font-medium">Joined {new Date(client.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-white/20 text-xs text-white relative z-10">
            <div className="flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-white/80 shrink-0" />
              <span className="truncate">{client.email}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-white/80 shrink-0" />
              <span>{client.phone}</span>
            </div>
          </div>
        </div>

        {/* Latest Clinical Note Highlight (Requested feature: see what was last written about them) */}
        {(() => {
          const lastNote = getLastSessionNote(docContent);
          if (!lastNote) return null;
          return (
            <div className="bg-amber-50/50 border border-amber-100 rounded-3xl p-5 space-y-2.5 shadow-xs">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 font-mono flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-700" />
                  Latest Clinical Entry Details
                </h4>
                <span className="text-[9px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-mono font-bold">
                  Most Recent
                </span>
              </div>
              <p className="text-[11px] text-amber-950 font-sans leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto pr-1">
                {lastNote}
              </p>
            </div>
          );
        })()}

        {/* Google Doc Clinical File */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-natural-muted font-mono flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-natural-sage" />
              Official Therapy Notes
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={loadGoogleDocContent}
                disabled={isLoadingDoc}
                className="p-1.5 rounded-xl bg-natural-bg hover:bg-natural-sidebar text-natural-sage border border-natural-border disabled:opacity-50 cursor-pointer"
                title="Reload note"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDoc ? 'animate-spin' : ''}`} />
              </button>
              {client.docId && (
                <a
                  href={`https://docs.google.com/documents/d/${client.docId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-natural-sage hover:text-white hover:bg-natural-sage flex items-center gap-1 bg-natural-bg px-3 py-1.5 rounded-xl border border-natural-border transition-colors"
                >
                  Docs <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>

          <div className="border border-[#e0e0d6] rounded-[24px] bg-natural-bg/30 overflow-hidden shadow-xs flex flex-col h-64">
            {isLoadingDoc ? (
              <div className="flex-1 flex flex-col items-center justify-center text-xs text-natural-muted gap-2">
                <Loader2 className="w-5 h-5 text-natural-sage animate-spin" />
                <span>Syncing notes from Google Workspace...</span>
              </div>
            ) : docError ? (
              <div className="flex-1 p-5 flex flex-col items-center justify-center text-center text-xs text-red-700 gap-2">
                <AlertCircle className="w-6 h-6 text-red-600 animate-pulse" />
                <p className="font-bold font-serif italic text-sm">Workspace Fetch Failed</p>
                <p className="text-[11px] text-natural-muted">{docError}</p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={loadGoogleDocContent}
                    className="bg-natural-bg hover:bg-natural-sidebar text-natural-text border border-natural-border px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer"
                  >
                    Retry Connection
                  </button>
                  <button
                    disabled={isProvisioningNew}
                    onClick={handleProvisionDoc}
                    className="bg-natural-sage hover:bg-natural-sage-light text-white px-3.5 py-1.5 rounded-xl font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                  >
                    {isProvisioningNew ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Provisioning...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" /> Provision Real Doc
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 p-5 overflow-y-auto text-xs text-natural-text leading-relaxed font-sans whitespace-pre-wrap selection:bg-natural-sage/20 bg-white">
                {docContent}
              </div>
            )}
          </div>
        </div>

        {/* Clinical Session Note Input Panel (AI vs Manual) */}
        {client.docId ? (
          <div className="border border-[#e0e0d6] rounded-[24px] bg-white overflow-hidden shadow-xs flex flex-col">
            {/* Tab Header */}
            <div className="flex border-b border-natural-border bg-natural-sidebar/20 p-1 shrink-0 gap-1">
              <button
                type="button"
                onClick={() => setNoteMode('ai')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  noteMode === 'ai'
                    ? 'bg-white text-natural-sage shadow-xs border border-natural-border/30'
                    : 'text-natural-muted hover:text-natural-sage hover:bg-white/40'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                AI Voice Scribe
              </button>
              <button
                type="button"
                onClick={() => setNoteMode('manual')}
                className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  noteMode === 'manual'
                    ? 'bg-white text-natural-sage shadow-xs border border-natural-border/30'
                    : 'text-natural-muted hover:text-natural-sage hover:bg-white/40'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                Manual Note Entry
              </button>
            </div>

            {/* Panel Body */}
            <div className="p-4">
              {noteMode === 'ai' ? (
                <AudioRecorder
                  clientId={client.id}
                  clientName={client.name}
                  docId={client.docId}
                  accessToken={accessToken}
                  onTranscriptionAppend={handleTranscriptionAppend}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-natural-muted font-mono">
                      Write Note for {client.name}
                    </span>
                    <span className="text-[10px] uppercase font-bold text-natural-sage">
                      Google Doc Sync
                    </span>
                  </div>

                  <textarea
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    placeholder="Enter manual clinical notes or therapeutic highlights here... (e.g. Discussed coping strategies, noted positive progress in emotional regulation, set homework on mindfulness practice.)"
                    className="w-full bg-natural-bg/30 border border-natural-border rounded-xl p-3 text-xs font-sans text-natural-text min-h-[120px] focus:outline-none focus:border-natural-sage leading-relaxed resize-none shadow-inner"
                  />

                  {manualNoteStatus && (
                    <p className={`text-[11px] font-medium leading-relaxed font-sans ${
                      manualNoteStatus.startsWith('Error') ? 'text-red-600' : 'text-emerald-700'
                    }`}>
                      {manualNoteStatus}
                    </p>
                  )}

                  <button
                    onClick={handleSaveManualNote}
                    disabled={isSavingManualNote || !manualNote.trim()}
                    className="w-full bg-natural-sage hover:bg-natural-sage-light text-white font-bold py-2 rounded-xl flex items-center justify-center gap-2 text-xs transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  >
                    {isSavingManualNote ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving Clinical Entry...
                      </>
                    ) : (
                      <>
                        <Edit3 className="w-4 h-4 text-white" />
                        Save Clinical Entry to Doc
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-natural-bg border border-natural-border text-natural-text text-xs rounded-2xl p-4 text-center">
            No Google Document linked. Create or link a therapy folder to enable AI Clinical Scribe and Manual Notes.
          </div>
        )}

        {/* Client Appointments List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-natural-muted font-mono flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-natural-sage" />
            Client Schedule
          </h3>

          <div className="space-y-2.5">
            {clientAppointments.length === 0 ? (
              <p className="text-xs text-natural-muted italic text-center py-4 bg-natural-bg/30 rounded-xl border border-dashed border-natural-border">
                No past or upcoming appointments scheduled.
              </p>
            ) : (
              clientAppointments.map((app) => (
                <div
                  key={app.id}
                  className="bg-white border border-[#e0e0d6] rounded-xl p-3.5 flex justify-between items-center text-xs"
                >
                  <div>
                    <p className="font-bold text-natural-text">
                      {new Date(app.date).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      at {app.time}
                    </p>
                    <p className="text-[11px] text-natural-muted mt-0.5">
                      {app.duration} mins • Status:{' '}
                      <span
                        className={`font-semibold capitalize ${
                          app.status === 'scheduled'
                            ? 'text-natural-sage'
                            : app.status === 'completed'
                            ? 'text-emerald-700'
                            : 'text-rose-600'
                        }`}
                      >
                        {app.status}
                      </span>
                    </p>
                  </div>
                  {app.calendarEventId && (
                    <span className="text-[10px] bg-natural-sidebar text-natural-sage border border-natural-border/60 rounded-full px-2.5 py-0.5 font-medium flex items-center gap-0.5 font-mono">
                      Synced
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
