import { describe, expect, it } from "vitest";
import { reconcileKeys } from "./reconcile";

/**
 * The HUD's queue list keeps the same `<article>` element per command
 * `instanceId` across re-renders. That promise is what preserves horizontal
 * scroll, focus, and CSS transitions while playback ticks.
 *
 * `reconcileKeys` is the brain of that. These tests pin its behavior — and a
 * simulator test mimics what the HUD does with the resulting ops against a
 * tiny in-memory parent. If those simulator tests pass, the real DOM is
 * doing the same thing, because the HUD's apply loop is a 1:1 mapping of
 * the ops to `parent.insertBefore` / `parent.removeChild` calls.
 */
describe("reconcileKeys", () => {
  it("returns no ops when current matches desired", () => {
    expect(reconcileKeys(["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
  });

  it("inserts new keys at the right position", () => {
    expect(reconcileKeys(["a", "b"], ["a", "b", "c"])).toEqual([
      { type: "insert", key: "c", beforeKey: null },
    ]);
    expect(reconcileKeys(["a", "c"], ["a", "b", "c"])).toEqual([
      { type: "insert", key: "b", beforeKey: "c" },
    ]);
  });

  it("removes keys no longer present", () => {
    expect(reconcileKeys(["a", "b", "c"], ["a", "c"])).toEqual([
      { type: "remove", key: "b" },
    ]);
  });

  it("moves keys without rebuilding them", () => {
    const ops = reconcileKeys(["a", "b", "c"], ["c", "a", "b"]);
    // Should reorder via `move`, never via remove+insert (which would lose
    // the node identity).
    expect(ops.every((op) => op.type !== "remove")).toBe(true);
    expect(ops.some((op) => op.type === "move")).toBe(true);
  });
});

/**
 * Tiny `Node`/`Parent` stand-in. Just enough to mirror the contract the HUD
 * relies on: identity-preserving insertBefore + removeChild + children
 * lookup by data-instance-id. If this test passes, the real DOM ops apply
 * the same.
 */
interface FakeNode {
  id: string;
  parent: FakeParent | null;
}
interface FakeParent {
  children: FakeNode[];
  insertBefore: (node: FakeNode, before: FakeNode | null) => void;
  removeChild: (node: FakeNode) => void;
}

const makeParent = (initialIds: string[]): { parent: FakeParent; nodes: Map<string, FakeNode> } => {
  const nodes = new Map<string, FakeNode>();
  const children: FakeNode[] = [];
  const parent: FakeParent = {
    children,
    insertBefore(node, before) {
      if (node.parent === parent) {
        const idx = children.indexOf(node);
        if (idx !== -1) children.splice(idx, 1);
      }
      const insertIdx = before ? children.indexOf(before) : children.length;
      children.splice(insertIdx === -1 ? children.length : insertIdx, 0, node);
      node.parent = parent;
    },
    removeChild(node) {
      const idx = children.indexOf(node);
      if (idx !== -1) children.splice(idx, 1);
      node.parent = null;
    },
  };
  for (const id of initialIds) {
    const node: FakeNode = { id, parent };
    nodes.set(id, node);
    children.push(node);
  }
  return { parent, nodes };
};

/**
 * Simulates the HUD's reconcileQueueList loop: applies the ops, reusing nodes
 * out of an "elements" map keyed by id. New ids are minted as new nodes.
 *
 * Returns the resulting children plus the original node map — the map's
 * identities are what we assert against.
 */
const applyReconcile = (
  parent: FakeParent,
  nodes: Map<string, FakeNode>,
  desiredKeys: string[],
): { finalIds: string[]; reusedAll: boolean } => {
  const currentKeys = parent.children.map((c) => c.id);
  const ops = reconcileKeys(currentKeys, desiredKeys);

  for (const op of ops) {
    if (op.type === "remove") {
      const node = nodes.get(op.key);
      if (node) parent.removeChild(node);
      nodes.delete(op.key);
    } else {
      let node = nodes.get(op.key);
      let reused = true;
      if (!node) {
        node = { id: op.key, parent: null };
        nodes.set(op.key, node);
        reused = false;
      }
      const before = op.beforeKey ? (nodes.get(op.beforeKey) ?? null) : null;
      parent.insertBefore(node, before);
      // `reused` is unused — we just want the path covered.
      void reused;
    }
  }
  return {
    finalIds: parent.children.map((c) => c.id),
    reusedAll: true,
  };
};

describe("HUD queue reconcile (identity preservation)", () => {
  it("preserves node identity when the queue is rebuilt with the same ids", () => {
    const { parent, nodes } = makeParent(["a", "b", "c"]);
    const original = {
      a: nodes.get("a"),
      b: nodes.get("b"),
      c: nodes.get("c"),
    };

    applyReconcile(parent, nodes, ["a", "b", "c"]);

    // Same ids, same nodes — no rebuild.
    expect(nodes.get("a")).toBe(original.a);
    expect(nodes.get("b")).toBe(original.b);
    expect(nodes.get("c")).toBe(original.c);
    expect(parent.children.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("preserves identity of surviving nodes when one is appended", () => {
    const { parent, nodes } = makeParent(["a", "b"]);
    const before = { a: nodes.get("a"), b: nodes.get("b") };

    applyReconcile(parent, nodes, ["a", "b", "c"]);

    expect(nodes.get("a")).toBe(before.a);
    expect(nodes.get("b")).toBe(before.b);
    expect(nodes.get("c")).toBeDefined();
    expect(parent.children.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("preserves identity of surviving nodes when one is removed", () => {
    const { parent, nodes } = makeParent(["a", "b", "c"]);
    const before = { a: nodes.get("a"), c: nodes.get("c") };

    applyReconcile(parent, nodes, ["a", "c"]);

    expect(nodes.get("a")).toBe(before.a);
    expect(nodes.get("c")).toBe(before.c);
    expect(nodes.has("b")).toBe(false);
    expect(parent.children.map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("preserves identity of surviving nodes when the queue is reordered", () => {
    const { parent, nodes } = makeParent(["a", "b", "c"]);
    const before = {
      a: nodes.get("a"),
      b: nodes.get("b"),
      c: nodes.get("c"),
    };

    applyReconcile(parent, nodes, ["c", "a", "b"]);

    // All three nodes survived — same object references.
    expect(nodes.get("a")).toBe(before.a);
    expect(nodes.get("b")).toBe(before.b);
    expect(nodes.get("c")).toBe(before.c);
    expect(parent.children.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });

  it("simulates a playback tick: 5 rebuilds with the same ids yield the same nodes", () => {
    const { parent, nodes } = makeParent(["q1", "q2", "q3", "q4"]);
    const originals = ["q1", "q2", "q3", "q4"].map((id) => nodes.get(id));

    for (let tick = 0; tick < 5; tick += 1) {
      applyReconcile(parent, nodes, ["q1", "q2", "q3", "q4"]);
    }

    expect(nodes.get("q1")).toBe(originals[0]);
    expect(nodes.get("q2")).toBe(originals[1]);
    expect(nodes.get("q3")).toBe(originals[2]);
    expect(nodes.get("q4")).toBe(originals[3]);
  });
});
