import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  Text,
  TextInput,
  View,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { loadFavorites, toggleFavorite } from "@/src/prefs";

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
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: c.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionText: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 0.6 },
  row: {
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
    minHeight: 56,
  },
  rowText: { flex: 1, fontSize: 16, color: c.onSurface },
  rowCode: { fontSize: 13, color: c.muted, marginRight: 4 },
  selectedRow: { backgroundColor: c.brandTertiary },
  starBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
}));

export default function LanguagesScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ current?: string }>();
  const [query, setQuery] = useState("");
  const [favs, setFavs] = useState<string[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadFavorites().then(setFavs);
    }, []),
  );

  const { data, isLoading } = useQuery({
    queryKey: ["languages"],
    queryFn: fetchLanguages,
  });

  const sections = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const all = data.filter(
      (l) =>
        l.code !== "auto" &&
        (!q || l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)),
    );
    const favSet = new Set(favs);
    const favorites = all.filter((l) => favSet.has(l.code));
    const rest = all.filter((l) => !favSet.has(l.code));
    const out: { key: string; title: string; data: Lang[] }[] = [];
    if (favorites.length) out.push({ key: "fav", title: "FAVORITES", data: favorites });
    if (rest.length) out.push({ key: "all", title: favorites.length ? "ALL LANGUAGES" : "", data: rest });
    return out;
  }, [data, query, favs]);

  const pick = async (l: Lang) => {
    await AsyncStorage.setItem("target-lang", JSON.stringify(l));
    router.back();
  };

  const star = async (code: string) => {
    Haptics.selectionAsync().catch(() => {});
    setFavs(await toggleFavorite(code));
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
        <SectionList
          sections={sections}
          keyExtractor={(item, index) => `${item.code}-${index}`}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderSectionHeader={({ section }) =>
            section.title ? (
              <View style={styles.sectionHeader} testID={`section-${section.key}`}>
                {section.key === "fav" && (
                  <Icon name="star" size={14} color={colors.warning} />
                )}
                <Text style={styles.sectionText}>{section.title}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => {
            const selected = params.current === item.code;
            const fav = favs.includes(item.code);
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
                <Pressable
                  testID={`favorite-toggle-${item.code}`}
                  onPress={() => star(item.code)}
                  hitSlop={6}
                  style={styles.starBtn}
                >
                  <Icon
                    name={fav ? "star" : "star-outline"}
                    size={22}
                    color={fav ? colors.warning : colors.muted}
                  />
                </Pressable>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
