const BACKEND = process.env.EXPO_PUBLIC_BACKEND_URL;

export type GlossaryTerm = {
  id: string;
  term: string;
  translation: string;
  created_at: string;
};

export async function fetchGlossary(): Promise<GlossaryTerm[]> {
  const r = await fetch(`${BACKEND}/api/glossary`);
  if (!r.ok) throw new Error("Failed to load glossary");
  return r.json();
}
