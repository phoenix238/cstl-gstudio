/**
 * Google Workspace REST API Helpers
 * Uses the OAuth access token retrieved from Firebase Auth.
 * Routed through a server-side proxy to guarantee 100% bypass of browser CORS and security restriction policies.
 */

// Helper to route all Google API requests through the local Express proxy
const fetchWithProxy = async (url: string, options: any = {}): Promise<Response> => {
  try {
    const response = await fetch('/api/google-proxy', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body || undefined
      })
    });
    return response;
  } catch (err) {
    console.error('Proxy request failed locally:', err);
    throw err;
  }
};

// Helper: Get or create "theracenter" folder in Google Drive
export const getOrCreateTheracenterFolder = async (token: string): Promise<string> => {
  try {
    // Search for a folder named "theracenter" that is not trashed
    const query = encodeURIComponent("name = 'theracenter' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const searchResponse = await fetchWithProxy(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!searchResponse.ok) {
      const err = await searchResponse.json();
      throw new Error(err.error?.message || 'Failed to search for folder');
    }

    const searchData = await searchResponse.json();
    if (searchData.files && searchData.files.length > 0) {
      return searchData.files[0].id;
    }

    // If it doesn't exist, create it
    const createResponse = await fetchWithProxy('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'theracenter',
        mimeType: 'application/vnd.google-apps.folder'
      })
    });

    if (!createResponse.ok) {
      const err = await createResponse.json();
      throw new Error(err.error?.message || 'Failed to create theracenter folder');
    }

    const createData = await createResponse.json();
    return createData.id;
  } catch (error) {
    console.error('Error getting or creating theracenter folder:', error);
    throw error;
  }
};

// 1. Google Drive Helper: Create a new Google Doc for a client inside "theracenter" folder
export const createClientGoogleDoc = async (clientName: string, token: string): Promise<string> => {
  try {
    const folderId = await getOrCreateTheracenterFolder(token);

    const response = await fetchWithProxy('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `Therapy Notes: ${clientName}`,
        mimeType: 'application/vnd.google-apps.document',
        description: `Secure session histories and notes for client ${clientName}.`,
        parents: [folderId]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to create Google Doc');
    }

    const data = await response.json();
    return data.id; // Returns the Google Doc file ID
  } catch (error) {
    console.error('Error creating Google Doc:', error);
    throw error;
  }
};

// 2. Google Docs Helper: Get Doc Content
export interface DocContent {
  title: string;
  bodyText: string;
  endIndex: number;
}

export const getGoogleDocContent = async (docId: string, token: string): Promise<DocContent> => {
  try {
    const response = await fetchWithProxy(`https://www.googleapis.com/docs/v1/documents/${docId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Document not found. It may have been deleted from Google Drive.');
      }
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to fetch Google Doc');
    }

    const doc = await response.json();
    const title = doc.title || '';

    // Extract text recursively from document body elements
    let bodyText = '';
    let maxEndIndex = 1;

    if (doc.body && doc.body.content) {
      for (const element of doc.body.content) {
        if (element.endIndex > maxEndIndex) {
          maxEndIndex = element.endIndex;
        }

        if (element.paragraph && element.paragraph.elements) {
          for (const part of element.paragraph.elements) {
            if (part.textRun && part.textRun.content) {
              bodyText += part.textRun.content;
            }
          }
        }
      }
    }

    return {
      title,
      bodyText,
      endIndex: maxEndIndex
    };
  } catch (error) {
    console.error('Error fetching Google Doc:', error);
    throw error;
  }
};

// 3. Google Docs Helper: Append Text to Doc
export const appendTextToGoogleDoc = async (
  docId: string,
  textToAppend: string,
  token: string
): Promise<void> => {
  try {
    // 1. Fetch current document to find the correct endIndex
    const { endIndex } = await getGoogleDocContent(docId, token);
    
    // We insert at (endIndex - 1) which is right before the terminating newline/EOF in Docs API
    const insertIndex = Math.max(1, endIndex - 1);

    const response = await fetchWithProxy(`https://www.googleapis.com/docs/v1/documents/${docId}:batchUpdate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: [
          {
            insertText: {
              text: textToAppend,
              location: {
                index: insertIndex
              }
            }
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to update Google Doc');
    }
  } catch (error) {
    console.error('Error appending text to Google Doc:', error);
    throw error;
  }
};

// 4. Google Calendar Helper: Sync & Fetch Events
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

export const fetchGoogleCalendarEvents = async (token: string): Promise<CalendarEvent[]> => {
  try {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 7); // Show past week to future

    const response = await fetchWithProxy(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin.toISOString()}&orderBy=startTime&singleEvents=true`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to fetch calendar events');
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.warn('Error fetching calendar events:', error);
    throw error;
  }
};

// 5. Google Calendar Helper: Create Event
export const createGoogleCalendarEvent = async (
  event: {
    summary: string;
    description: string;
    startTime: string; // ISO String
    endTime: string; // ISO String
    calendarId?: string;
  },
  token: string
): Promise<string> => {
  try {
    const targetCalendarId = event.calendarId || 'primary';
    const response = await fetchWithProxy(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(targetCalendarId)}/events`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: {
          dateTime: event.startTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        },
        end: {
          dateTime: event.endTime,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to create calendar event');
    }

    const data = await response.json();
    return data.id; // Return Google Event ID
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
};

// 6. Google Calendar Helper: Delete Event
export const deleteGoogleCalendarEvent = async (eventId: string, token: string): Promise<void> => {
  try {
    const response = await fetchWithProxy(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to delete calendar event');
    }
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    throw error;
  }
};

// 7. Google Calendar List Helper
export interface GoogleCalendar {
  id: string;
  summary: string;
  description?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
}

export const fetchGoogleCalendarList = async (token: string): Promise<GoogleCalendar[]> => {
  try {
    const response = await fetchWithProxy('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to fetch calendar list');
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.warn('Error fetching calendar list:', error);
    return [];
  }
};

// 8. Fetch specific Google Calendar Events
export const fetchGoogleCalendarEventsForCalendar = async (
  calendarId: string,
  token: string
): Promise<CalendarEvent[]> => {
  try {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 7); // past week to future

    const response = await fetchWithProxy(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${timeMin.toISOString()}&orderBy=startTime&singleEvents=true`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `Failed to fetch events for calendar ${calendarId}`);
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.warn(`Error fetching events for calendar ${calendarId}:`, error);
    return [];
  }
};
