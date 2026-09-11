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
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Icon from "@react-native-vector-icons/material-design-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { makeStyles, toggleColorScheme, useTheme } from "@/src/theme";
import {
  AutoStop,
  Cadence,
  autoStopLabel,
  cadenceLabel,
  cadenceMs,
  loadAutoStop,
  loadCadence,
  loadFavorites,
  loadOverlayPrefs,
  textSizeSp,
} from "@/src/prefs";
import { queryClient } from "@/src/query-client";
import { fetchGlossary } from "@/src/glossary";
import {
  SessionStats,
  getActiveTarget,
  getSessionStats,
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

  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCell: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  statLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.4, marginTop: 2 },
}));

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function loadTarget(): Promise<Lang> {
  try {
    const raw = await AsyncStorage.getItem("target-lang");
    if (raw) return JSON.parse(raw) as Lang;
  } catch {}
  return DEFAULT_TARGET;
}

/** Favorite languages resolved to {code,name} for the overlay's quick-swap chips. */
async function loadFavoriteLangs(): Promise<Lang[]> {
  const codes = await loadFavorites();
  if (codes.length === 0) return [];
  try {
    const all = await queryClient.fetchQuery<Lang[]>({
      queryKey: ["languages"],
      queryFn: async () => {
        const r = await fetch(`${BACKEND}/api/languages`);
        if (!r.ok) throw new Error("Failed to load languages");
        return r.json();
      },
      staleTime: 60 * 60 * 1000,
    });
    const byCode = new Map(all.map((l) => [l.code, l]));
    return codes.map((c) => byCode.get(c)).filter((l): l is Lang => !!l);
  } catch {
    return [];
  }
}

export default function Home() {
  const styles = useStyles();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  const [target, setTarget] = useState<Lang>(DEFAULT_TARGET);
  const [cadence, setCadence] = useState<Cadence>("5s");
  const [autoStop, setAutoStop] = useState<AutoStop>(0);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [overlayOK, setOverlayOK] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [now, setNow] = useState(Date.now());

  const nativeReady = isScreenTranslatorAvailable;

  const { data: glossary } = useQuery({ queryKey: ["glossary"], queryFn: fetchGlossary });

  // Poll session stats while the overlay runs so the hero card stays live.
  useEffect(() => {
    if (!nativeReady) return;
    let cancelled = false;
    const tick = async () => {
      const s = await getSessionStats().catch(() => null);
      if (!cancelled && s) {
        setStats(s);
        setNow(Date.now());
        if (!s.running && running) setRunning(false);
      }
    };
    tick();
    const id = running ? setInterval(tick, 2000) : null;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [nativeReady, running]);

  useFocusEffect(
    useCallback(() => {
      loadTarget().then(setTarget);
      loadCadence().then(setCadence);
      loadAutoStop().then(setAutoStop);
      if (nativeReady) {
        hasOverlayPermission().then(setOverlayOK);
        // Mirror the service state: it may have auto-stopped, or the user may have
        // swapped language from the floating panel chips.
        getActiveTarget().then((active) => {
          if (!active) {
            setRunning(false);
            return;
          }
          setRunning(true);
          setTarget(active);
          AsyncStorage.setItem("target-lang", JSON.stringify(active)).catch(() => {});
        });
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
      const [overlay, favorites] = await Promise.all([loadOverlayPrefs(), loadFavoriteLangs()]);
      const ok = await startCapture({
        targetLang: target.code,
        targetLangName: target.name,
        backendUrl: BACKEND,
        intervalMs: cadenceMs(cadence),
        textSizeSp: textSizeSp(overlay.textSize),
        opacity: overlay.opacity,
        favorites,
        autoStopMs: autoStop * 60 * 1000,
      });
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

          {/* Session stats */}
          {stats && (running || stats.screens > 0) && (
            <View style={styles.statsRow} testID="session-stats">
              <View style={[styles.statCell, { backgroundColor: "rgba(0,0,0,0.22)" }]}>
                <Text style={[styles.statValue, { color: "#fff" }]} testID="stat-screens">
                  {stats.screens}
                </Text>
                <Text style={[styles.statLabel, { color: "rgba(255,255,255,0.8)" }]}>
                  SCREENS
                </Text>
              </View>
              <View style={[styles.statCell, { backgroundColor: "rgba(0,0,0,0.22)" }]}>
                <Text style={[styles.statValue, { color: "#fff" }]} testID="stat-words">
                  {stats.words.toLocaleString()}
                </Text>
                <Text style={[styles.statLabel, { color: "rgba(255,255,255,0.8)" }]}>
                  WORDS
                </Text>
              </View>
              <View style={[styles.statCell, { backgroundColor: "rgba(0,0,0,0.22)" }]}>
                <Text style={[styles.statValue, { color: "#fff" }]} testID="stat-duration">
                  {formatDuration((running ? now : stats.stoppedAt) - stats.startedAt)}
                </Text>
                <Text style={[styles.statLabel, { color: "rgba(255,255,255,0.8)" }]}>
                  {running ? "ELAPSED" : "LAST SESSION"}
                </Text>
              </View>
            </View>
          )}

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
            testID="glossary-row"
            onPress={() => router.push("/glossary")}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>GLOSSARY</Text>
              <Text style={glossary?.length ? styles.rowValue : styles.rowValueMuted}>
                {glossary === undefined
                  ? "…"
                  : glossary.length === 0
                    ? "Pin names to translate consistently"
                    : `${glossary.length} pinned ${glossary.length === 1 ? "term" : "terms"}`}
              </Text>
            </View>
            <Icon name="book-open-page-variant-outline" size={20} color={colors.muted} />
          </Pressable>
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
          <Pressable
            testID="auto-stop-row"
            onPress={openSettings}
            style={styles.row}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>AUTO-STOP</Text>
              <Text style={autoStop === 0 ? styles.rowValueMuted : styles.rowValue}>
                {autoStopLabel(autoStop)}
              </Text>
            </View>
            <Icon name="timer-sand" size={20} color={colors.muted} />
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
              A floating panel appears with the translated text. Drag it anywhere, pin it
              with the lock icon, or tap a favorite-language chip to swap targets instantly.
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
