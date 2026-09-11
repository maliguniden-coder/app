import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Icon from "@react-native-vector-icons/material-design-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { makeStyles, toggleColorScheme, useTheme } from "@/src/theme";
import { Cadence, cadenceLabel, cadenceMs, loadCadence } from "@/src/prefs";
import {
  hasOverlayPermission,
  isScreenTranslatorAvailable,
  requestOverlayPermission,
  startCapture,
  stopCapture,
} from "../modules/screen-translator";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL ?? "";

type Lang = { code: string; name: string };
const DEFAULT_TARGET: Lang = { code: "en", name: "English" };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  scroll: { paddingHorizontal: 20, gap: 20 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 12,
  },
  brandBlock: { flex: 1 },
  appName: { fontSize: 22, fontWeight: "800", color: c.onSurface, letterSpacing: -0.4 },
  tagline: { fontSize: 13, color: c.muted, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
    borderWidth: 1,
    borderColor: c.divider,
  },

  hero: {
    borderRadius: 24,
    overflow: "hidden",
    padding: 24,
    gap: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: c.onBrandPrimary,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: 14,
    color: c.onBrandPrimary,
    opacity: 0.9,
    lineHeight: 20,
  },

  ctaBtn: {
    marginTop: 4,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: c.surfaceSecondary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: { color: c.onSurfaceSecondary, fontWeight: "700", fontSize: 15 },
  ctaBusy: { opacity: 0.6 },

  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    borderWidth: 1,
    borderColor: c.divider,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface, flex: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: c.surfaceTertiary,
    borderRadius: 14,
  },
  rowLabel: { fontSize: 12, color: c.muted, fontWeight: "600", letterSpacing: 0.5 },
  rowValue: { fontSize: 16, fontWeight: "700", color: c.onSurface, marginTop: 2 },
  rowValueMuted: { fontSize: 14, color: c.muted, marginTop: 2 },

  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 8,
  },
  statusPillActive: { backgroundColor: c.brandSecondary },
  statusPillIdle: { backgroundColor: c.surfaceTertiary },
  statusText: { fontSize: 12, fontWeight: "700" },

  bullet: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  bulletDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: c.brandPrimary, marginTop: 8 },
  bulletText: { flex: 1, fontSize: 13, color: c.onSurfaceSecondary, lineHeight: 20 },

  warnCard: {
    backgroundColor: c.surfaceTertiary,
    borderRadius: 16,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: c.divider,
  },
  warnTitle: { fontSize: 13, fontWeight: "700", color: c.onSurface },
  warnBody: { fontSize: 12, color: c.muted, marginTop: 2, lineHeight: 18 },
}));

async function loadTarget(): Promise<Lang> {
  try {
    const raw = await AsyncStorage.getItem("target-lang");
    if (raw) return JSON.parse(raw) as Lang;
  } catch {}
  return DEFAULT_TARGET;
}

