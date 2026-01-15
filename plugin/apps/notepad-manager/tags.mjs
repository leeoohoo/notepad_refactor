export function tagsToText(tags) {
  return (Array.isArray(tags) ? tags : []).join(', ');
}

export function parseTags(input) {
  const raw = String(input ?? '');
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  for (const tag of parts) {
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

