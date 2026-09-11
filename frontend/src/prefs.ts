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

// ---- Auto-stop timer ----

export type AutoStop = 0 | 15 | 30 | 60;
export const AUTO_STOP_OPTIONS: { minutes: AutoStop; label: string }[] = [
  { minutes: 0, label: "Off" },
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "60 min" },
];
const AUTO_STOP_KEY = "auto-stop-min";

export async function loadAutoStop(): Promise<AutoStop> {
  try {
    const raw = await AsyncStorage.getItem(AUTO_STOP_KEY);
    const n = Number(raw);
    if (n === 15 || n === 30 || n === 60) return n;
  } catch {}
  return 0;
}

export async function saveAutoStop(m: AutoStop) {
  await AsyncStorage.setItem(AUTO_STOP_KEY, String(m));
}

export function autoStopLabel(m: AutoStop): string {
  return m === 0 ? "Off" : `After ${m} min`;
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

// ---- Overlay appearance ----

export type TextSize = "small" | "medium" | "large";

export const TEXT_SIZE_OPTIONS: { key: TextSize; label: string; sp: number }[] = [
  { key: "small", label: "Small", sp: 12 },
  { key: "medium", label: "Medium", sp: 14 },
  { key: "large", label: "Large", sp: 17 },
];

export type OverlayPrefs = { textSize: TextSize; opacity: number };

const OVERLAY_KEY = "overlay-prefs";
export const DEFAULT_OVERLAY: OverlayPrefs = { textSize: "medium", opacity: 0.92 };
export const MIN_OPACITY = 0.4;

export async function loadOverlayPrefs(): Promise<OverlayPrefs> {
  try {
    const raw = await AsyncStorage.getItem(OVERLAY_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<OverlayPrefs>;
      return {
        textSize: TEXT_SIZE_OPTIONS.some((o) => o.key === p.textSize)
          ? (p.textSize as TextSize)
          : DEFAULT_OVERLAY.textSize,
        opacity:
          typeof p.opacity === "number"
            ? Math.min(1, Math.max(MIN_OPACITY, p.opacity))
            : DEFAULT_OVERLAY.opacity,
      };
    }
  } catch {}
  return DEFAULT_OVERLAY;
}

export async function saveOverlayPrefs(p: OverlayPrefs) {
  await AsyncStorage.setItem(OVERLAY_KEY, JSON.stringify(p));
}

export function textSizeSp(t: TextSize): number {
  return TEXT_SIZE_OPTIONS.find((o) => o.key === t)?.sp ?? 14;
}
