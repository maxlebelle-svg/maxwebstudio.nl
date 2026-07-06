const ENDPOINT = "/.netlify/functions/admin-microsoft-calendar";

function getAdminBearer() {
  if (typeof window !== "undefined" && typeof window.getAdminBearer === "function") {
    return window.getAdminBearer();
  }
  const candidates = [
    "mws_admin_supabase_session",
    "maxwebstudioCurrentSession",
  ];
  for (const key of candidates) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "null");
      const token = parsed?.accessToken || parsed?.access_token || "";
      if (token) return token;
    } catch (error) {
      // Ignore malformed browser session data.
    }
  }
  return sessionStorage.getItem("mws_admin_token") || sessionStorage.getItem("maxwebstudioAdminToken") || "";
}

async function calendarRequest(path = "", options = {}) {
  const token = getAdminBearer();
  if (!token) {
    const error = new Error("Log eerst in als admin om de Microsoft agenda te gebruiken.");
    error.status = 401;
    throw error;
  }
  const response = await fetch(`${ENDPOINT}${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    const error = new Error(data.error || "Microsoft agenda kon niet worden geladen.");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function getMicrosoftCalendarStatus() {
  return calendarRequest("?action=status");
}

export async function listMicrosoftCalendarEvents({ start, end, userEmail = "" } = {}) {
  const params = new URLSearchParams({ action: "events", start, end });
  if (userEmail) params.set("userEmail", userEmail);
  return calendarRequest(`?${params.toString()}`);
}

export async function createMicrosoftCalendarEvent(event = {}) {
  return calendarRequest("?action=createEvent", {
    method: "POST",
    body: {
      action: "createEvent",
      ...event,
    },
  });
}
