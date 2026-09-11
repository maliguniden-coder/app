import { useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Icon from "@react-native-vector-icons/material-design-icons";
import * as Haptics from "expo-haptics";

import { makeStyles, useTheme } from "@/src/theme";
import { GlossaryTerm, fetchGlossary } from "@/src/glossary";

const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

async function addTerm(body: { term: string; translation: string }): Promise<GlossaryTerm> {
  const r = await fetch(`${BACKEND}/api/glossary`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j?.detail ?? "Could not save term");
  }
  return r.json();
}

async function deleteTerm(id: string) {
  await fetch(`${BACKEND}/api/glossary/${id}`, { method: "DELETE" });
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
  intro: { paddingHorizontal: 20, paddingTop: 16, fontSize: 13, color: c.muted, lineHeight: 19 },

  form: {
    margin: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.divider,
    gap: 10,
  },
  inputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  inputWrap: {
    flex: 1,
    backgroundColor: c.surfaceTertiary,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    justifyContent: "center",
  },
  inputLabel: { fontSize: 10, fontWeight: "700", color: c.muted, letterSpacing: 0.6, marginTop: 6 },
  input: { fontSize: 15, color: c.onSurface, paddingVertical: 6, padding: 0 },
  addBtn: {
    marginTop: 4,
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: c.brandPrimary,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  addBtnDisabled: { opacity: 0.5 },
  addText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  errorText: { fontSize: 12, color: c.error },

  row: {
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 16,
    backgroundColor: c.surfaceSecondary,
    borderWidth: 1,
    borderColor: c.divider,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  term: { fontSize: 15, fontWeight: "700", color: c.onSurface },
  translation: { fontSize: 14, color: c.onBrandTertiary, marginTop: 2 },
  deleteBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  sectionLabel: {
    paddingHorizontal: 20,
    paddingTop: 8,
    fontSize: 12,
    fontWeight: "700",
    color: c.muted,
    letterSpacing: 0.6,
  },
  emptyWrap: { alignItems: "center", paddingVertical: 40, paddingHorizontal: 32, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  emptySub: { fontSize: 13, color: c.muted, textAlign: "center", lineHeight: 19 },
}));

export default function GlossaryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [term, setTerm] = useState("");
  const [translation, setTranslation] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const translationRef = useRef<TextInput>(null);

  const { data, isLoading } = useQuery({ queryKey: ["glossary"], queryFn: fetchGlossary });

  const add = useMutation({
    mutationFn: addTerm,
    onSuccess: (saved) => {
      qc.setQueryData<GlossaryTerm[]>(["glossary"], (prev = []) => [
        saved,
        ...prev.filter((t) => t.id !== saved.id),
      ]);
      setTerm("");
      setTranslation("");
      setFormError(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteTerm,
    onMutate: (id) => {
      Haptics.selectionAsync().catch(() => {});
      qc.setQueryData<GlossaryTerm[]>(["glossary"], (prev = []) => prev.filter((t) => t.id !== id));
    },
  });

  const canAdd = term.trim().length > 0 && translation.trim().length > 0 && !add.isPending;

  const submit = () => {
    if (!canAdd) return;
    add.mutate({ term: term.trim(), translation: translation.trim() });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <Pressable
          testID="glossary-close-button"
          onPress={() => router.back()}
          style={styles.closeBtn}
        >
          <Icon name="close" size={20} color={colors.onSurface} />
        </Pressable>
        <Text style={styles.title}>Glossary</Text>
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(t) => t.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View>
            <Text style={styles.intro}>
              Pin how specific names should be translated — character names, items, places.
              Every screen translation will use these exactly.
            </Text>
            <View style={styles.form} testID="glossary-form">
              <View style={styles.inputRow}>
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>TERM ON SCREEN</Text>
                  <TextInput
                    testID="glossary-term-input"
                    value={term}
                    onChangeText={setTerm}
                    placeholder="e.g. 勇者"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    autoCorrect={false}
                    returnKeyType="next"
                    onSubmitEditing={() => translationRef.current?.focus()}
                    maxLength={80}
                  />
                </View>
                <Icon name="arrow-right" size={20} color={colors.muted} />
                <View style={styles.inputWrap}>
                  <Text style={styles.inputLabel}>ALWAYS SHOW AS</Text>
                  <TextInput
                    ref={translationRef}
                    testID="glossary-translation-input"
                    value={translation}
                    onChangeText={setTranslation}
                    placeholder="e.g. The Hero"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={submit}
                    maxLength={120}
                  />
                </View>
              </View>
              {formError && (
                <Text style={styles.errorText} testID="glossary-error">
                  {formError}
                </Text>
              )}
              <Pressable
                testID="glossary-add-button"
                onPress={submit}
                disabled={!canAdd}
                style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
              >
                {add.isPending ? (
                  <ActivityIndicator color={colors.onBrandPrimary} />
                ) : (
                  <Icon name="plus" size={20} color={colors.onBrandPrimary} />
                )}
                <Text style={styles.addText}>Add term</Text>
              </Pressable>
            </View>
            {!!data?.length && (
              <Text style={styles.sectionLabel} testID="glossary-count">
                {data.length} {data.length === 1 ? "TERM" : "TERMS"}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 24 }} />
          ) : (
            <View style={styles.emptyWrap} testID="glossary-empty">
              <Icon name="book-open-page-variant-outline" size={40} color={colors.muted} />
              <Text style={styles.emptyTitle}>No terms yet</Text>
              <Text style={styles.emptySub}>
                Add a name above and it will translate the same way on every screen.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.row} testID={`glossary-item-${item.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.term}>{item.term}</Text>
              <Text style={styles.translation}>→ {item.translation}</Text>
            </View>
            <Pressable
              testID={`glossary-delete-${item.id}`}
              onPress={() => remove.mutate(item.id)}
              style={styles.deleteBtn}
              hitSlop={4}
            >
              <Icon name="trash-can-outline" size={20} color={colors.error} />
            </Pressable>
          </View>
        )}
      />
    </KeyboardAvoidingView>
  );
}
