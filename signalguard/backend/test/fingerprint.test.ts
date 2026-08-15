import { describe, it, expect } from 'vitest';
import { normalizeMessage, normalizeStackTrace, computeFingerprint } from '../src/lib/fingerprint.js';

describe('Fingerprinting Engine', () => {
  describe('normalizeMessage', () => {
    it('should template dynamic integers to <N>', () => {
      const msg1 = 'Failed to process order 10482 for user 9923';
      const msg2 = 'Failed to process order 88471 for user 1102';
      expect(normalizeMessage(msg1)).toBe('Failed to process order <N> for user <N>');
      expect(normalizeMessage(msg1)).toBe(normalizeMessage(msg2));
    });

    it('should template UUIDs to <UUID>', () => {
      const msg1 = 'Session e7b39a48-84dc-4d1a-9f5b-1c5c4e3690d2 expired';
      const msg2 = 'Session 12345678-1234-1234-1234-123456789abc expired';
      expect(normalizeMessage(msg1)).toBe('Session <UUID> expired');
      expect(normalizeMessage(msg1)).toBe(normalizeMessage(msg2));
    });

    it('should template emails to <EMAIL>', () => {
      const msg1 = 'Could not send receipt to alice.smith@domain.com';
      const msg2 = 'Could not send receipt to bob-dev_12@sub.domain.co.uk';
      expect(normalizeMessage(msg1)).toBe('Could not send receipt to <EMAIL>');
      expect(normalizeMessage(msg1)).toBe(normalizeMessage(msg2));
    });

    it('should template IPv4 addresses to <IP>', () => {
      const msg1 = 'Connection timeout connecting to 192.168.1.105 on port 5432';
      const msg2 = 'Connection timeout connecting to 10.0.4.12 on port 5432';
      expect(normalizeMessage(msg1)).toBe('Connection timeout connecting to <IP> on port <N>');
      expect(normalizeMessage(msg1)).toBe(normalizeMessage(msg2));
    });

    it('should template ISO timestamps to <TIMESTAMP>', () => {
      const msg1 = 'Heartbeat missed at 2026-08-15T09:30:15.123Z from instance worker-1';
      const msg2 = 'Heartbeat missed at 2026-08-15T14:45:00Z from instance worker-1';
      expect(normalizeMessage(msg1)).toBe('Heartbeat missed at <TIMESTAMP> from instance worker-<N>');
      expect(normalizeMessage(msg1)).toBe(normalizeMessage(msg2));
    });
  });

  describe('normalizeStackTrace', () => {
    it('should strip memory addresses, line numbers, and keep top 5 frames', () => {
      const rawTrace = `Error: Connection lost
    at DatabasePool.getConnection (/app/src/db/pool.ts:145:12) [0x7ffeefbff450]
    at QueryRunner.execute (/app/src/db/runner.ts:89:18) [0x7ffeefbff470]
    at AuthService.validateSession (/app/src/services/auth.ts:210:9)
    at AuthController.handleLogin (/app/src/controllers/auth.ts:45:15)
    at FastifyHandler.dispatch (/app/node_modules/fastify/lib/handler.js:102:4)
    at ProcessTicksAndRejections (node:internal/process/task_queues:95:5)
    at Module.runMain (node:internal/modules/run_main:83:12)`;

      const normalized = normalizeStackTrace(rawTrace);
      const lines = normalized.split('\n');

      expect(lines.length).toBeLessThanOrEqual(5);
      expect(normalized).not.toContain('0x7ffeefbff450');
      expect(normalized).not.toContain(':145:12');
      expect(normalized).not.toContain(':89:18');
    });

    it('should produce identical normalized trace regardless of changing line numbers', () => {
      const traceA = `Error: DB Timeout
    at Pool.acquire (/src/db/pool.ts:142:10)
    at Service.run (/src/service.ts:50:8)`;

      const traceB = `Error: DB Timeout
    at Pool.acquire (/src/db/pool.ts:199:25)
    at Service.run (/src/service.ts:88:14)`;

      expect(normalizeStackTrace(traceA)).toBe(normalizeStackTrace(traceB));
    });
  });

  describe('computeFingerprint', () => {
    it('should generate same fingerprint for same error across different users and instances', () => {
      const fp1 = computeFingerprint({
        service: 'checkout-service',
        errorType: 'PaymentGatewayTimeout',
        message: 'Transaction 98402 timed out for user a3f8872b-8419-4509-8438-e6f96cb43e12',
        stackTrace: `Error: Timeout\n    at PaymentGateway.charge (/src/gateway.ts:88:12)\n    at CheckoutController.pay (/src/controller.ts:45:9)`
      });

      const fp2 = computeFingerprint({
        service: 'checkout-service',
        errorType: 'PaymentGatewayTimeout',
        message: 'Transaction 11203 timed out for user 78bc41a9-0012-4cf1-9876-09ab12cd34ef',
        stackTrace: `Error: Timeout\n    at PaymentGateway.charge (/src/gateway.ts:104:18)\n    at CheckoutController.pay (/src/controller.ts:52:14)`
      });

      expect(fp1).toBe(fp2);
      expect(typeof fp1).toBe('string');
      expect(fp1).toHaveLength(64); // SHA-256 hex string length
    });

    it('should generate DIFFERENT fingerprints for different services with identical messages', () => {
      const fp1 = computeFingerprint({
        service: 'checkout-service',
        errorType: 'DatabaseConnectionLost',
        message: 'Lost connection to Postgres DB at 10.0.0.5',
        stackTrace: 'Error: Connection lost\n    at Client.connect (/src/db.ts:20:5)'
      });

      const fp2 = computeFingerprint({
        service: 'auth-service',
        errorType: 'DatabaseConnectionLost',
        message: 'Lost connection to Postgres DB at 10.0.0.5',
        stackTrace: 'Error: Connection lost\n    at Client.connect (/src/db.ts:20:5)'
      });

      expect(fp1).not.toBe(fp2);
    });

    it('should generate DIFFERENT fingerprints for different error types', () => {
      const fp1 = computeFingerprint({
        service: 'payments-service',
        errorType: 'NullPointerException',
        message: 'Null reference on customer object',
        stackTrace: 'Error\n    at Object.run (/src/index.ts:10:2)'
      });

      const fp2 = computeFingerprint({
        service: 'payments-service',
        errorType: 'InvalidParameterException',
        message: 'Null reference on customer object',
        stackTrace: 'Error\n    at Object.run (/src/index.ts:10:2)'
      });

      expect(fp1).not.toBe(fp2);
    });
  });
});
