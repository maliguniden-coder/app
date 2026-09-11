import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { CADENCE_OPTIONS, Cadence, loadCadence, saveCadence } from "@/src/prefs";

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
}));

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [cadence, setCadence] = useState<Cadence>("5s");

  useEffect(() => {
    loadCadence().then(setCadence);
  }, []);

  const pick = async (c: Cadence) => {
    Haptics.selectionAsync().catch(() => {});
    setCadence(c);
    await saveCadence(c);
  };

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

      <View style={styles.body}>
        <Text style={styles.sectionLabel}>CAPTURE CADENCE</Text>
        {CADENCE_OPTIONS.map((o) => {
          const selected = o.key === cadence;
          return (
            <Pressable
              key={o.key}
              testID={`cadence-option-${o.key}`}
              onPress={() => pick(o.key)}
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
        <Text style={styles.note}>
          Changes apply the next time you start screen translation.
        </Text>
      </View>
    </View>
  );
}
