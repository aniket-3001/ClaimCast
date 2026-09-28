/**
 * Chunking and retrieval over one uploaded document.
 *
 * Shared by the two places that read a policy PDF with a model: `extract.ts`,
 * which retrieves the passages each field is most likely stated in before the
 * model reads the schedule, and `rag.ts`, which retrieves the passages a
 * person's question is about. Both use the same TF-IDF, over the same chunks,
 * so a passage that ranks first for one ranks first for the other.
 *
 * Pure and offline: no embeddings, no vector store, no network. A policy
 * document is at most a few dozen chunks, and a score that can be computed and
 * tested without a model in the loop is the auditable choice here.
 */

export interface Chunk {
  id: string;
  page: number;
  text: string;
}

const CHUNK_CHARS = 700;
const OVERLAP_CHARS = 150;

/** Each page, sliced into overlapping windows on a word boundary. Pure, offline. */
export function chunkPages(pages: string[]): Chunk[] {
  const chunks: Chunk[] = [];

  pages.forEach((raw, i) => {
    const page = i + 1;
    const text = raw.trim();
    if (!text) return;

    let start = 0;
    let index = 0;
    while (start < text.length) {
      let end = Math.min(start + CHUNK_CHARS, text.length);
      if (end < text.length) {
        const lastSpace = text.lastIndexOf(" ", end);
        if (lastSpace > start) end = lastSpace;
      }
      const slice = text.slice(start, end).trim();
      if (slice) chunks.push({ id: `${page}-${index}`, page, text: slice });
      if (end >= text.length) break;
      // Always past `start`, so a run of the document with no spaces at all
      // still terminates instead of looping on the same window forever.
      start = Math.max(end - OVERLAP_CHARS, start + 1);
      index++;
    }
  });

  return chunks;
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "to", "in", "and", "or", "is", "are", "for", "on", "by",
  "with", "as", "at", "this", "that", "it", "be", "will", "shall", "has", "have",
  "not", "no", "any", "which", "under", "per", "than", "each", "such", "from",
  "was", "were", "what", "who", "how", "do", "does", "my", "your", "i",
]);

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 2 && !STOPWORDS.has(t),
  );
}

export interface ScoredChunk {
  chunk: Chunk;
  score: number;
}

/**
 * The `k` chunks most relevant to `query`, by TF-IDF over this document's own
 * chunks. Empty when the question shares no meaningful word with anything in
 * the document — which the caller treats as "the document does not address
 * this" rather than sending an empty prompt to a model and hoping.
 */
export function retrieve(chunks: Chunk[], query: string, k = 6): ScoredChunk[] {
  const queryTerms = new Set(tokenize(query));
  if (!queryTerms.size || !chunks.length) return [];

  const chunkTerms = chunks.map((c) => tokenize(c.text));
  const df = new Map<string, number>();
  for (const terms of chunkTerms) {
    for (const t of new Set(terms)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const N = chunks.length;
  const idf = (t: string) => Math.log((N + 1) / ((df.get(t) ?? 0) + 1)) + 1;

  const scored = chunks.map((chunk, i) => {
    const tf = new Map<string, number>();
    for (const t of chunkTerms[i]) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    for (const q of queryTerms) {
      const f = tf.get(q);
      if (f) score += f * idf(q);
    }
    return { chunk, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
