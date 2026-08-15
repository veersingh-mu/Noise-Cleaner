import { createHash } from 'crypto';

export interface FingerprintInput {
  service: string;
  errorType: string;
  message: string;
  stackTrace?: string | null;
}

/**
 * Normalizes an error message by replacing variable noise (UUIDs, timestamps, emails, numbers, IPs)
 * with static placeholders so identical errors produce identical fingerprints.
 */
export function normalizeMessage(message: string): string {
  if (!message) return '';

  return (
    message
      // 1. ISO Timestamps & Date strings (e.g. 2026-08-15T10:20:30.123Z or 2026-08-15 10:20:30)
      .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?\b/g, '<TIMESTAMP>')
      // 2. UUIDs (standard 8-4-4-4-12 hex format)
      .replace(/\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/g, '<UUID>')
      // 3. Email addresses
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '<EMAIL>')
      // 4. IPv4 Addresses (e.g. 192.168.1.1 or 10.0.0.1)
      .replace(/\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/g, '<IP>')
      // 5. Hex memory / hash identifiers (e.g., 0x7fff5fbff820, 0x1a2b)
      .replace(/0x[0-9a-fA-F]+/g, '<HEX>')
      // 6. Generic numbers / counts / IDs
      .replace(/\b\d+\b/g, '<N>')
      // Trim excessive whitespace
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Normalizes a stack trace by:
 * - Stripping memory addresses (/0x[0-9a-f]+/gi)
 * - Stripping line numbers and column numbers
 * - Retaining only the top 5 stack frames
 * - Stripping absolute paths down to relative module/file names
 */
export function normalizeStackTrace(stackTrace?: string | null): string {
  if (!stackTrace) return '';

  const lines = stackTrace.split('\n');
  const normalizedFrames: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Remove memory addresses
    let frame = trimmed.replace(/0x[0-9a-fA-F]+/gi, '<HEX>');

    // Normalize Windows backslashes
    frame = frame
      .replace(/\\/g, '/')
      // Strip Windows drive letters (e.g., C:)
      .replace(/\b[a-zA-Z]:/g, '')
      // Strip directory prefix down to the last path segment or package path
      .replace(/(?:\/[a-zA-Z0-9._-]+)*\/([a-zA-Z0-9._-]+\.[a-zA-Z0-9]+)/g, '$1')
      // Strip line and column numbers (e.g. :123:45 or :123)
      .replace(/:\d+(?::\d+)?/g, '');

    normalizedFrames.push(frame);

    // Keep only the error header + top 5 stack frames (max 6 lines total)
    if (normalizedFrames.length >= 6) {
      break;
    }
  }

  return normalizedFrames.join('\n');
}

/**
 * Computes a deterministic SHA-256 fingerprint hash for an error event.
 * SHA-256(`${service}:${errorType}:${normalizeMessage(message)}:${normalizeStackTrace(stackTrace)}`)
 */
export function computeFingerprint(input: FingerprintInput): string {
  const normMsg = normalizeMessage(input.message);
  const normStack = normalizeStackTrace(input.stackTrace);
  const rawString = `${input.service}:${input.errorType}:${normMsg}:${normStack}`;

  return createHash('sha256').update(rawString, 'utf8').digest('hex');
}
