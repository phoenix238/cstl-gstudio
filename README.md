# Therapy Control Center (cstl-gstudio)

Practice dashboard for therapists: client registry, appointment scheduling, AI booking replies, and session dictation synced to Google Workspace.

## Features

- **Clients** — Firestore-backed client registry linked to Google Docs in a `theracenter` Drive folder
- **Appointments** — Weekly calendar overlay with multi-location scheduling (Waterloo, Bethnal Green)
- **Booking Assistant** — Paste client inquiries; Gemini parses intent, checks conflicts, drafts replies
- **Session Notes** — Microphone dictation → Gemini transcription → bullet summary → Google Doc append

## Stack

React 19 · Vite 6 · TypeScript · Express · Firebase Auth/Firestore · Google Gemini · Tailwind CSS 4

## Prerequisites

- Node.js 20+
- Firebase project (config in `firebase-applet-config.json`)
- Gemini API key
- Google Cloud OAuth with Calendar, Docs, and Drive scopes enabled

## Setup

```bash
npm install
cp .env.example .env.local
# Add GEMINI_API_KEY to .env.local
npm run dev
```

Open http://localhost:3000 and sign in with Google Workspace.

### Optional: seed demo clients (dev only)

```bash
# In .env.local
VITE_SEED_SAMPLE_CLIENTS=true
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express + Vite dev server |
| `npm run build` | Production frontend + server bundle |
| `npm start` | Run production server |
| `npm run lint` | TypeScript check |
| `npm test` | Run unit tests |

## Deploy Firestore rules

```bash
firebase deploy --only firestore:rules
```

Rules restrict each user's data to `users/{uid}/**` — only accessible by that authenticated user.

## Data flow

| Data | Where it goes |
|------|---------------|
| Client metadata (name, email, phone) | Firestore `users/{uid}/clients` |
| Appointment records | Firestore `users/{uid}/appointments` |
| Clinical session notes | Google Docs (your Drive) |
| Calendar events | Google Calendar (your account) |
| Audio dictation | Sent to Gemini via authenticated `/api/transcribe` |
| Booking inquiry text | Sent to Gemini via authenticated `/api/parse-booking` |

API routes require a valid Firebase ID token. Google API calls are proxied server-side and require both Firebase auth and a Google OAuth access token.

## Security notes

- Google access tokens are stored in `sessionStorage` with a 55-minute expiry
- Reconnect via the sidebar banner when Workspace access expires
- This app does not provide HIPAA/GDPR compliance by itself — review your Firebase, Google, and Gemini agreements before handling real client data

## AI Studio

Originally scaffolded from [Google AI Studio](https://ai.studio/apps/2a5e4965-7100-45a3-b0e7-c9555f36336b).