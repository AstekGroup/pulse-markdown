import { describe, expect, it } from 'vitest';

describe('sanity', () => {
  it('valide la chaîne de test (vitest + jsdom)', () => {
    expect(typeof document).toBe('object');
    expect(1 + 1).toBe(2);
  });
});
