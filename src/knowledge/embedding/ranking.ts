import type { KnowledgeObject } from "../core/types.ts";

export type SimilarityResult = {
  object: KnowledgeObject;
  score: number;
};

export function rankByTextSimilarity(objects: KnowledgeObject[], query: string): SimilarityResult[] {
  const terms = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 1);
  return objects
    .map((object) => ({ object, score: scoreObject(object, terms) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score);
}

function scoreObject(object: KnowledgeObject, terms: string[]): number {
  const haystack =
    `${object.title} ${object.summary ?? ""} ${object.path ?? ""} ${object.tags.join(" ")}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0);
}
