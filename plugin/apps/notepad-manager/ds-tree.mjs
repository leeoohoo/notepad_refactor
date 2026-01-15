async function importFirst(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  let lastError = null;
  for (const candidate of list) {
    if (!candidate) continue;
    try {
      return await import(candidate);
    } catch (err) {
      lastError = err;
    }
  }
  const hint = list.filter(Boolean).join('\n  - ');
  const message = `Failed to load ds-tree modules. Tried:\n  - ${hint}`;
  const error = new Error(message);
  error.cause = lastError;
  throw error;
}

function makeCandidates(relativePath) {
  const rel = typeof relativePath === 'string' ? relativePath.trim() : '';
  if (!rel) return [];
  return [
    new URL(`../../common/ui/${rel}`, import.meta.url).toString(),
    new URL(`../../../../../common/ui/${rel}`, import.meta.url).toString(),
  ];
}

const [treeView, treeStyles] = await Promise.all([
  importFirst(makeCandidates('ds-tree-view.mjs')),
  importFirst(makeCandidates('ds-tree-styles.mjs')),
]);

export const createDsPathTreeView = treeView.createDsPathTreeView;
export const DS_TREE_STYLES = treeStyles.DS_TREE_STYLES;

