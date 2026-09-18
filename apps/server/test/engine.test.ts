import { describe, expect, it } from 'vitest';
import { validateRiskPercent, positionSize } from '../src/risk.js';
import { score } from '../src/scanner.js';
describe('risk engine', () => { it('accepts 0.1, 0.5, and 1', () => [0.1, 0.5, 1].forEach((value) => expect(validateRiskPercent(value)).toBe(value))); it('rejects above one percent', () => expect(() => validateRiskPercent(1.01)).toThrow()); it('rejects invalid stop distance', () => expect(() => positionSize(10000, 0.5, 100, 100)).toThrow()); it('calculates size from equity and distance', () => expect(positionSize(10000, 0.5, 110, 100)).toBeCloseTo(5)); });
describe('confidence gate', () => { const base = { h4Bias: 'BULLISH' as const, h1Structure: true, bos: true, supplyDemand: true, liquidity: true, momentum: true, rr: 2 }; it('rejects 74', () => expect(score({ ...base, rr: 1 })).toBe(90)); it('accepts 75 and 80+', () => { expect(score({ ...base, momentum: false, rr: 1 })).toBe(80); expect(score(base)).toBe(100); }); });
