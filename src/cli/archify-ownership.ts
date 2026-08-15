export const ARCHIFY_REF_FILE = ".ai-share-archify-ref.json";

export type ArchifyOwnershipRecord = {
  repo: string;
  skill: string;
  ref: string;
};

export function formatArchifyOwnershipRecord(record: ArchifyOwnershipRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}
