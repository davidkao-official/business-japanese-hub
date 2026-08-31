import { describe, expect, it, vi } from 'vitest';
import { createSanitizedLogger } from './log.ts';

describe('sanitized operational logger', () => {
  it('preserves the payments namespace by default and removes sensitive fields', () => {
    const write = vi.fn();
    createSanitizedLogger(write).info(
      { orderId: 'ord-1', authorization: 'Bearer private', accessToken: 'private' },
      'recorded',
    );

    expect(write).toHaveBeenCalledOnce();
    const line = write.mock.calls[0]![0] as string;
    expect(line).toMatch(/^\[payments\] \d{4}-\d{2}-\d{2}T/);
    expect(line).toContain('"orderId":"ord-1"');
    expect(line).not.toContain('private');
  });

  it('supports a bounded product analytics namespace without changing sanitization', () => {
    const write = vi.fn();
    createSanitizedLogger(write, 'product-analytics').info(
      { eventId: 'event-1', sessionToken: 'private' },
      'accepted',
    );

    const line = write.mock.calls[0]![0] as string;
    expect(line).toMatch(/^\[product-analytics\] \d{4}-\d{2}-\d{2}T/);
    expect(line).toContain('"eventId":"event-1"');
    expect(line).not.toContain('private');
  });
});
