import { randomUUID } from 'node:crypto';
import type { AppState, AuditEvent, RiskSettings, Trade } from './types.js';

export const DEFAULT_RISK: RiskSettings = { riskPercent: 0.5, maxOpenTrades: 2 };
export function initialState(): AppState {
  return { executionMode: 'PAPER_ONLY', botStatus: 'PAUSED', emergency: false, risk: DEFAULT_RISK, scanner: { status: 'WATCHING', confidence: 0 }, markets: { XAUUSD: market('XAUUSD', 2650), BTCUSD: market('BTCUSD', 105000) }, trades: [], realizedPnl: 0, audit: [], mt5: { lastHeartbeat: null, symbols: {} } };
}
function market(symbol: string, price: number) { return { symbol, price, source: 'PAPER' as const, bias: 'NEUTRAL' as const, structure: 'Awaiting scan', scannerStatus: 'WATCHING' as const, confidence: 0 }; }
export function audit(state: AppState, type: string, message: string): void { const event: AuditEvent = { id: randomUUID(), type, message, createdAt: new Date().toISOString() }; state.audit.unshift(event); state.audit = state.audit.slice(0, 100); }
export function openTrades(state: AppState): Trade[] { return state.trades.filter((trade) => trade.status !== 'CLOSED'); }
