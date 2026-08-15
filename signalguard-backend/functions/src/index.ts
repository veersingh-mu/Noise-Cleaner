/**
 * SignalGuard Cloud Functions - 2nd Gen Entrypoint
 */

// HTTP Endpoints
export { ingestEvent } from './http/ingestEvent';
export { simulateTraffic } from './http/simulateTraffic';

// Pub/Sub Queue Processor
export { processRawEvent } from './pubsub/processRawEvent';

// Cloud Tasks Batch Worker
export { flushIncidentThread } from './tasks/flushIncidentThread';

// Scheduled Rollups & Maintenance
export { rollupMetricsSnapshot } from './scheduled/rollupMetricsSnapshot';
export { autoResolveStaleIncidents } from './scheduled/autoResolveStaleIncidents';

// Callable Configuration Handlers (Auth Gated)
export { updateCooldownMatrix } from './callable/updateCooldownMatrix';
export { updateChannelRouting } from './callable/updateChannelRouting';
