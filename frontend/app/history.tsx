import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

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
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: c.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
  },
  searchInput: { flex: 1, fontSize: 16, color: c.onSurface, padding: 0 },
  searchClear: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
  },
  resultCount: {
    paddingHorizontal: 16,
    paddingTop: 12,
    fontSize: 12,
    fontWeight: "600",
    color: c.muted,
    letterSpacing: 0.4,
  },
  highlight: { backgroundColor: c.brandSecondary, color: c.onBrandSecondary, borderRadius: 3 },
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
  copyHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 10,
    alignSelf: "flex-end",
  },
  copyHintText: { fontSize: 12, color: c.muted, fontWeight: "600" },
  toast: {
    position: "absolute",
    left: 24,
    right: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: c.surfaceInverse,
  },
  toastText: { fontSize: 14, fontWeight: "600", color: c.onSurfaceInverse },
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

/** Splits `text` so the matching parts of `query` can be highlighted. */
function highlightParts(text: string, query: string): { str: string; hit: boolean }[] {
  if (!query) return [{ str: text, hit: false }];
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const out: { str: string; hit: boolean }[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(q, i);
    if (idx === -1) {
      out.push({ str: text.slice(i), hit: false });
      break;
    }
    if (idx > i) out.push({ str: text.slice(i, idx), hit: false });
    out.push({ str: text.slice(idx, idx + q.length), hit: true });
    i = idx + q.length;
  }
  return out;
}

function Highlighted({
  text,
  query,
  style,
  hitStyle,
  numberOfLines,
}: {
  text: string;
  query: string;
  style: any;
  hitStyle: any;
  numberOfLines?: number;
}) {
  const parts = useMemo(() => highlightParts(text, query), [text, query]);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((p, i) =>
        p.hit ? (
          <Text key={i} style={hitStyle}>
            {p.str}
          </Text>
        ) : (
          p.str
        ),
      )}
    </Text>
  );
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

  const [toast, setToast] = useState(false);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const copy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setToast(true);
    Animated.timing(toastAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        () => setToast(false),
      );
    }, 1500);
  };

  const empty = !isLoading && (!data || data.length === 0);

  const [query, setQuery] = useState("");
  const q = query.trim();
  const filtered = useMemo(() => {
    if (!data) return [];
    if (!q) return data;
    const needle = q.toLowerCase();
    return data.filter(
      (i) =>
        i.translated_text.toLowerCase().includes(needle) ||
        i.original_text.toLowerCase().includes(needle),
    );
  }, [data, q]);

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

      {!empty && (
        <View style={styles.searchWrap}>
          <Icon name="magnify" size={20} color={colors.muted} />
          <TextInput
            testID="history-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Search translations"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable
              testID="history-search-clear"
              onPress={() => setQuery("")}
              style={styles.searchClear}
              hitSlop={6}
            >
              <Icon name="close" size={16} color={colors.onSurface} />
            </Pressable>
          )}
        </View>
      )}

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
      ) : filtered.length === 0 ? (
        <View style={styles.emptyWrap} testID="history-no-results">
          <Icon name="text-search" size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No matches</Text>
          <Text style={styles.emptySub}>
            Nothing in your history contains “{q}”.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
          ListHeaderComponent={
            q ? (
              <Text style={styles.resultCount} testID="history-result-count">
                {filtered.length} {filtered.length === 1 ? "RESULT" : "RESULTS"}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              testID={`history-item-${item.id}`}
              onPress={() => copy(item.translated_text)}
            >
              <View style={styles.metaRow}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {item.detected_language} → {item.target_lang_name}
                  </Text>
                </View>
                <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
              </View>
              <Highlighted
                text={item.original_text}
                query={q}
                style={styles.original}
                hitStyle={styles.highlight}
                numberOfLines={4}
              />
              <View style={styles.divider} />
              <Highlighted
                text={item.translated_text}
                query={q}
                style={styles.translated}
                hitStyle={styles.highlight}
                numberOfLines={6}
              />
              <View style={styles.copyHint}>
                <Icon name="content-copy" size={13} color={colors.muted} />
                <Text style={styles.copyHintText}>Tap to copy</Text>
              </View>
            </Pressable>
          )}
        />
      )}

      {toast && (
        <Animated.View
          testID="copied-toast"
          pointerEvents="none"
          style={[
            styles.toast,
            {
              bottom: insets.bottom + 24,
              opacity: toastAnim,
              transform: [
                { translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
              ],
            },
          ]}
        >
          <Icon name="check-circle" size={18} color={colors.success} />
          <Text style={styles.toastText}>Copied to clipboard</Text>
        </Animated.View>
      )}
    </View>
  );
}
