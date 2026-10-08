import { TelemetryEvent } from '../types/telemetry';

export interface InjectOptions {
  traceId?: string;
  spanId?: string;
  httpStatus?: number;
  latencyMs?: number;
  protocol?: string;
  timestamp?: string | number;
}

export interface ServicePair {
  source: string;
  target: string;
  latencyMs?: number;
  httpStatus?: number;
}

/**
 * Common, generic Telemetry Injector for arbitrary microservices.
 * Does not contain hardcoded service identities or topologies.
 */
export class TelemetryInjector {
  private backendUrl: string;

  constructor(backendUrl: string = process.env.BACKEND_URL || 'http://localhost:8080') {
    this.backendUrl = backendUrl;
  }

  /**
   * Generates a unique trace ID
   */
  public generateTraceId(): string {
    return 'trace-' + Math.random().toString(36).substring(2, 10) + '-' + Date.now().toString(36);
  }

  /**
   * Constructs a validated TelemetryEvent representation for any arbitrary pair of services
   */
  public createEvent(
    source: string,
    target: string,
    options: InjectOptions = {}
  ): TelemetryEvent {
    if (!source || !target) {
      throw new Error('Telemetry event requires valid non-empty source and target service names.');
    }

    return {
      traceId: options.traceId || this.generateTraceId(),
      spanId: options.spanId || 'span-' + Math.random().toString(36).substring(2, 8),
      source: source.trim(),
      target: target.trim(),
      timestamp: options.timestamp || new Date().toISOString(),
      httpStatus: options.httpStatus ?? 200,
      latencyMs: options.latencyMs ?? Math.floor(Math.random() * 50) + 10,
      protocol: options.protocol || 'HTTP'
    };
  }

  /**
   * Sends a telemetry event to the Express backend
   */
  public async sendToBackend(event: TelemetryEvent): Promise<any> {
    const res = await fetch(`${this.backendUrl}/api/telemetry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to send telemetry (${res.status}): ${errorText}`);
    }

    return await res.json();
  }

  /**
   * Generates and immediately transmits a single telemetry event for any arbitrary source & target
   */
  public async inject(
    source: string,
    target: string,
    options: InjectOptions = {}
  ): Promise<any> {
    const event = this.createEvent(source, target, options);
    return await this.sendToBackend(event);
  }

  /**
   * Injects an arbitrary list of communication events dynamically
   */
  public async injectPairs(pairs: ServicePair[]): Promise<any[]> {
    const results: any[] = [];
    for (const pair of pairs) {
      const result = await this.inject(pair.source, pair.target, {
        latencyMs: pair.latencyMs,
        httpStatus: pair.httpStatus
      });
      results.push(result);
    }
    return results;
  }

  /**
   * Injects a sequential chain of arbitrary services: S1 -> S2 -> S3 ...
   */
  public async injectChain(services: string[], options: InjectOptions = {}): Promise<any[]> {
    if (services.length < 2) {
      throw new Error('A service chain requires at least two service names.');
    }
    const results: any[] = [];
    for (let i = 0; i < services.length - 1; i++) {
      const result = await this.inject(services[i], services[i + 1], options);
      results.push(result);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Dynamic CLI Runner: Parses arbitrary arguments from command line or flags
// ---------------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const injector = new TelemetryInjector();

  (async () => {
    try {
      // 1. JSON argument: --json='[{"source":"A","target":"B"}]'
      const jsonArg = args.find((a) => a.startsWith('--json='));
      if (jsonArg) {
        const payload = JSON.parse(jsonArg.replace('--json=', ''));
        const pairs: ServicePair[] = Array.isArray(payload) ? payload : [payload];
        console.log(`[TelemetryInjector] Injecting ${pairs.length} event(s) from JSON argument...`);
        const results = await injector.injectPairs(pairs);
        console.log('[TelemetryInjector] Completed successfully:', results);
        return;
      }

      // 2. Chain argument: --chain=ServiceA,ServiceB,ServiceC
      const chainArg = args.find((a) => a.startsWith('--chain='));
      if (chainArg) {
        const services = chainArg
          .replace('--chain=', '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        console.log(`[TelemetryInjector] Injecting chain: ${services.join(' -> ')}`);
        const results = await injector.injectChain(services);
        console.log('[TelemetryInjector] Chain injected successfully:', results);
        return;
      }

      // 3. Named arguments: --source=ServiceA --target=ServiceB
      const sourceArg = args.find((a) => a.startsWith('--source='));
      const targetArg = args.find((a) => a.startsWith('--target='));
      if (sourceArg && targetArg) {
        const source = sourceArg.replace('--source=', '').trim();
        const target = targetArg.replace('--target=', '').trim();
        console.log(`[TelemetryInjector] Injecting: ${source} -> ${target}`);
        const res = await injector.inject(source, target);
        console.log('[TelemetryInjector] Successfully injected:', res);
        return;
      }

      // 4. Positional arguments: <source> <target> [latencyMs] [httpStatus]
      const positional = args.filter((a) => !a.startsWith('--'));
      if (positional.length >= 2) {
        const source = positional[0].trim();
        const target = positional[1].trim();
        const latencyMs = positional[2] ? parseInt(positional[2], 10) : undefined;
        const httpStatus = positional[3] ? parseInt(positional[3], 10) : undefined;

        console.log(`[TelemetryInjector] Injecting: ${source} -> ${target}`);
        const res = await injector.inject(source, target, { latencyMs, httpStatus });
        console.log('[TelemetryInjector] Successfully injected:', res);
        return;
      }

      // 5. If no arguments are provided, print usage documentation (no hardcoded services)
      console.log('========================================================================');
      console.log('  Generic AutoTrace Telemetry Injector CLI');
      console.log('========================================================================');
      console.log('Usage:');
      console.log('  npx tsx src/injector/telemetryInjector.ts <source> <target> [latency] [status]');
      console.log('  npx tsx src/injector/telemetryInjector.ts --source=<src> --target=<tgt>');
      console.log('  npx tsx src/injector/telemetryInjector.ts --chain=ServiceA,ServiceB,ServiceC');
      console.log('  npx tsx src/injector/telemetryInjector.ts --json=\'[{"source":"ServiceA","target":"ServiceB"}]\'');
      console.log('');
      console.log('Examples:');
      console.log('  npx tsx src/injector/telemetryInjector.ts ServiceA ServiceB 25 200');
      console.log('  npx tsx src/injector/telemetryInjector.ts ServiceX ServiceY 40 200');
      console.log('  npx tsx src/injector/telemetryInjector.ts --chain=ServiceA,ServiceB,ServiceC');
      console.log('========================================================================');
    } catch (err: any) {
      console.error('[TelemetryInjector] Error injecting telemetry:', err.message);
      console.log('Ensure the Express backend is running (npm start).');
      process.exit(1);
    }
  })();
}
