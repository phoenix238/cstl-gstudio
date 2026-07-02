import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2, Sparkles, Check, RefreshCw, AlertTriangle, Play, Pause } from 'lucide-react';
import { appendTextToGoogleDoc } from '../googleApi';
import { motion, AnimatePresence } from 'motion/react';

interface AudioRecorderProps {
  clientId: string;
  clientName: string;
  docId: string;
  accessToken: string;
  onTranscriptionAppend: (newText: string) => void;
}

export default function AudioRecorder({
  clientId,
  clientName,
  docId,
  accessToken,
  onTranscriptionAppend,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Check microphone permissions on load
  useEffect(() => {
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'microphone' as PermissionName })
        .then((permissionStatus) => {
          setPermissionState(permissionStatus.state === 'granted' ? 'granted' : permissionStatus.state === 'denied' ? 'denied' : 'prompt');
          permissionStatus.onchange = () => {
            setPermissionState(permissionStatus.state === 'granted' ? 'granted' : permissionStatus.state === 'denied' ? 'denied' : 'prompt');
          };
        })
        .catch((err) => console.log('Permissions API check bypassed', err));
    }
  }, []);

  // Format recording timer: mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start Voice Recording
  const startRecording = async () => {
    audioChunksRef.current = [];
    setAudioUrl(null);
    setTranscription('');
    setSummary('');
    setErrorMsg('');
    setStatusMsg('');

    try {
      // Request microphone access (triggers iOS/macOS Safari system prompt)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      setPermissionState('granted');

      // Determine supported MIME type (critical for iOS Safari vs macOS Chrome)
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else {
          mimeType = ''; // Let browser choose default
        }
      }

      console.log(`Starting MediaRecorder with mimeType: ${mimeType || 'default'}`);
      
      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all tracks to release the hardware indicator (red bar)
        stream.getTracks().forEach((track) => track.stop());
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Auto-transcribe once recording is complete
        transcribeAudio(audioBlob, mimeType || 'audio/webm');
      };

      // Start recording & capture in 1s chunks
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error('Failed to access microphone:', err);
      setPermissionState('denied');
      setErrorMsg(
        'Microphone permission denied or unsupported. Please check your macOS/iOS settings ' +
        'under System Settings -> Privacy & Security -> Microphone, or Safari App Permissions.'
      );
    }
  };

  // Stop Recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    }
  };

  // Convert blob to Base64 and call server-side transcription
  const transcribeAudio = async (blob: Blob, mimeType: string) => {
    setIsTranscribing(true);
    setStatusMsg('Preparing voice dictation file...');

    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        // Strip the data:audio/...;base64, prefix
        const base64Audio = base64data.split(',')[1];

        setStatusMsg('AI Clinical Scribe is transcribing audio...');
        
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audio: base64Audio,
            mimeType: mimeType,
          }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to transcribe.');
        }

        const data = await response.json();
        setTranscription(data.text);
        
        // Auto-generate bulleted summary from transcription
        setStatusMsg('Generating clinical bullet-point summary...');
        try {
          const summaryResponse = await fetch('/api/summarize', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: data.text,
            }),
          });

          if (summaryResponse.ok) {
            const summaryData = await summaryResponse.json();
            setSummary(summaryData.summary);
            setStatusMsg('Transcription and summary complete.');
          } else {
            setStatusMsg('Transcription complete (could not generate summary).');
          }
        } catch (sumErr) {
          console.error('Error generating summary:', sumErr);
          setStatusMsg('Transcription complete (could not generate summary).');
        }
      };
    } catch (err: any) {
      console.error('Transcription error:', err);
      setErrorMsg(err.message || 'Speech-to-Text transcription failed. Please try dictating again.');
    } finally {
      setIsTranscribing(false);
    }
  };

  // Save the transcription to Google Docs
  const handleSaveToDoc = async () => {
    if (!transcription || !docId) return;

    setStatusMsg('Appending note to Google Doc...');
    setErrorMsg('');

    try {
      // Create local formatted block with ISO-formatted timestamp and visual spacer
      const localDate = new Date().toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const localTime = new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      });

      let appendBlock = 
        `\n\n=== DICTATED SESSION SUMMARY ===\n` +
        `Date: ${localDate} at ${localTime}\n` +
        `-----------------------------------------\n` +
        `RAW DICTATION TRANSCRIPT:\n` +
        `${transcription}\n\n`;

      if (summary) {
        appendBlock += 
          `AI CLINICAL BULLET POINTS:\n` +
          `${summary}\n`;
      }

      appendBlock += `=========================================\n`;

      await appendTextToGoogleDoc(docId, appendBlock, accessToken);
      setStatusMsg('Successfully appended and saved to client Google Doc notes!');
      onTranscriptionAppend(appendBlock);
    } catch (err: any) {
      console.error('Save to Google Doc error:', err);
      setErrorMsg('Failed to append notes to Google Doc. Please verify permissions or try again.');
    }
  };

  return (
    <div className="bg-natural-bg border border-natural-border rounded-[24px] p-5 mb-6" id="audio-recorder-module">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-1 h-3 bg-natural-sage rounded-full animate-pulse"></div>
            <div className="w-1 h-5 bg-natural-sage rounded-full"></div>
            <div className="w-1 h-4 bg-natural-sage rounded-full"></div>
          </div>
          <h3 className="font-serif italic font-bold text-natural-sage tracking-tight text-sm">
            Clinical AI Dictation Scribe
          </h3>
        </div>
        {isRecording && (
          <span className="font-mono text-xs bg-red-100 text-red-700 px-2.5 py-1 rounded-full font-medium">
            {formatTime(recordingTime)}
          </span>
        )}
      </div>

      {permissionState === 'denied' && (
        <div className="mb-4 bg-amber-50 border border-amber-100 text-amber-950 rounded-xl p-3 text-xs flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Microphone Access Blocked</p>
            <p className="text-amber-900 mt-1">
              To dictate, please allow microphone access in Safari settings or system Privacy & Security.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-4 bg-rose-50 border border-rose-100 text-rose-950 rounded-xl p-3 text-xs flex gap-2 items-start">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <p>{errorMsg}</p>
        </div>
      )}

      <div className="flex flex-col items-center justify-center py-4">
        <AnimatePresence mode="wait">
          {!isRecording && !isTranscribing && !transcription && (
            <motion.button
              key="record-btn"
              onClick={startRecording}
              whileTap={{ scale: 0.95 }}
              className="w-16 h-16 rounded-full bg-natural-sage hover:bg-natural-sage-light text-white flex items-center justify-center shadow-lg shadow-natural-sage/20 cursor-pointer focus:outline-none transition-all relative"
            >
              <Mic className="w-6 h-6" />
              <span className="absolute -bottom-6 text-[11px] font-sans font-semibold text-natural-muted tracking-wide">
                Tap to Dictate Notes
              </span>
            </motion.button>
          )}

          {isRecording && (
            <motion.button
              key="stop-btn"
              onClick={stopRecording}
              whileTap={{ scale: 0.95 }}
              className="w-16 h-16 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-200 cursor-pointer focus:outline-none relative"
            >
              {/* Dynamic waveform simulation */}
              <div className="absolute inset-0 rounded-full bg-red-500/20 animate-ping" />
              <div className="absolute -inset-2 rounded-full bg-red-500/10 animate-pulse" />
              <Square className="w-5 h-5 text-red-100 fill-red-100" />
              <span className="absolute -bottom-6 text-[11px] font-sans font-semibold text-red-600 tracking-wide animate-pulse">
                Recording (Tap to Stop)
              </span>
            </motion.button>
          )}

          {isTranscribing && (
            <motion.div
              key="loading-state"
              className="flex flex-col items-center gap-3 py-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Loader2 className="w-8 h-8 text-natural-sage animate-spin" />
              <p className="text-xs font-semibold text-natural-sage font-sans">
                {statusMsg}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {audioUrl && !isTranscribing && !isRecording && (
          <div className="w-full mt-4 flex justify-center">
            <audio src={audioUrl} controls className="w-full max-w-xs h-10 rounded-lg" />
          </div>
        )}
      </div>

      {transcription && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 border-t border-natural-border pt-4"
        >
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-natural-sage uppercase tracking-wider font-mono">
              AI Dictation Output
            </span>
            <button
              onClick={() => {
                setTranscription('');
                setSummary('');
                setAudioUrl(null);
                setStatusMsg('');
              }}
              className="text-[11px] text-natural-muted hover:text-natural-sage font-semibold flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Redo Dictation
            </button>
          </div>

          <div className="space-y-4 mb-4">
            <div>
              <span className="text-[10px] font-bold text-natural-muted uppercase tracking-wider font-mono block mb-1">
                Raw Transcript
              </span>
              <div className="bg-white border border-natural-border rounded-xl p-4 text-xs text-natural-text leading-relaxed max-h-36 overflow-y-auto font-sans whitespace-pre-wrap">
                {transcription}
              </div>
            </div>

            {summary && (
              <div>
                <span className="text-[10px] font-bold text-natural-sage uppercase tracking-wider font-mono block mb-1">
                  AI Clinical Bullet Points
                </span>
                <div className="bg-natural-bg border border-natural-border/80 rounded-xl p-4 text-xs text-natural-text leading-relaxed max-h-48 overflow-y-auto font-sans whitespace-pre-wrap">
                  {summary}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveToDoc}
              className="flex-1 bg-natural-sage hover:bg-natural-sage-light text-white font-sans text-xs font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              Append to Client Google Doc
            </button>
          </div>

          {statusMsg && (
            <p className="text-[11px] text-natural-sage font-semibold mt-3 text-center">
              {statusMsg}
            </p>
          )}
        </motion.div>
      )}
    </div>
  );
}
