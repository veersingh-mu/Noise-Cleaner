import { createHash } from 'crypto';

export interface FingerprintInput {
  service: string;
  errorType: string;
  message: string;
  stackTrace?: string | null;
}

/**
 * Templates dynamic tokens out of error messages so that identical
 * errors with varying runtime parameters produce the same normalized string.
 */
export function normalizeMessage(message: string): string {
  if (!message) return '';

  return message
    // Replace ISO-8601 timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, '<TIMESTAMP>')
    // Replace UUIDs (before numbers)
    .replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, '<UUID>')
    // Replace Hex memory / IDs (e.g., 0x7ffd23, 0x0)
    .replace(/0x[0-9a-fA-F]+/gi, '<HEX>')
    // Replace Email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '<EMAIL>')
    // Replace IPv4 addresses
    .replace(/\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g, '<IP>')
    // Replace all remaining integer digits (\d+) with <N>
    .replace(/\d+/g, '<N>')
    // Normalize repeated whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a stack trace by stripping memory addresses, variable line numbers,
 * trimming to the top 5 relevant execution frames, and stripping absolute path prefixes.
 */
export function normalizeStackTrace(stackTrace?: string | null): string {
  if (!stackTrace) return '';

  const lines = stackTrace.split('\n');
  const normalizedFrames: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // We focus on stack frame lines (typically beginning with 'at ') or the root error line
    let cleaned = trimmed
      // Strip memory addresses (e.g. 0x00007fffa12b)
      .replace(/0x[0-9a-fA-F]+/gi, '<HEX>')
      // Replace Windows backslashes with forward slashes for cross-platform consistency
      .replace(/\\/g, '/')
      // Strip common absolute directory prefixes down to relative project/package paths
      .replace(/(?:\/[a-zA-Z0-9_.-]+)+(?:\/(?:src|lib|dist|node_modules|app|packages)\/)/g, '$1/')
      .replace(/[A-Z]:\/(?:[a-zA-Z0-9_.-]+)+(?:src|lib|dist|node_modules|app)\//gi, '')
      // Strip line and column numbers (e.g. :124:15 or :89)
      .replace(/:\d+(?::\d+)?\)?/g, ')')
      .replace(/\s+/g, ' ');

    // Normalize empty paren artifacts
    cleaned = cleaned.replace(/\(\)/g, '').trim();

    normalizedFrames.push(cleaned);

    // Keep top 5 frames at most
    if (normalizedFrames.length >= 5) {
      break;
    }
  }

  return normalizedFrames.join('\n');
}

/**
 * Computes a deterministic SHA-256 fingerprint for grouping errors into incidents.
 */
export function computeFingerprint(input: FingerprintInput): string {
  const service = (input.service || 'unknown').trim().toLowerCase();
  const errorType = (input.errorType || 'Error').trim();
  const templatedMessage = normalizeMessage(input.message || '');
  const normalizedTrace = normalizeStackTrace(input.stackTrace);

  const payload = `${service}:${errorType}:${templatedMessage}:${normalizedTrace}`;

  return createHash('sha256').update(payload, 'utf8').digest('hex');
}
