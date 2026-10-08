import { DependencyEdge, DependencyGraph, ServiceNode, TelemetryEvent } from '../types/telemetry';

export class DependencyGraphBuilder {
  private nodes: Map<string, ServiceNode> = new Map();
  private edges: Map<string, DependencyEdge> = new Map();

  private formatTimestamp(ts?: string | number): string {
    if (!ts) return new Date().toISOString();
    if (typeof ts === 'number') return new Date(ts).toISOString();
    return new Date(ts).toISOString();
  }

  /**
   * Processes an incoming telemetry event and updates graph nodes & edges dynamically.
   */
  public processTelemetry(event: TelemetryEvent): {
    nodesAdded: string[];
    edgeAdded: boolean;
    edgeUpdated: boolean;
  } {
    if (!event.source || !event.target) {
      throw new Error('Telemetry event must specify both source and target services.');
    }

    const source = event.source.trim();
    const target = event.target.trim();
    const ts = this.formatTimestamp(event.timestamp);
    const nodesAdded: string[] = [];

    // 1. Process Source Node
    if (!this.nodes.has(source)) {
      this.nodes.set(source, {
        id: source,
        name: source,
        firstSeen: ts,
        lastSeen: ts,
        requestCount: 1
      });
      nodesAdded.push(source);
    } else {
      const existing = this.nodes.get(source)!;
      existing.lastSeen = ts;
      existing.requestCount += 1;
    }

    // 2. Process Target Node
    if (!this.nodes.has(target)) {
      this.nodes.set(target, {
        id: target,
        name: target,
        firstSeen: ts,
        lastSeen: ts,
        requestCount: 1
      });
      nodesAdded.push(target);
    } else {
      const existing = this.nodes.get(target)!;
      existing.lastSeen = ts;
      existing.requestCount += 1;
    }

    // 3. Process Directed Edge (source -> target)
    const edgeKey = `${source}->${target}`;
    let edgeAdded = false;
    let edgeUpdated = false;

    if (!this.edges.has(edgeKey)) {
      // New relationship: create edge
      const newEdge: DependencyEdge = {
        id: edgeKey,
        source,
        target,
        callCount: 1,
        firstSeen: ts,
        lastSeen: ts,
        avgLatencyMs: event.latencyMs,
        lastHttpStatus: event.httpStatus
      };
      this.edges.set(edgeKey, newEdge);
      edgeAdded = true;
    } else {
      // Existing relationship: update without creating duplicate
      const existingEdge = this.edges.get(edgeKey)!;
      const prevCount = existingEdge.callCount;
      existingEdge.callCount += 1;
      existingEdge.lastSeen = ts;

      if (event.latencyMs !== undefined) {
        if (existingEdge.avgLatencyMs !== undefined) {
          // Calculate cumulative moving average
          existingEdge.avgLatencyMs = Number(
            ((existingEdge.avgLatencyMs * prevCount + event.latencyMs) / existingEdge.callCount).toFixed(2)
          );
        } else {
          existingEdge.avgLatencyMs = event.latencyMs;
        }
      }

      if (event.httpStatus !== undefined) {
        existingEdge.lastHttpStatus = event.httpStatus;
      }

      edgeUpdated = true;
    }

    return {
      nodesAdded,
      edgeAdded,
      edgeUpdated
    };
  }

  /**
   * Returns current snapshot of nodes and directed edges in the dependency graph.
   */
  public getGraph(): DependencyGraph {
    return {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values())
    };
  }

  /**
   * Retrieves a specific node by service ID
   */
  public getNode(id: string): ServiceNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Retrieves a directed edge between source and target
   */
  public getEdge(source: string, target: string): DependencyEdge | undefined {
    return this.edges.get(`${source}->${target}`);
  }

  /**
   * Resets all nodes and edges (useful for tests or re-initialization)
   */
  public clear(): void {
    this.nodes.clear();
    this.edges.clear();
  }
}
