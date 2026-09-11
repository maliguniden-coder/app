import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type OverlayLang = { code: string; name: string };

export type CaptureOptions = {
  targetLang: string;
  targetLangName: string;
  backendUrl: string;
  /** 0 = manual mode (refresh button on the floating panel). */
  intervalMs: number;
  /** Overlay text size in sp. */
  textSizeSp: number;
  /** Panel background opacity 0.4–1. */
  opacity: number;
  /** Favorite languages shown as quick-swap chips on the panel. */
  favorites: OverlayLang[];
  /** Stop the service automatically after this many ms; 0 = never. */
  autoStopMs: number;
};

type Native = {
  hasOverlayPermission: () => Promise<boolean>;
  requestOverlayPermission: () => Promise<boolean>;
  startCapture: (options: CaptureOptions) => Promise<boolean>;
  stopCapture: () => Promise<boolean>;
  getActiveTarget: () => Promise<OverlayLang | null>;
  getSessionStats: () => Promise<SessionStats>;
  resetOverlayPosition: () => Promise<boolean>;
};

export type SessionStats = {
  /** Screens (frames) that came back with at least one text block. */
  screens: number;
  /** Words in all translated blocks this session. */
  words: number;
  /** Epoch ms when the current/last session started; 0 if never. */
  startedAt: number;
  /** Epoch ms when the last session stopped; 0 while running. */
  stoppedAt: number;
  running: boolean;
};

const EMPTY_STATS: SessionStats = { screens: 0, words: 0, startedAt: 0, stoppedAt: 0, running: false };

const native = requireOptionalNativeModule<Native>("ScreenTranslator");

export const isScreenTranslatorAvailable = Platform.OS === "android" && !!native;

export async function hasOverlayPermission(): Promise<boolean> {
  if (!native) return false;
  return native.hasOverlayPermission();
}

export async function requestOverlayPermission(): Promise<boolean> {
  if (!native) return false;
  return native.requestOverlayPermission();
}

export async function startCapture(options: CaptureOptions): Promise<boolean> {
  if (!native) return false;
  return native.startCapture(options);
}

export async function stopCapture(): Promise<boolean> {
  if (!native) return false;
  return native.stopCapture();
}

/** Returns the language the running overlay is translating to, or null when idle. */
export async function getActiveTarget(): Promise<OverlayLang | null> {
  if (!native) return null;
  return native.getActiveTarget();
}

export async function getSessionStats(): Promise<SessionStats> {
  if (!native) return EMPTY_STATS;
  return native.getSessionStats();
}

/** Forgets the saved panel position; a visible panel snaps back to the default corner. */
export async function resetOverlayPosition(): Promise<boolean> {
  if (!native) return false;
  return native.resetOverlayPosition();
}
