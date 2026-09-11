import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Image } from "expo-image";

import { makeStyles, useTheme } from "@/src/theme";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

type HistoryItem = {
  id: string;
  detected_language: string;
  target_lang_name: string;
  original_text: string;
  translated_text: string;
  created_at: string;
};

async function fetchHistory(): Promise<HistoryItem[]> {
  const r = await fetch(`${BACKEND}/api/history`);
  if (!r.ok) throw new Error("Failed to load history");
  return r.json();
}

async function clearAll() {
  await fetch(`${BACKEND}/api/history`, { method: "DELETE" });
}

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
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
  },
  clearBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
  },
  clearText: { fontSize: 14, fontWeight: "600", color: c.error },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: c.surfaceSecondary,
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: c.divider,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: c.brandTertiary,
  },
  pillText: { fontSize: 12, fontWeight: "600", color: c.onBrandTertiary },
  dateText: { fontSize: 12, color: c.muted, marginLeft: "auto" },
  original: { fontSize: 14, color: c.muted, marginBottom: 8 },
  translated: { fontSize: 16, color: c.onSurface, fontWeight: "500" },
  divider: {
    height: 1,
    backgroundColor: c.divider,
    marginVertical: 10,
  },
  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  emptyImage: {
    width: 160,
    height: 160,
    borderRadius: 20,
    opacity: 0.6,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  emptySub: { fontSize: 14, color: c.muted, textAlign: "center" },
}));

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function HistoryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["history"],
    queryFn: fetchHistory,
  });

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const doClear = async () => {
    await clearAll();
    qc.setQueryData(["history"], []);
  };

  const empty = !isLoading && (!data || data.length === 0);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          testID="history-close-button"
          onPress={() => router.back()}
          style={styles.iconBtn}
        >
          <Icon name="close" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>History</Text>
        {!empty && (
          <Pressable
            testID="history-clear-button"
            onPress={doClear}
            style={styles.clearBtn}
          >
            <Text style={styles.clearText}>Clear</Text>
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : empty ? (
        <View style={styles.emptyWrap} testID="history-empty">
          <Image
            source="https://images.unsplash.com/photo-1531346878377-a5be20888e57?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzV8MHwxfHNlYXJjaHwxfHxvcGVuJTIwbm90ZWJvb2slMjBtaW5pbWFsfGVufDB8fHx8MTc4MjE2NDQxMXww&ixlib=rb-4.1.0&q=85"
            style={styles.emptyImage}
            contentFit="cover"
          />
          <Text style={styles.emptyTitle}>No translations yet</Text>
          <Text style={styles.emptySub}>
            Start screen translation to see your recent translations here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
          renderItem={({ item }) => (
            <View style={styles.card} testID={`history-item-${item.id}`}>
              <View style={styles.metaRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {item.detected_language} → {item.target_lang_name}
                  </Text>
                </View>
                <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
              </View>
              <Text style={styles.original} numberOfLines={4}>
                {item.original_text}
              </Text>
              <View style={styles.divider} />
              <Text style={styles.translated} numberOfLines={6}>
                {item.translated_text}
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
