import express, { Request, Response } from 'express';
import { DependencyGraphBuilder } from './graph/dependencyGraphBuilder';
import { TelemetryEvent } from './types/telemetry';

export const app = express();
export const graphBuilder = new DependencyGraphBuilder();

app.use(express.json());

// Ingest telemetry events (single event or batch)
app.post('/api/telemetry', (req: Request, res: Response) => {
  try {
    const body = req.body;
    const events: TelemetryEvent[] = Array.isArray(body) ? body : [body];

    if (events.length === 0) {
      return res.status(400).json({ error: 'No telemetry events provided.' });
    }

    const results = [];
    for (const evt of events) {
      if (!evt.source || !evt.target) {
        return res.status(400).json({
          error: 'Invalid telemetry event: source and target are required.',
          received: evt
        });
      }
      const outcome = graphBuilder.processTelemetry(evt);
      results.push({
        event: `${evt.source} -> ${evt.target}`,
        outcome
      });
    }

    const currentGraph = graphBuilder.getGraph();
    return res.status(200).json({
      success: true,
      processed: events.length,
      graphSummary: {
        totalNodes: currentGraph.nodes.length,
        totalEdges: currentGraph.edges.length
      },
      details: results
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to process telemetry' });
  }
});

// Retrieve current dependency graph topology (nodes + directed edges)
app.get('/api/graph', (_req: Request, res: Response) => {
  return res.status(200).json(graphBuilder.getGraph());
});

// Reset graph state (useful for automated testing scenarios)
app.post('/api/graph/reset', (_req: Request, res: Response) => {
  graphBuilder.clear();
  return res.status(200).json({ success: true, message: 'Dependency graph cleared.' });
});

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  return res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[AutoTrace Express Backend] Running on http://localhost:${PORT}`);
    console.log(`- POST /api/telemetry : Ingest telemetry events`);
    console.log(`- GET  /api/graph     : View dependency graph`);
    console.log(`- POST /api/graph/reset : Reset graph`);
  });
}
