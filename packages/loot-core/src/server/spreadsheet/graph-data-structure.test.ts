import { Graph } from './graph-data-structure';

describe('Graph.topologicalSort', () => {
  it('puts every node ahead of the nodes that depend on it', () => {
    const graph = Graph();
    graph.addEdge('budget', 'leftover');
    graph.addEdge('spent', 'leftover');
    graph.addEdge('leftover', 'total');
    graph.addEdge('leftover', 'next-leftover');
    graph.addEdge('next-leftover', 'total');

    const sorted = graph.topologicalSort(['budget', 'spent']);

    expect(sorted).toEqual([
      'spent',
      'budget',
      'leftover',
      'next-leftover',
      'total',
    ]);
  });

  it('includes each reachable node once, even from several sources', () => {
    const graph = Graph();
    graph.addEdge('a', 'c');
    graph.addEdge('b', 'c');
    graph.addEdge('c', 'd');

    const sorted = graph.topologicalSort(['a', 'b', 'c', 'a']);

    expect(sorted).toEqual(['b', 'a', 'c', 'd']);
  });

  it('returns a source with no dependents on its own', () => {
    const graph = Graph();

    expect(graph.topologicalSort(['lonely'])).toEqual(['lonely']);
  });

  it('sorts a long chain of months without overflowing the stack', () => {
    const graph = Graph();
    const length = 200_000;
    for (let i = 1; i < length; i++) {
      graph.addEdge(`month-${i - 1}`, `month-${i}`);
    }

    const sorted = graph.topologicalSort(['month-0']);

    expect(sorted).toHaveLength(length);
    expect(sorted[0]).toBe('month-0');
    expect(sorted[length - 1]).toBe(`month-${length - 1}`);
  });

  it('stops at a cycle instead of looping forever', () => {
    const graph = Graph();
    graph.addEdge('a', 'b');
    graph.addEdge('b', 'a');

    expect(graph.topologicalSort(['a'])).toEqual(['a', 'b']);
  });
});
