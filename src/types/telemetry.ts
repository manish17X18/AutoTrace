export interface TelemetryEvent {
  traceId?: string;
  spanId?: string;
  source: string;
  target: string;
  timestamp: string | number;
  httpStatus?: number;
  latencyMs?: number;
  protocol?: string;
}

export interface ServiceNode {
  id: string;
  name: string;
  firstSeen: string;
  lastSeen: string;
  requestCount: number;
}

export interface DependencyEdge {
  id: string;
  source: string;
  target: string;
  callCount: number;
  firstSeen: string;
  lastSeen: string;
  avgLatencyMs?: number;
  lastHttpStatus?: number;
}

export interface DependencyGraph {
  nodes: ServiceNode[];
  edges: DependencyEdge[];
}
