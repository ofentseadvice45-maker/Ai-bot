import { managePaperTrade } from './risk.js';
import { audit } from './state.js';
import type { AppState } from './types.js';
export function updatePaperMarket(state: AppState, symbol: string, price: number, timestamp: string): void { if (!state.markets[symbol]) throw new Error('Unsupported market symbol'); if (!Number.isFinite(price) || price <= 0) throw new Error('Price must be positive'); if (Number.isNaN(Date.parse(timestamp))) throw new Error('Invalid timestamp'); state.markets[symbol].price = price; state.markets[symbol].source = 'PAPER'; for (const trade of state.trades.filter((item) => item.symbol === symbol && item.status !== 'CLOSED')) managePaperTrade(state, trade.id, price); audit(state, 'MARKET_UPDATED', `${symbol} paper price updated`); }
