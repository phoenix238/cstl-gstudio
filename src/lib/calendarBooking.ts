import { createGoogleCalendarEvent } from "../googleApi";

export type SessionVenue = "waterloo" | "bethnal_green";

const WATERLOO_CALENDAR_ID =
  "7cd19a8a0df5e5ff621f3400d0cc2ca78ee6b76b3d6f56740a4be51b03a3ec98@group.calendar.google.com";

export async function bookSessionToGoogleCalendar(options: {
  accessToken: string;
  venue: SessionVenue;
  clientName: string;
  startTime: string;
  endTime: string;
  description: string;
  personalSummary?: string;
}): Promise<string> {
  const {
    accessToken,
    venue,
    clientName,
    startTime,
    endTime,
    description,
    personalSummary,
  } = options;

  if (venue === "waterloo") {
    return createGoogleCalendarEvent(
      {
        summary: "R5 phoenix",
        description,
        startTime,
        endTime,
        calendarId: WATERLOO_CALENDAR_ID,
      },
      accessToken
    );
  }

  const calendarEventId = await createGoogleCalendarEvent(
    {
      summary: "chalk farm phoenix",
      description,
      startTime,
      endTime,
      calendarId: "chalkfarm215@gmail.com",
    },
    accessToken
  );

  const personalEventSummary = personalSummary || `Therapy Session: ${clientName}`;
  try {
    await createGoogleCalendarEvent(
      {
        summary: personalEventSummary,
        description,
        startTime,
        endTime,
        calendarId: "phoenix@tanner.me",
      },
      accessToken
    );
  } catch {
    await createGoogleCalendarEvent(
      {
        summary: personalEventSummary,
        description,
        startTime,
        endTime,
        calendarId: "primary",
      },
      accessToken
    );
  }

  return calendarEventId;
}