import AsyncStorage from "@react-native-async-storage/async-storage";

export type Cadence = "2s" | "5s" | "manual";

export const CADENCE_OPTIONS: {
  key: Cadence;
  label: string;
  ms: number;
  desc: string;
  icon: string;
}[] = [
  { key: "2s", label: "Every 2s", ms: 2000, desc: "Fastest updates, uses more battery", icon: "flash-outline" },
  { key: "5s", label: "Every 5s", ms: 5000, desc: "Balanced — recommended", icon: "timer-outline" },
  { key: "manual", label: "Manual", ms: 0, desc: "Tap ↻ on the floating panel to refresh", icon: "gesture-tap" },
];

const CADENCE_KEY = "capture-cadence";
const FAV_KEY = "fav-langs";

export async function loadCadence(): Promise<Cadence> {
  try {
    const raw = await AsyncStorage.getItem(CADENCE_KEY);
    if (raw === "2s" || raw === "5s" || raw === "manual") return raw;
  } catch {}
  return "5s";
}

export async function saveCadence(c: Cadence) {
  await AsyncStorage.setItem(CADENCE_KEY, c);
}

export function cadenceMs(c: Cadence): number {
  return CADENCE_OPTIONS.find((o) => o.key === c)?.ms ?? 5000;
}

export function cadenceLabel(c: Cadence): string {
  return CADENCE_OPTIONS.find((o) => o.key === c)?.label ?? "Every 5s";
}

export async function loadFavorites(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(FAV_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {}
  return [];
}

export async function toggleFavorite(code: string): Promise<string[]> {
  const favs = await loadFavorites();
  const next = favs.includes(code) ? favs.filter((c) => c !== code) : [...favs, code];
  await AsyncStorage.setItem(FAV_KEY, JSON.stringify(next));
  return next;
}
