import { auth } from "../firebase";

function quotaStorageKey(uid: string): string {
  return `lajumodal_qt_${uid}`;
}

export function clearStoredQuotaToken(uid?: string): void {
  try {
    if (uid) {
      sessionStorage.removeItem(quotaStorageKey(uid));
      return;
    }
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("lajumodal_qt_")) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    // Ignore storage unavailability
  }
}

export async function authorizedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Sesi login tidak ditemukan. Silakan masuk terlebih dahulu.");
  }
  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  try {
    const quotaToken = sessionStorage.getItem(quotaStorageKey(user.uid));
    if (quotaToken) {
      headers.set("X-Quota-Token", quotaToken);
    }
  } catch {
    // Ignore storage unavailability
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  try {
    const nextQuotaToken = res.headers.get("x-quota-token");
    if (nextQuotaToken) {
      sessionStorage.setItem(quotaStorageKey(user.uid), nextQuotaToken);
    }
  } catch {
    // Ignore storage unavailability
  }

  return res;
}
