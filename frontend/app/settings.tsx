import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";
import Slider from "@react-native-community/slider";

import { makeStyles, useTheme } from "@/src/theme";
import {
  AUTO_STOP_OPTIONS,
  AutoStop,
  CADENCE_OPTIONS,
  Cadence,
  DEFAULT_OVERLAY,
  MIN_OPACITY,
  OverlayPrefs,
  TEXT_SIZE_OPTIONS,
  TextSize,
  loadAutoStop,
  loadCadence,
  loadOverlayPrefs,
  saveAutoStop,
  saveCadence,
  saveOverlayPrefs,
  textSizeSp,
} from "@/src/prefs";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
    gap: 12,
  },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: c.onSurface },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
  },
  body: { padding: 20, gap: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: c.muted,
    letterSpacing: 0.6,
    marginBottom: 4,
    marginTop: 8,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.divider,
    minHeight: 64,
  },
  optionSelected: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
  },
  optionLabel: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  optionDesc: { fontSize: 13, color: c.muted, marginTop: 2 },
  note: { fontSize: 12, color: c.muted, lineHeight: 18, marginTop: 8 },

  card: {
    backgroundColor: c.surfaceSecondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.divider,
    padding: 16,
    gap: 14,
  },
  segment: {
    flexDirection: "row",
    backgroundColor: c.surfaceTertiary,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentItemActive: { backgroundColor: c.brandPrimary },
  segmentText: { fontSize: 14, fontWeight: "600", color: c.onSurface },
  segmentTextActive: { color: c.onBrandPrimary },

  sliderRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  sliderValue: {
    width: 48,
    textAlign: "right",
    fontSize: 15,
    fontWeight: "700",
    color: c.onSurface,
    fontVariant: ["tabular-nums"],
  },

  // Live preview of the floating panel.
  previewWrap: {
    borderRadius: 16,
    overflow: "hidden",
    padding: 14,
    backgroundColor: c.surfaceTertiary,
  },
  previewGrid: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    opacity: 0.35,
  },
  previewTile: { width: "25%", height: 24 },
  previewPanel: {
    borderRadius: 14,
    padding: 10,
    gap: 6,
    borderWidth: 1,
  },
  previewPanelTitle: { fontSize: 11, fontWeight: "600" },
  previewBlock: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
}));

