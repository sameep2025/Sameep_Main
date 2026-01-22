import { useEffect, useMemo, useState } from "react";
import { fetchCategories } from "./ApiService";

/**
 * Builds full tree for a selected category
 * No lazy loading, no guessing, no flicker
 */
export function useCategoryTree({ setupSelectedCategory, overrideCatId }) {
  const [nodes, setNodes] = useState({});
  const [rootIds, setRootIds] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [parentMap, setParentMap] = useState({});

  const catId = useMemo(
    () =>
      overrideCatId ||
      setupSelectedCategory?._id ||
      setupSelectedCategory?.id,
    [overrideCatId, setupSelectedCategory?._id, setupSelectedCategory?.id]
  );

  /* ================= RECURSIVE TREE BUILDER ================= */

  const buildTree = async (parentId, nodesMap, parentMap) => {
    const children = await fetchCategories(parentId);

    for (const child of children) {
      nodesMap[child._id] = {
        id: child._id,
        data: child,
        children: [],
        expanded: false,
      };

      parentMap[child._id] = parentId;

      // 🔁 recursively fetch all descendants
      await buildTree(child._id, nodesMap, parentMap);
    }
  };

  /* ================= LOAD TREE ================= */

  useEffect(() => {
    if (!catId) return;

    const loadTree = async () => {
      const nodesMap = {};
      const pMap = {};

      // 1️⃣ first level (children of selected category)
      const roots = await fetchCategories(catId);
      const rIds = roots.map((r) => r._id);

      for (const root of roots) {
        nodesMap[root._id] = {
          id: root._id,
          data: root,
          children: [],
          expanded: false,
        };
        pMap[root._id] = null;

        // 🔁 fetch entire subtree
        await buildTree(root._id, nodesMap, pMap);
      }

      // 2️⃣ link children properly
      Object.keys(pMap).forEach((id) => {
        const parentId = pMap[id];
        if (parentId && nodesMap[parentId]) {
          nodesMap[parentId].children.push(id);
        }
      });

      setNodes(nodesMap);
      setParentMap(pMap);
      setRootIds(rIds);
    setSelectedIds(Object.keys(nodesMap));
 // optional: auto-select roots
    };

    loadTree();
  }, [catId]);

  /* ================= TOGGLE EXPAND ================= */

  const toggleNode = (id) => {
    setNodes((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        expanded: !prev[id].expanded,
      },
    }));
  };

  /* ================= HELPERS ================= */

  const getAllDescendants = (id, map) => {
    const node = map[id];
    if (!node) return [];

    let result = [...node.children];
    node.children.forEach((cid) => {
      result = result.concat(getAllDescendants(cid, map));
    });
    return result;
  };


  const getAllAncestors = (id, pMap) => {
    const result = [];
    let current = pMap[id];
    while (current) {
      result.push(current);
      current = pMap[current];
    }
    return result;
  };

  const hasAnySelectedChild = (parentId, selectedSet, map) => {
    const node = map[parentId];
    if (!node) return false;
    return node.children.some((cid) => selectedSet.has(cid));
  };

  /* ================= TOGGLE SELECT ================= */

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const selectedSet = new Set(prev);
      const isSelected = selectedSet.has(id);

      const descendants = getAllDescendants(id, nodes);
      const ancestors = getAllAncestors(id, parentMap);

      if (isSelected) {
        selectedSet.delete(id);
        descendants.forEach((d) => selectedSet.delete(d));

        ancestors.forEach((pid) => {
          if (!hasAnySelectedChild(pid, selectedSet, nodes)) {
            selectedSet.delete(pid);
          }
        });
      } else {
        selectedSet.add(id);
        descendants.forEach((d) => selectedSet.add(d));
        ancestors.forEach((a) => selectedSet.add(a));
      }

      return Array.from(selectedSet);
    });
  };

  return {
    nodes,
    rootIds,
    toggleNode,
    toggleSelect,
    selectedIds,
  };
}
