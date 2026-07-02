import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { verifyFirebaseAuth } from "./server/auth";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Set up Express to handle large base64 JSON requests
  app.use(express.json({ limit: "15mb" }));

  // Lazy-load Gemini SDK
  let aiClient: GoogleGenAI | null = null;
  function getAiClient() {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required.");
      }
      aiClient = new GoogleGenAI({ apiKey });
    }
    return aiClient;
  }

  const apiRouter = express.Router();
  apiRouter.use(verifyFirebaseAuth);

  // API endpoint to transcribe raw audio (base64) using Gemini 3.5 Flash
  apiRouter.post("/transcribe", async (req: any, res: any) => {
    try {
      const { audio, mimeType } = req.body;
      if (!audio) {
        return res.status(400).json({ error: "No audio data received" });
      }

      console.log(`Received dictation audio for transcription (${mimeType || "audio/webm"}). Calling Gemini...`);
      const ai = getAiClient();

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          {
            inlineData: {
              data: audio, // Base64 string
              mimeType: mimeType || "audio/webm"
            }
          },
          "You are an expert, secure clinical speech transcription assistant. " +
          "Please transcribe the following audio recording of a therapy session's notes/dictation. " +
          "Do not paraphrase too much, but make sure to correct any obvious slips-of-the-tongue or repetitions to output a polished, highly professional clinical note. " +
          "Return ONLY the clinical note, structured in clear, beautifully formatted Markdown. " +
          "Do not add any conversational introductions, conclusions, or meta-comments. Start directly with the note content."
        ]
      });

      const text = response.text || "";
      console.log("Transcription completed successfully!");
      return res.json({ text });
    } catch (error: any) {
      console.error("Gemini Transcription Error:", error);
      return res.status(500).json({ error: error.message || "Failed to transcribe audio." });
    }
  });

  // API endpoint to summarize transcription into clinical bullet points using Gemini 3.5 Flash
  apiRouter.post("/summarize", async (req: any, res: any) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "No text received to summarize" });
      }

      console.log("Generating bulleted summary with Gemini...");
      const ai = getAiClient();

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          `You are an expert, secure clinical scribe. Summarize the following therapy/session dictation into concise, structured, bullet points. Focus on clinical details, symptoms discussed, progress, client emotional/mental state, next steps, and specific observations. Do not add general pleasantries or meta comments. Start directly with the bullet points.\n\nDictation Text:\n${text}`
        ]
      });

      const summary = response.text || "";
      console.log("Summary generated successfully!");
      return res.json({ summary });
    } catch (error: any) {
      console.error("Gemini Summarization Error:", error);
      return res.status(500).json({ error: error.message || "Failed to generate summary." });
    }
  });

  // API endpoint to parse client inquiries and suggest booking times
  apiRouter.post("/parse-booking", async (req: any, res: any) => {
    try {
      const { text, currentTime, existingEvents, clients } = req.body;
      if (!text) {
        return res.status(400).json({ error: "No message received to parse." });
      }

      console.log("Analyzing booking inquiry with Gemini...");
      const ai = getAiClient();

      const clientsContext = clients && clients.length > 0
        ? `Here is the registry of active clients to match names against:\n${JSON.stringify(clients, null, 2)}`
        : `No clients registered in local database.`;

      const prompt = `You are an intelligent clinical scheduling coordinator for TheraCenter.
Analyze the following copy-pasted client inquiry message from a client/prospective client.

Context:
- Current Therapist local time: ${currentTime}
- List of existing booked events/slots on therapist's primary Google Calendar:
${JSON.stringify(existingEvents || [], null, 2)}

${clientsContext}

Analyze the message to identify:
1. Sender's Name: Detect the name. Map it to one of the active clients above if there's a strong match (e.g. first/last name). If no match or if new, state the name.
2. Request details: What is the date, day, or time they are requesting? E.g., "Tuesday morning", "July 10 at 2pm", etc.
3. Intent classification: Is it "specific_slot" (they want one specific slot like Friday at 2pm) or "general_inquiry" (they want to know when you are free or want you to suggest some times)?
4. Target Slot Evaluation: If they requested a specific slot (or if we can infer a specific date & time from their text based on current time), parse it to:
   - "date": "YYYY-MM-DD"
   - "time": "HH:MM"
   Check if this slot overlaps or conflicts with any of the booked events on the Google Calendar. Set "isConflict" to true or false.
5. Suggestions: Provide 3 intelligent, available slots (30-50 min duration) in the coming days that match their general preference (e.g., if they asked for morning, provide mornings; if they asked for next week, provide slots next week) and DO NOT conflict with any existing events. Each suggestion must have:
   - "date": "YYYY-MM-DD"
   - "time": "HH:MM"
   - "label": A beautifully formatted human-readable label, e.g. "Tuesday, July 7th at 10:00 AM"
6. Draft Reply: Write a brief, warm, deeply grounded, and reassuring draft response from Phoenix, a craniosacral therapist in London.

   You must enforce these strict tone and style rules:
   - Voice: Fluid, gentle, empathetic, and anchored in deep presence. Sound like an unhurried somatic practitioner, not a business assistant.
   - Language & Spelling: British English (e.g., normalise, prioritising). Use natural contractions (I've, that's, it's).
   - Style: Grounded and spacious. Never use salesy, clinical, clinical-corporate, or overly eager language.
   - Strict Bans: Absolutely NO corporate pleasantries ("I hope this finds you well", "reach out", "happy to help", "feel free to"). No exclamation marks unless completely necessary, no emojis, no clinical jargon, and no robotic sentences. Avoid conversational filler like "Sure" or "Of course."
   - Vocabulary to Use Naturally: Refer to bookings as "sessions" or "space." Refer to client state as "how you're arriving" or "letting your system settle." Use words like "stillness," "flow," "nourishing," "unwind," "presence," and "landing gently."
   - Sign-off: ALWAYS sign off exactly with: "with gratitude Phoenix" (no punctuation or variations).
   - Length: Keep the reply short (2 to 4 sentences max).

   Strict Location & Detail Naming Rules:
   - ALWAYS refer to the Chalk Farm Studio location as "Bethnal Green" in all drafts.
   - ALWAYS refer to the WTR / Waterloo Room locations simply as "Waterloo" in all drafts.
   - NEVER mention a specific room number (like Room 5 or R5). Keep it clean: just "Waterloo".

   Drafting Instructions:
   - If offering or suggesting times (e.g., intent is "general_inquiry" or suggesting slots):
     Frame it as finding a space that works nicely for them to drop into.
     Example style: "Hi [Name], lovely to hear from you. I have a few open spaces coming up at Bethnal Green: [Options]. Let me know if one of those allows you the time to arrive comfortably; if not, we'll find another way. with gratitude Phoenix"
   - If confirming a specific time (e.g., intent is "specific_slot"):
     Focus on the confirmation and transition. If they are a new client (not matched in the registry of active clients), mention the intake line gently as part of the preparation.
     Example style: "Hi [Name], that's beautifully locked in: [Date] at [Time] at Waterloo. I've pencilled you into the space. As it's your first session, I'll send over a short intake form before we meet just to get a sense of how you're arriving. Looking forward to holding this space for you. with gratitude Phoenix"

Ensure all dates are valid and start times match standard therapy session start points.
Client Inquiry message content:
"${text}"`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [prompt],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              clientName: {
                type: Type.STRING,
                description: "Sender name identified from the message or mapped name."
              },
              clientId: {
                type: Type.STRING,
                description: "The id of the matched client from the registry, or empty/null if not matched."
              },
              clientPhone: {
                type: Type.STRING,
                description: "The phone number of the matched client from the registry, or empty/null if not matched."
              },
              detectedRequest: {
                type: Type.STRING,
                description: "The parsed raw description of the date/time requested, e.g. 'Tuesday morning'."
              },
              intent: {
                type: Type.STRING,
                description: "Either 'specific_slot' or 'general_inquiry'."
              },
              targetSlot: {
                type: Type.OBJECT,
                description: "Evaluated target slot if they requested a specific slot. Otherwise null.",
                properties: {
                  date: { type: Type.STRING, description: "YYYY-MM-DD" },
                  time: { type: Type.STRING, description: "HH:MM" },
                  isConflict: { type: Type.BOOLEAN, description: "Whether it conflicts with existing events on Google Calendar." }
                }
              },
              suggestions: {
                type: Type.ARRAY,
                description: "3 suggested available slot options that have NO conflicts with Google Calendar events.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    date: { type: Type.STRING, description: "YYYY-MM-DD" },
                    time: { type: Type.STRING, description: "HH:MM" },
                    label: { type: Type.STRING, description: "Beautifully formatted human label, e.g., 'Tuesday, July 7th at 10:00 AM'." }
                  },
                  required: ["date", "time", "label"]
                }
              },
              draftReply: {
                type: Type.STRING,
                description: "Empathy-rich draft response from the therapist."
              }
            },
            required: ["clientName", "detectedRequest", "intent", "suggestions", "draftReply"]
          }
        }
      });

      const resText = response.text || "";
      const analysis = JSON.parse(resText.trim());
      console.log("Analysis parsed successfully:", analysis);
      return res.json(analysis);
    } catch (error: any) {
      console.error("Gemini Booking Parse Error:", error);
      return res.status(500).json({ error: error.message || "Failed to parse booking message." });
    }
  });

  // Generic Google API Proxy to bypass browser/CORS/iframe restrictions
  apiRouter.post("/google-proxy", async (req: any, res: any) => {
    try {
      const { url, method, headers, body } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Missing proxy URL" });
      }

      if (!url.startsWith("https://www.googleapis.com/") && !url.startsWith("https://googleapis.com/")) {
        return res.status(400).json({ error: "Forbidden proxy target. Only googleapis.com is supported." });
      }

      const authHeader = headers?.Authorization || headers?.authorization;
      if (!authHeader || !String(authHeader).startsWith("Bearer ")) {
        return res.status(400).json({ error: "Google access token required in proxy Authorization header." });
      }

      console.log(`[Google Proxy] ${req.firebaseUid} ${method || "GET"} to ${url}`);

      const response = await fetch(url, {
        method: method || "GET",
        headers: headers || {},
        body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      });

      const contentType = response.headers.get("content-type") || "";
      const status = response.status;

      if (contentType.includes("application/json")) {
        const data = await response.json();
        return res.status(status).json(data);
      } else {
        const data = await response.text();
        return res.status(status).send(data);
      }
    } catch (error: any) {
      console.error("[Google Proxy Error]:", error);
      return res.status(500).json({ error: error.message || "Failed to proxy request" });
    }
  });

  app.use("/api", apiRouter);

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start full-stack server:", err);
});
