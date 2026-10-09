// Pure functions for parsing fileset IDs from data.json fields.
// Browser-safe (no Node.js imports). Mirrors logic in navtree-utils.ts.

export function parseTextFilesetId(
  tField: string | undefined,
  distinctId: string,
): string {
  if (!tField) return ""
  let raw = tField
  if (raw.endsWith(".txt")) {
    raw = raw.slice(0, -4)
  }
  if (raw.length < 6) {
    raw = distinctId + raw
  }
  if (raw.endsWith("_ET")) {
    raw = raw.slice(0, -3)
  }
  return raw
}

export function parseAudioFilesetId(
  aField: string | undefined,
  distinctId: string,
): string {
  if (!aField) return ""
  let raw = aField
  if (raw.endsWith(".mp3")) {
    raw = raw.slice(0, -4)
  }
  if (raw.length < 6) {
    raw = distinctId + raw
  }
  return raw
}
