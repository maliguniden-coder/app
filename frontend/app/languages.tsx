import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { makeStyles, useTheme } from "@/src/theme";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

type Lang = { code: string; name: string };

async function fetchLanguages(): Promise<Lang[]> {
  const r = await fetch(`${BACKEND}/api/languages`);
  if (!r.ok) throw new Error("Failed to load languages");
  return r.json();
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
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.surfaceTertiary,
  },
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
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: c.onSurface,
    padding: 0,
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
    minHeight: 56,
  },
  rowText: { flex: 1, fontSize: 16, color: c.onSurface },
  rowCode: { fontSize: 13, color: c.muted, marginRight: 12 },
  selectedRow: { backgroundColor: c.brandTertiary },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
}));

export default function LanguagesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ current?: string }>();
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["languages"],
    queryFn: fetchLanguages,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    if (!q) return data.filter((l) => l.code !== "auto");
    return data.filter(
      (l) =>
        l.code !== "auto" &&
        (l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)),
    );
  }, [data, query]);

  const pick = async (l: Lang) => {
    await AsyncStorage.setItem("target-lang", JSON.stringify(l));
    router.back();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable
          testID="languages-close-button"
          onPress={() => router.back()}
          style={styles.closeBtn}
        >
          <Icon name="close" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Translate to</Text>
      </View>
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={20} color={colors.muted} />
        <TextInput
          testID="languages-search-input"
          value={query}
          onChangeText={setQuery}
          placeholder="Search languages"
          placeholderTextColor={colors.muted}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => {
            const selected = params.current === item.code;
            return (
              <Pressable
                testID={`language-row-${item.code}`}
                onPress={() => pick(item)}
                style={[styles.row, selected && styles.selectedRow]}
              >
                <Text style={styles.rowText}>{item.name}</Text>
                <Text style={styles.rowCode}>{item.code.toUpperCase()}</Text>
                {selected && (
                  <Icon name="check" size={20} color={colors.brandPrimary} />
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
