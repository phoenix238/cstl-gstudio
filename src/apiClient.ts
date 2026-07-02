import { auth } from "./firebase";

export class ApiAuthError extends Error {
  constructor(message = "Authentication required.") {
    super(message);
    this.name = "ApiAuthError";
  }
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new ApiAuthError();
  }
  return user.getIdToken(forceRefresh);
}

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const idToken = await getFirebaseIdToken();
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${idToken}`);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });
  if (response.status === 401) {
    throw new ApiAuthError("Session expired. Please sign in again.");
  }
  return response;
}