export default function Home() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  const [target, setTarget] = useState<Lang>(DEFAULT_TARGET);
  const [cadence, setCadence] = useState<Cadence>("5s");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overlayOK, setOverlayOK] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nativeReady = isScreenTranslatorAvailable;

  useFocusEffect(
    useCallback(() => {
      loadTarget().then(setTarget);
      loadCadence().then(setCadence);
      if (nativeReady) {
        hasOverlayPermission().then(setOverlayOK);
      }
    }, [nativeReady]),
  );

  useEffect(() => {
    if (nativeReady) hasOverlayPermission().then(setOverlayOK);
  }, [nativeReady]);

  const grantOverlay = async () => {
    Haptics.selectionAsync().catch(() => {});
    await requestOverlayPermission();
    // Re-check after user returns from settings.
    setTimeout(async () => setOverlayOK(await hasOverlayPermission()), 400);
  };

  const start = async () => {
    setError(null);
    if (!nativeReady) {
      setError(
        "Screen translation requires a custom Android build. Tap Publish (top-right) to build an APK, then reopen this app.",
      );
      return;
    }
    if (!overlayOK) {
      await grantOverlay();
      return;
    }
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    try {
      const ok = await startCapture(target.code, target.name, BACKEND, cadenceMs(cadence));
      setRunning(ok);
      if (!ok) setError("Screen capture was cancelled.");
    } catch (e: any) {
      setError(e?.message ?? "Could not start screen translation.");
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    Haptics.selectionAsync().catch(() => {});
    await stopCapture();
    setRunning(false);
  };

  const openLangs = () =>
    router.push({ pathname: "/languages", params: { current: target.code } });
  const openHistory = () => router.push("/history");
  const openSettings = () => router.push("/settings");
  const toggleTheme = () => {
    Haptics.selectionAsync().catch(() => {});
    toggleColorScheme();
  };

  const heroColors: [string, string] =
    scheme === "dark" ? ["#2D422D", "#456345"] : ["#628B62", "#7CA57C"];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <View style={styles.brandBlock}>
          <Text style={styles.appName}>LensTranslate</Text>
          <Text style={styles.tagline}>Live screen translation</Text>
        </View>
        <Pressable
          testID="history-button"
          onPress={openHistory}
          style={styles.iconBtn}
        >
          <Icon name="history" size={20} color={colors.onSurface} />
        </Pressable>
        <Pressable
          testID="settings-button"
          onPress={openSettings}
          style={styles.iconBtn}
        >
          <Icon name="cog-outline" size={20} color={colors.onSurface} />
        </Pressable>
        <Pressable
          testID="theme-toggle-button"
          onPress={toggleTheme}
          style={styles.iconBtn}
        >
          <Icon
            name={scheme === "dark" ? "weather-sunny" : "moon-waning-crescent"}
            size={20}
            color={colors.onSurface}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <LinearGradient colors={heroColors} style={styles.hero}>
          <View
            style={[
              styles.statusPill,
              running ? styles.statusPillActive : styles.statusPillIdle,
              { backgroundColor: running ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)" },
            ]}
            testID="capture-status-pill"
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                backgroundColor: running ? "#7CE082" : "rgba(255,255,255,0.8)",
              }}
            />
            <Text style={[styles.statusText, { color: "#fff" }]}>
              {running ? "Translating your screen" : "Ready to translate"}
            </Text>
          </View>
          <Text style={styles.heroTitle}>
            {running
              ? "Overlay is live.\nMove it anywhere you like."
              : "Translate any app or game\nrunning on your phone."}
          </Text>
          <Text style={styles.heroSub}>
            {running
              ? "Head back to the app you want to translate — the floating panel updates every few seconds."
              : "We capture your screen, detect the language, and float translations on top of everything else."}
          </Text>

          <Pressable
            testID={running ? "stop-capture-button" : "start-capture-button"}
            onPress={running ? stop : start}
            disabled={busy}
            style={[styles.ctaBtn, busy && styles.ctaBusy]}
          >
            {busy ? (
              <ActivityIndicator color={colors.onSurfaceSecondary} />
            ) : (
              <Icon
                name={running ? "stop-circle" : "play-circle"}
                size={22}
                color={colors.onSurfaceSecondary}
              />
            )}
            <Text style={styles.ctaText}>
              {busy
                ? "Starting…"
                : running
                  ? "Stop screen translation"
                  : "Start screen translation"}
            </Text>
          </Pressable>
        </LinearGradient>

        {/* Language card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="translate" size={20} color={colors.brandPrimary} />
            <Text style={styles.cardTitle}>Languages</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={[styles.row, { flex: 1 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>FROM</Text>
                <Text style={styles.rowValueMuted}>Auto detect</Text>
              </View>
              <Icon name="auto-fix" size={20} color={colors.muted} />
            </View>
            <Pressable
              testID="target-lang-button"
              onPress={openLangs}
              style={[styles.row, { flex: 1 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>TO</Text>
                <Text style={styles.rowValue}>{target.name}</Text>
              </View>
              <Icon name="chevron-right" size={20} color={colors.muted} />
            </Pressable>
          </View>
          <Pressable
            testID="cadence-row"
            onPress={openSettings}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>CAPTURE CADENCE</Text>
              <Text style={styles.rowValue}>{cadenceLabel(cadence)}</Text>
            </View>
            <Icon name="tune-variant" size={20} color={colors.muted} />
          </Pressable>
        </View>

        {/* Error / info banner */}
        {error && (
          <View style={styles.warnCard} testID="error-banner">
            <Icon name="alert-circle-outline" size={20} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>Heads up</Text>
              <Text style={styles.warnBody}>{error}</Text>
            </View>
          </View>
        )}

        {/* How it works */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Icon name="lightbulb-outline" size={20} color={colors.brandPrimary} />
            <Text style={styles.cardTitle}>How it works</Text>
          </View>
          <View style={styles.bullet}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              Tap <Text style={{ fontWeight: "700" }}>Start screen translation</Text>{" "}
              and grant screen recording + overlay permission.
            </Text>
          </View>
          <View style={styles.bullet}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              Switch to any app or game. LensTranslate reads what&apos;s on your screen every
              few seconds.
            </Text>
          </View>
          <View style={styles.bullet}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              A floating panel appears with the translated text. Drag it anywhere, or
              tap the lock icon to pin it in place while you play.
            </Text>
          </View>
          <View style={styles.bullet}>
            <View style={styles.bulletDot} />
            <Text style={styles.bulletText}>
              Tap <Text style={{ fontWeight: "700" }}>Stop</Text> to end the session —
              or use the ✕ on the floating panel itself.
            </Text>
          </View>
        </View>

        {/* Overlay permission status */}
        {nativeReady && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Icon
                name={overlayOK ? "shield-check-outline" : "shield-alert-outline"}
                size={20}
                color={overlayOK ? colors.success : colors.warning}
              />
              <Text style={styles.cardTitle}>Overlay permission</Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 19 }}>
              {overlayOK
                ? "Granted. LensTranslate can draw its floating panel on top of other apps."
                : "Required so the translation panel can float over other apps. We'll open Android settings for you."}
            </Text>
            {!overlayOK && (
              <Pressable
                testID="grant-overlay-button"
                onPress={grantOverlay}
                style={[styles.ctaBtn, { backgroundColor: colors.brandPrimary }]}
              >
                <Icon name="cog-outline" size={20} color={colors.onBrandPrimary} />
                <Text style={[styles.ctaText, { color: colors.onBrandPrimary }]}>
                  Grant overlay permission
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Build info if not native */}
        {!nativeReady && (
          <View style={styles.warnCard} testID="build-required-banner">
            <Icon name="android" size={20} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>
                Custom Android build required
              </Text>
              <Text style={styles.warnBody}>
                {Platform.OS === "ios"
                  ? "Live screen translation is Android-only. iOS does not allow reading other apps' screens."
                  : "This feature uses Android's screen capture + floating window APIs which aren't available in Expo Go. Tap Publish in Emergent, generate an APK, then install it on your phone."}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
