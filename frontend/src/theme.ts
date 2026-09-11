import { useEffect, useMemo, useState } from "react";
import { Appearance, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F9F9F8",
  onSurface: "#1C1C1E",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1C1C1E",
  surfaceTertiary: "#F0F0EE",
  onSurfaceTertiary: "#3A3A3C",
  surfaceInverse: "#1C1C1E",
  onSurfaceInverse: "#FFFFFF",
  muted: "#8E8E93",

  brand: "#749B74",
  onBrand: "#FFFFFF",
  brandPrimary: "#628B62",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#E2EBE2",
  onBrandSecondary: "#2D422D",
  brandTertiary: "#F0F5F0",
  onBrandTertiary: "#456345",

  success: "#34C759",
  onSuccess: "#FFFFFF",
  warning: "#FF9F0A",
  onWarning: "#FFFFFF",
  error: "#FF453A",
  onError: "#FFFFFF",
  info: "#2D422D",
  onInfo: "#FFFFFF",

  border: "#E5E5EA",
  borderStrong: "#C7C7CC",
  divider: "#E5E5EA",
};

const dark: typeof light = {
  surface: "#121212",
  onSurface: "#F2F2F7",
  surfaceSecondary: "#1C1C1E",
  onSurfaceSecondary: "#E5E5EA",
  surfaceTertiary: "#2C2C2E",
  onSurfaceTertiary: "#D1D1D6",
  surfaceInverse: "#F9F9F8",
  onSurfaceInverse: "#1C1C1E",
  muted: "#8E8E93",

  brand: "#749B74",
  onBrand: "#000000",
  brandPrimary: "#7CA57C",
  onBrandPrimary: "#000000",
  brandSecondary: "#2D422D",
  onBrandSecondary: "#E2EBE2",
  brandTertiary: "#1F2E1F",
  onBrandTertiary: "#C3D9C3",

  success: "#30D158",
  onSuccess: "#FFFFFF",
  warning: "#FF9F0A",
  onWarning: "#FFFFFF",
  error: "#FF453A",
  onError: "#FFFFFF",
  info: "#E2EBE2",
  onInfo: "#121212",

  border: "#38383A",
  borderStrong: "#48484A",
  divider: "#38383A",
};

export type ThemeColors = typeof light;
export const defaultScheme: ColorScheme = "dark";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

const STORAGE_KEY = "lens-translate-scheme";

// Simple pub/sub so all components re-render when the user toggles the theme.
type Listener = () => void;
const listeners = new Set<Listener>();
let currentScheme: ColorScheme = defaultScheme;

function emit() {
  listeners.forEach((l) => l());
}

export async function hydrateColorScheme() {
  try {
    const stored = (await AsyncStorage.getItem(STORAGE_KEY)) as ColorScheme | null;
    if (stored === "light" || stored === "dark") {
      currentScheme = stored;
    } else {
      const sys = Appearance.getColorScheme();
      currentScheme = sys === "light" ? "light" : "dark";
    }
  } catch {
    // ignore
  }
  Appearance.setColorScheme?.(currentScheme);
  emit();
}

export function setColorScheme(scheme: ColorScheme) {
  currentScheme = scheme;
  Appearance.setColorScheme?.(scheme);
  AsyncStorage.setItem(STORAGE_KEY, scheme).catch(() => {});
  emit();
}

export function toggleColorScheme() {
  setColorScheme(currentScheme === "dark" ? "light" : "dark");
}

export function getColorScheme(): ColorScheme {
  return currentScheme;
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const [scheme, setScheme] = useState<ColorScheme>(currentScheme);
  useEffect(() => {
    const l = () => setScheme(currentScheme);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { scheme, colors: themes[scheme] };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
