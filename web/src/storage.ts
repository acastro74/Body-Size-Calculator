import type { Profile } from "@bsc/shared";

export interface Settings {
  lang: "es" | "en";
  units: "metric" | "imperial";
}
const KEY = "bsc:v1";

interface Stored {
  settings?: Settings;
  profile?: Profile;
}

export function load(): Stored {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Stored;
  } catch {
    return {};
  }
}

/** Only the profile and settings are stored — never the photo. */
export function save(data: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
}
