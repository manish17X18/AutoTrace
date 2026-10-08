import { Server } from 'http';
import { app, graphBuilder } from './server';
import { TelemetryInjector } from './injector/telemetryInjector';

interface ServiceInteraction {
  source: string;
  target: string;
  latencyMs?: number;
  httpStatus?: number;
}

async function runVerification() {
  console.log('========================================================================');
  console.log('  GENERIC AUTOTRACE INJECTOR & GRAPH BUILDER VERIFICATION');
  console.log('========================================================================\n');

  // Start test server on an ephemeral test port
  const TEST_PORT = 8089;
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(TEST_PORT, () => resolve(s));
  });

  const injector = new TelemetryInjector(`http://localhost:${TEST_PORT}`);
  let allPassed = true;

  try {
    graphBuilder.clear();

    // ------------------------------------------------------------------------
    // Scenario Step 1: Ingest Arbitrary Initial Microservice Topology
    // ------------------------------------------------------------------------
    const initialCommunications: ServiceInteraction[] = [
      { source: 'ServiceA', target: 'ServiceB', latencyMs: 25, httpStatus: 200 },
      { source: 'ServiceB', target: 'ServiceC', latencyMs: 30, httpStatus: 200 },
      { source: 'ServiceC', target: 'ServiceD', latencyMs: 15, httpStatus: 200 }
    ];

    console.log('[Step 1] Injecting arbitrary initial service communications:');
    for (const comm of initialCommunications) {
      console.log(`  -> ${comm.source} -> ${comm.target}`);
      await injector.inject(comm.source, comm.target, {
        latencyMs: comm.latencyMs,
        httpStatus: comm.httpStatus
      });
    }

    const res1 = await fetch(`http://localhost:${TEST_PORT}/api/graph`);
    const graph1 = (await res1.json()) as any;

    // Dynamically calculate expected nodes and edges
    const expectedNodes1 = Array.from(
      new Set(initialCommunications.flatMap((c) => [c.source, c.target]))
    );
    const expectedEdges1 = initialCommunications.map((c) => `${c.source}->${c.target}`);

    const actualNodeIds1: string[] = graph1.nodes.map((n: any) => n.id);
    const actualEdgeIds1: string[] = graph1.edges.map((e: any) => e.id);

    console.log('\n[Step 1 Result] Graph State:');
    console.log('  Nodes detected:', actualNodeIds1);
    console.log('  Directed edges:', actualEdgeIds1);

    const nodesMatch1 =
      actualNodeIds1.length === expectedNodes1.length &&
      expectedNodes1.every((id) => actualNodeIds1.includes(id));

    const edgesMatch1 =
      actualEdgeIds1.length === expectedEdges1.length &&
      expectedEdges1.every((id) => actualEdgeIds1.includes(id));

    if (nodesMatch1 && edgesMatch1) {
      console.log(`  ✓ Step 1 PASSED: Dynamically registered ${actualNodeIds1.length} nodes and ${actualEdgeIds1.length} directed edges.`);
    } else {
      console.error('  ✗ Step 1 FAILED: Nodes or edges did not match expectation.');
      allPassed = false;
    }

    // ------------------------------------------------------------------------
    // Scenario Step 2: Repeated Telemetry (Duplicate Prevention & Counter Check)
    // ------------------------------------------------------------------------
    const repeatedCommunications: ServiceInteraction[] = [
      { source: 'ServiceA', target: 'ServiceB', latencyMs: 22, httpStatus: 200 },
      { source: 'ServiceA', target: 'ServiceB', latencyMs: 28, httpStatus: 200 },
      { source: 'ServiceB', target: 'ServiceC', latencyMs: 35, httpStatus: 200 }
    ];

    console.log('\n[Step 2] Sending repeated communications to test deduplication:');
    for (const comm of repeatedCommunications) {
      console.log(`  -> Repeated: ${comm.source} -> ${comm.target}`);
      await injector.inject(comm.source, comm.target, {
        latencyMs: comm.latencyMs,
        httpStatus: comm.httpStatus
      });
    }

    const res2 = await fetch(`http://localhost:${TEST_PORT}/api/graph`);
    const graph2 = (await res2.json()) as any;

    console.log('\n[Step 2 Result] Graph State after duplicates:');
    console.log('  Total Nodes:', graph2.nodes.length);
    console.log('  Total Edges:', graph2.edges.length);
    console.log('  Edge callCounts:', graph2.edges.map((e: any) => `${e.id} (callCount: ${e.callCount})`));

    // Calculate expected call counts dynamically
    const allEventsSoFar = [...initialCommunications, ...repeatedCommunications];
    const expectedCallCounts: Record<string, number> = {};
    for (const evt of allEventsSoFar) {
      const key = `${evt.source}->${evt.target}`;
      expectedCallCounts[key] = (expectedCallCounts[key] || 0) + 1;
    }

    const noDuplicateEdges = graph2.edges.length === expectedEdges1.length;
    const callCountsCorrect = graph2.edges.every(
      (e: any) => e.callCount === expectedCallCounts[e.id]
    );

    if (noDuplicateEdges && callCountsCorrect) {
      console.log('  ✓ Step 2 PASSED: Zero duplicate edges created. Call counts accurately aggregated:');
      for (const [edgeKey, count] of Object.entries(expectedCallCounts)) {
        console.log(`    - ${edgeKey}: ${count} calls`);
      }
    } else {
      console.error('  ✗ Step 2 FAILED: Duplicate edges detected or call counts incorrect.');
      allPassed = false;
    }

    const dynamicNewRelationship: ServiceInteraction = {
      source: 'ServiceC',
      target: 'ServiceE',
      latencyMs: 18,
      httpStatus: 200
    };

    console.log(`\n[Step 3] Dynamically introducing new service relationship: ${dynamicNewRelationship.source} -> ${dynamicNewRelationship.target}`);
    await injector.inject(dynamicNewRelationship.source, dynamicNewRelationship.target, {
      latencyMs: dynamicNewRelationship.latencyMs,
      httpStatus: dynamicNewRelationship.httpStatus
    });

    const res3 = await fetch(`http://localhost:${TEST_PORT}/api/graph`);
    const graph3 = (await res3.json()) as any;

    console.log('\n[Step 3 Result] Graph State:');
    console.log('  Nodes:', graph3.nodes.map((n: any) => n.id));
    console.log('  Edges:', graph3.edges.map((e: any) => `${e.id} (callCount: ${e.callCount})`));

    const targetNodeExists = graph3.nodes.some((n: any) => n.id === dynamicNewRelationship.target);
    const newEdgeKey = `${dynamicNewRelationship.source}->${dynamicNewRelationship.target}`;
    const newEdgeExists = graph3.edges.some((e: any) => e.id === newEdgeKey);
    const edgeCountIncremented = graph3.edges.length === graph2.edges.length + 1;

    if (targetNodeExists && newEdgeExists && edgeCountIncremented) {
      console.log(`  ✓ Step 3 PASSED: New node "${dynamicNewRelationship.target}" and edge "${newEdgeKey}" dynamically added.`);
    } else {
      console.error('  ✗ Step 3 FAILED: Dynamic relationship addition failed.');
      allPassed = false;
    }

    // ------------------------------------------------------------------------
    // Scenario Step 4: Verification of Completely Distinct Arbitrary Microservices
    // ------------------------------------------------------------------------
    console.log('\n[Step 4] Ingesting arbitrary, custom-named microservices:');
    const customTopology: ServiceInteraction[] = [
      { source: 'AlphaGateway', target: 'BillingCore', latencyMs: 40, httpStatus: 200 },
      { source: 'BillingCore', target: 'LedgerStore', latencyMs: 12, httpStatus: 200 },
      { source: 'NotificationHub', target: 'BillingCore', latencyMs: 50, httpStatus: 200 }
    ];

    for (const comm of customTopology) {
      console.log(`  -> ${comm.source} -> ${comm.target}`);
      await injector.inject(comm.source, comm.target, {
        latencyMs: comm.latencyMs,
        httpStatus: comm.httpStatus
      });
    }

    const res4 = await fetch(`http://localhost:${TEST_PORT}/api/graph`);
    const graph4 = (await res4.json()) as any;

    const allCustomNodesPresent = customTopology
      .flatMap((c) => [c.source, c.target])
      .every((serviceName) => graph4.nodes.some((n: any) => n.id === serviceName));

    const allCustomEdgesPresent = customTopology.every((c) =>
      graph4.edges.some((e: any) => e.id === `${c.source}->${c.target}`)
    );

    if (allCustomNodesPresent && allCustomEdgesPresent) {
      console.log('  ✓ Step 4 PASSED: Custom microservices and multi-inbound edges successfully added to graph.');
    } else {
      console.error('  ✗ Step 4 FAILED: Custom microservices could not be processed.');
      allPassed = false;
    }

  } catch (err: any) {
    console.error('Test execution error:', err);
    allPassed = false;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('\n========================================================================');
  if (allPassed) {
    console.log('  ALL GENERIC VERIFICATION SCENARIOS PASSED SUCCESSFULLY! ✓');
  } else {
    console.log('  ONE OR MORE VERIFICATION SCENARIOS FAILED! ✗');
    process.exit(1);
  }
  console.log('========================================================================\n');
}

runVerification();
