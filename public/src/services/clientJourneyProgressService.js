import { getSession } from "./supabaseAuthProvider.js";

const ENDPOINT = "/.netlify/functions/client-journey-progress";

export async function getClientJourneyProgress(options = {}) {
  const sessionProvider = options.getSession || getSession;
  const fetchImpl = options.fetchImpl || fetch;
  const sessionResult = await sessionProvider();
  const token = sessionResult?.session?.access_token || "";
  if (!token) return { state: "unauthenticated", disabled: false, progress: null };
  let response;
  try {
    response = await fetchImpl(options.endpoint || ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
      credentials: "same-origin",
    });
  } catch {
    return { state: "error", disabled: false, progress: null };
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return { state: response.status === 401 || response.status === 403 ? "unauthenticated" : "error", disabled: false, progress: null };
  if (payload.disabled) return { state: "disabled", disabled: true, progress: null, featureFlags: payload.featureFlags || null };
  if (!payload.progress || !["journey", "legacy_estimate", "unavailable"].includes(payload.progress.source)) return { state: "error", disabled: false, progress: null };
  return { state: payload.progress.available ? "ready" : "unavailable", disabled: false, progress: payload.progress, featureFlags: payload.featureFlags || null };
}

export { ENDPOINT as CLIENT_JOURNEY_PROGRESS_ENDPOINT };
