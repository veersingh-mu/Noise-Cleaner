import { describe, it, expect } from 'vitest';
import {
  computeFingerprint,
  normalizeMessage,
  normalizeStackTrace,
} from '../src/lib/fingerprint';

describe('Fingerprint Engine', () => {
  describe('normalizeMessage', () => {
    it('normalizes UUIDs into <UUID>', () => {
      const msg1 = 'Failed to load user 12345678-1234-1234-1234-123456789abc from db';
      const msg2 = 'Failed to load user 98765432-4321-4321-4321-cba987654321 from db';
      expect(normalizeMessage(msg1)).toBe('Failed to load user <UUID> from db');
      expect(normalizeMessage(msg2)).toBe('Failed to load user <UUID> from db');
    });

    it('normalizes numeric IDs and quantities into <N>', () => {
      const msg1 = 'Order #10492 failed: inventory 0 for sku 99201';
      const msg2 = 'Order #88319 failed: inventory 0 for sku 55102';
      expect(normalizeMessage(msg1)).toBe('Order #<N> failed: inventory <N> for sku <N>');
      expect(normalizeMessage(msg2)).toBe('Order #<N> failed: inventory <N> for sku <N>');
    });

    it('normalizes email addresses into <EMAIL>', () => {
      const msg1 = 'Email delivery failed to alice.smith@company.org';
      const msg2 = 'Email delivery failed to bob.jones@other.io';
      expect(normalizeMessage(msg1)).toBe('Email delivery failed to <EMAIL>');
      expect(normalizeMessage(msg2)).toBe('Email delivery failed to <EMAIL>');
    });

    it('normalizes IPv4 addresses into <IP>', () => {
      const msg1 = 'Connection reset by peer 192.168.1.45:8080';
      const msg2 = 'Connection reset by peer 10.0.4.12:8080';
      expect(normalizeMessage(msg1)).toBe('Connection reset by peer <IP>:<N>');
      expect(normalizeMessage(msg2)).toBe('Connection reset by peer <IP>:<N>');
    });

    it('normalizes ISO timestamps into <TIMESTAMP>', () => {
      const msg1 = 'Error at 2026-08-15T14:30:00.000Z during sync';
      const msg2 = 'Error at 2026-08-15T18:45:12.123Z during sync';
      expect(normalizeMessage(msg1)).toBe('Error at <TIMESTAMP> during sync');
      expect(normalizeMessage(msg2)).toBe('Error at <TIMESTAMP> during sync');
    });
  });

  describe('normalizeStackTrace', () => {
    it('strips line numbers, columns, and absolute directory paths', () => {
      const trace1 = `Error: Connection timeout
    at Client.query (/var/task/app/src/db/client.ts:45:12)
    at UserRepository.findById (/var/task/app/src/repos/user.ts:102:8)`;

      const trace2 = `Error: Connection timeout
    at Client.query (C:\\Users\\Runner\\workspace\\src\\db\\client.ts:89:1)
    at UserRepository.findById (C:\\Users\\Runner\\workspace\\src\\repos\\user.ts:140:15)`;

      expect(normalizeStackTrace(trace1)).toBe(normalizeStackTrace(trace2));
    });

    it('strips memory hex addresses', () => {
      const trace1 = 'Error: Segmentation fault at 0x7fff5fbff820 in worker.node';
      const trace2 = 'Error: Segmentation fault at 0x1a2b3c4d5e6f in worker.node';
      expect(normalizeStackTrace(trace1)).toBe('Error: Segmentation fault at <HEX> in worker.node');
      expect(normalizeStackTrace(trace2)).toBe('Error: Segmentation fault at <HEX> in worker.node');
    });

    it('prunes noise frames beyond top 5 application frames', () => {
      const shortTrace = `Error: DB Crash
    at frame1 (file1.ts:10)
    at frame2 (file2.ts:20)
    at frame3 (file3.ts:30)
    at frame4 (file4.ts:40)
    at frame5 (file5.ts:50)`;

      const deepTrace = `${shortTrace}
    at deepFrame6 (file6.ts:60)
    at deepFrame7 (file7.ts:70)
    at deepFrame8 (file8.ts:80)`;

      expect(normalizeStackTrace(shortTrace)).toBe(normalizeStackTrace(deepTrace));
    });
  });

  describe('computeFingerprint', () => {
    it('produces identical 64-character SHA-256 hash for identical root causes with variable IDs', () => {
      const event1 = {
        service: 'checkout-service',
        errorType: 'PaymentGatewayTimeout',
        message: 'HTTP 504 Gateway Timeout for order 10041 and user 11111111-2222-3333-4444-555555555555',
        stackTrace: 'Error: Timeout\n at Client.pay (/app/src/pay.ts:12:3)',
      };

      const event2 = {
        service: 'checkout-service',
        errorType: 'PaymentGatewayTimeout',
        message: 'HTTP 504 Gateway Timeout for order 99201 and user 99999999-8888-7777-6666-555555555555',
        stackTrace: 'Error: Timeout\n at Client.pay (/var/task/src/pay.ts:89:14)',
      };

      const hash1 = computeFingerprint(event1);
      const hash2 = computeFingerprint(event2);

      expect(hash1).toHaveLength(64);
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different services', () => {
      const hashCheckout = computeFingerprint({
        service: 'checkout-service',
        errorType: 'DatabaseConnectionLost',
        message: 'Lost connection to postgres pool',
      });

      const hashAuth = computeFingerprint({
        service: 'auth-service',
        errorType: 'DatabaseConnectionLost',
        message: 'Lost connection to postgres pool',
      });

      expect(hashCheckout).not.toBe(hashAuth);
    });

    it('produces different hash for different error types', () => {
      const hash1 = computeFingerprint({
        service: 'payments-service',
        errorType: 'StripeTimeout',
        message: 'Timeout connecting to payment gateway',
      });

      const hash2 = computeFingerprint({
        service: 'payments-service',
        errorType: 'StripeCardDeclined',
        message: 'Timeout connecting to payment gateway',
      });

      expect(hash1).not.toBe(hash2);
    });
  });
});
