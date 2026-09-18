import { describe, expect, it } from 'vitest';
import { validateRiskPercent, positionSize } from '../src/risk.js';
import { confidenceGate, score } from '../src/scanner.js';

describe('risk engine', () => { it('accepts 0.1, 0.5, and 1', () => [0.1, 0.5, 1].forEach((value) => expect(validateRiskPercent(value)).toBe(value))); it('rejects above one percent', () => expect(() => validateRiskPercent(1.01)).toThrow()); it('rejects invalid stop distance', () => expect(() => positionSize(10000, 0.5, 100, 100)).toThrow()); it('calculates size from equity and distance', () => expect(positionSize(10000, 0.5, 110, 100)).toBeCloseTo(5)); });

describe('confidence gate', () => { const base = { h4Bias: 'BULLISH' as const, h1Structure: true, bos: true, supplyDemand: true, liquidity: true, momentum: true, rr: 2 }; it('rejects confidence 74', () => expect(confidenceGate(74)).toBe(false)); it('accepts confidence 75', () => expect(confidenceGate(75)).toBe(true)); it('accepts confidence 80', () => expect(confidenceGate(80)).toBe(true)); it('scores a complete setup at 100', () => expect(score(base)).toBe(100)); });