// Mirrors the Kotlin overlay palette (must be identical in both themes).
const PANEL_RGB = "20,20,20";
const BLOCK_RGB = "40,66,40";
const PANEL_STROKE = "rgba(180,220,180,0.47)";
const PANEL_TEXT = "#FFFFFF";
const PANEL_MUTED = "rgba(200,200,200,0.8)";

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [cadence, setCadence] = useState<Cadence>("5s");
  const [autoStop, setAutoStop] = useState<AutoStop>(0);
  const [overlay, setOverlay] = useState<OverlayPrefs>(DEFAULT_OVERLAY);

  useEffect(() => {
    loadCadence().then(setCadence);
    loadAutoStop().then(setAutoStop);
    loadOverlayPrefs().then(setOverlay);
  }, []);

  const pickCadence = async (c: Cadence) => {
    Haptics.selectionAsync().catch(() => {});
    setCadence(c);
    await saveCadence(c);
  };

  const pickAutoStop = async (m: AutoStop) => {
    Haptics.selectionAsync().catch(() => {});
    setAutoStop(m);
    await saveAutoStop(m);
  };

  const pickTextSize = async (t: TextSize) => {
    Haptics.selectionAsync().catch(() => {});
    const next = { ...overlay, textSize: t };
    setOverlay(next);
    await saveOverlayPrefs(next);
  };

  const commitOpacity = async (v: number) => {
    Haptics.selectionAsync().catch(() => {});
    const next = { ...overlay, opacity: Math.round(v * 100) / 100 };
    setOverlay(next);
    await saveOverlayPrefs(next);
  };

  const pct = Math.round(overlay.opacity * 100);
  const fontSize = textSizeSp(overlay.textSize);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          testID="settings-close-button"
          onPress={() => router.back()}
          style={styles.closeBtn}
        >
          <Icon name="close" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Overlay appearance ---- */}
        <Text style={styles.sectionLabel}>FLOATING PANEL</Text>
        <View style={styles.card}>
          {/* Live preview */}
          <View style={styles.previewWrap} testID="overlay-preview">
            <View style={styles.previewGrid} pointerEvents="none">
              {Array.from({ length: 16 }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.previewTile,
                    { backgroundColor: i % 2 === 0 ? colors.brandSecondary : colors.surfaceSecondary },
                  ]}
                />
              ))}
            </View>
            <View
              style={[
                styles.previewPanel,
                {
                  backgroundColor: `rgba(${PANEL_RGB},${overlay.opacity})`,
                  borderColor: PANEL_STROKE,
                },
              ]}
            >
              <Text style={[styles.previewPanelTitle, { color: PANEL_MUTED }]}>
                LensTranslate • Japanese
              </Text>
              <View
                style={[
                  styles.previewBlock,
                  { backgroundColor: `rgba(${BLOCK_RGB},${Math.min(1, overlay.opacity * 0.94)})` },
                ]}
              >
                <Text style={{ color: PANEL_TEXT, fontSize, lineHeight: fontSize * 1.35 }}>
                  Press START to begin the quest
                </Text>
              </View>
            </View>
          </View>

          {/* Text size */}
          <View>
            <Text style={styles.optionDesc}>Text size</Text>
            <View style={[styles.segment, { marginTop: 8 }]} testID="text-size-segment">
              {TEXT_SIZE_OPTIONS.map((o) => {
                const active = o.key === overlay.textSize;
                return (
                  <Pressable
                    key={o.key}
                    testID={`text-size-${o.key}`}
                    onPress={() => pickTextSize(o.key)}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                      {o.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Opacity */}
          <View>
            <Text style={styles.optionDesc}>Panel opacity</Text>
            <View style={styles.sliderRow}>
              <Icon name="circle-outline" size={18} color={colors.muted} />
              <Slider
                testID="opacity-slider"
                style={{ flex: 1, height: 44 }}
                minimumValue={MIN_OPACITY}
                maximumValue={1}
                step={0.05}
                value={overlay.opacity}
                onValueChange={(v) => setOverlay((p) => ({ ...p, opacity: v }))}
                onSlidingComplete={commitOpacity}
                minimumTrackTintColor={colors.brandPrimary}
                maximumTrackTintColor={colors.borderStrong}
                thumbTintColor={colors.brandPrimary}
              />
              <Icon name="circle" size={18} color={colors.muted} />
              <Text style={styles.sliderValue} testID="opacity-value">
                {pct}%
              </Text>
            </View>
          </View>
        </View>

        {/* ---- Cadence ---- */}
        <Text style={styles.sectionLabel}>CAPTURE CADENCE</Text>
        {CADENCE_OPTIONS.map((o) => {
          const selected = o.key === cadence;
          return (
            <Pressable
              key={o.key}
              testID={`cadence-option-${o.key}`}
              onPress={() => pickCadence(o.key)}
              style={[styles.option, selected && styles.optionSelected]}
            >
              <View style={styles.optionIcon}>
                <Icon
                  name={o.icon as any}
                  size={22}
                  color={selected ? colors.brandPrimary : colors.muted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.optionLabel}>{o.label}</Text>
                <Text style={styles.optionDesc}>{o.desc}</Text>
              </View>
              <Icon
                name={selected ? "radiobox-marked" : "radiobox-blank"}
                size={22}
                color={selected ? colors.brandPrimary : colors.muted}
              />
            </Pressable>
          );
        })}

        {/* ---- Auto-stop ---- */}
        <Text style={styles.sectionLabel}>AUTO-STOP TIMER</Text>
        <View style={styles.card}>
          <View style={styles.segment} testID="auto-stop-segment">
            {AUTO_STOP_OPTIONS.map((o) => {
              const active = o.minutes === autoStop;
              return (
                <Pressable
                  key={o.minutes}
                  testID={`auto-stop-${o.minutes}`}
                  onPress={() => pickAutoStop(o.minutes)}
                  style={[styles.segmentItem, active && styles.segmentItemActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.optionDesc} testID="auto-stop-desc">
            {autoStop === 0
              ? "The overlay keeps running until you stop it."
              : `The overlay stops itself ${autoStop} minutes after you start it, saving battery if you forget.`}
          </Text>
        </View>

        <Text style={styles.note}>
          Changes apply the next time you start screen translation.
        </Text>
      </ScrollView>
    </View>
  );
}
