/**
 * Keyed list reconciler — pure data, no DOM.
 *
 * Given the current list of keys (in order) and the desired list of keys
 * (in order), return a minimal sequence of operations that, when applied
 * in order against a parent collection, transform `current` into `desired`
 * while preserving identity of nodes whose key is in both lists.
 *
 * The operations are intentionally simple — they're designed to map 1:1
 * to vanilla `parent.insertBefore(node, reference)` / `parent.removeChild(node)`
 * calls in the HUD, and to a plain array splice/push/move in unit tests.
 *
 * The resulting ops, applied in order, will leave the parent in the exact
 * order described by `desired`. Reused nodes (keys present in both inputs)
 * keep their original identity — that's the whole point of the reconciler.
 */
export type ReconcileOp =
  | { type: "remove"; key: string }
  | { type: "insert"; key: string; beforeKey: string | null }
  | { type: "move"; key: string; beforeKey: string | null };

export function reconcileKeys(
  current: readonly string[],
  desired: readonly string[],
): ReconcileOp[] {
  const ops: ReconcileOp[] = [];
  const desiredSet = new Set(desired);

  // Step 1 — remove anything that's gone.
  const survivors: string[] = [];
  for (const key of current) {
    if (desiredSet.has(key)) {
      survivors.push(key);
    } else {
      ops.push({ type: "remove", key });
    }
  }

  // Step 2 — walk `desired`, inserting new keys and moving misplaced ones.
  // We maintain a virtual ordering (`working`) to compute correct beforeKey
  // references as we mutate.
  const working = survivors.slice();
  for (let i = 0; i < desired.length; i += 1) {
    const key = desired[i];
    const currentKey = working[i];
    if (currentKey === key) {
      continue;
    }

    const beforeKey = currentKey ?? null;
    const existingIndex = working.indexOf(key);
    if (existingIndex === -1) {
      ops.push({ type: "insert", key, beforeKey });
      working.splice(i, 0, key);
    } else {
      ops.push({ type: "move", key, beforeKey });
      working.splice(existingIndex, 1);
      working.splice(i, 0, key);
    }
  }

  return ops;
}
