// @ts-strict-ignore
export function Graph() {
  const graph = {
    addNode,
    removeNode,
    adjacent,
    adjacentIncoming,
    addEdge,
    removeEdge,
    removeIncomingEdges,
    topologicalSort,
    generateDOT,
    getEdges,
  };

  const edges = new Map();
  const incomingEdges = new Map();

  function getEdges() {
    return { edges, incomingEdges };
  }

  function addNode(node) {
    edges.set(node, adjacent(node));
    incomingEdges.set(node, adjacentIncoming(node));
    return graph;
  }

  function removeIncomingEdges(node) {
    const incoming = adjacentIncoming(node);
    incomingEdges.set(node, new Set());

    const iter = incoming.values();
    let cur = iter.next();
    while (!cur.done) {
      removeEdge(cur.value, node);
      cur = iter.next();
    }
  }

  function removeNode(node) {
    removeIncomingEdges(node);
    edges.delete(node);
    incomingEdges.delete(node);
    return graph;
  }

  function adjacent(node) {
    return edges.get(node) || new Set();
  }

  function adjacentIncoming(node) {
    return incomingEdges.get(node) || new Set();
  }

  // Adds an edge from node u to node v.
  // Implicitly adds the nodes if they were not already added.
  function addEdge(node1, node2) {
    addNode(node1);
    addNode(node2);
    adjacent(node1).add(node2);
    adjacentIncoming(node2).add(node1);
    return graph;
  }

  // Removes the edge from node u to node v.
  // Does not remove the nodes.
  // Does nothing if the edge does not exist.
  function removeEdge(node1, node2) {
    if (edges.has(node1)) {
      adjacent(node1).delete(node2);
    }
    if (incomingEdges.has(node2)) {
      adjacentIncoming(node2).delete(node1);
    }
    return graph;
  }

  // Returns every node reachable from `sourceNodes`, each one ahead of the
  // nodes that depend on it.
  function topologicalSort(sourceNodes) {
    const visited = new Set();
    const finished = [];

    sourceNodes.forEach(name => {
      if (!visited.has(name)) {
        depthFirstFinishOrder(name, visited, finished);
      }
    });

    // Reversing the finish order once keeps the whole sort linear in the
    // size of the graph.
    return finished.reverse();
  }

  // Appends each node reachable from `root` to `finished` once all of its
  // dependents are in it. A node's dependents are walked last to first.
  function depthFirstFinishOrder(root, visited, finished) {
    const onStack = new Set([root]);
    const stack: StackFrame[] = [frameFor(root)];

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];

      if (frame.next >= 0) {
        const child = frame.children[frame.next--];
        if (!visited.has(child) && !onStack.has(child)) {
          onStack.add(child);
          stack.push(frameFor(child));
        }
      } else {
        stack.pop();
        onStack.delete(frame.value);
        visited.add(frame.value);
        finished.push(frame.value);
      }
    }
  }

  function frameFor(node): StackFrame {
    const children = [...adjacent(node)];
    return { value: node, children, next: children.length - 1 };
  }

  function generateDOT() {
    const edgeStrings = [];
    edges.forEach(function (adj, edge) {
      if (adj.length !== 0) {
        edgeStrings.push(`${edge} -> {${adj.join(',')}}`);
      }
    });

    return `
    digraph G {
      ${edgeStrings.join('\n').replace(/!/g, '_')}
    }
    `;
  }

  return graph;
}

type StackFrame = {
  value: string;
  children: string[];
  next: number;
};
