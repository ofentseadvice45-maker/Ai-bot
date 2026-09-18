import type { AppState, ScannerSetup, Trade, TradeSide } from './types.js';
import { audit, openTrades } from './state.js';

export function validateRiskPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.1 || value > 1) {
    throw new Error('Risk must be between 0.10% and 1.00%');
  }
  return value;
}

export function positionSize(accountEquity: number, riskPercent: number, entry: number, stopLoss: number, tickSize = 1, tickValue = 1): number {
  validateRiskPercent(riskPercent);
  if (![accountEquity, entry, stopLoss, tickSize, tickValue].every((n) => Number.isFinite(n) && n > 0)) {
    throw new Error('Invalid position sizing inputs');
  }
  const distance = Math.abs(entry - stopLoss);
  if (distance === 0) throw new Error('Stop-loss must differ from entry');
  return (accountEquity * riskPercent / 100) / ((distance / tickSize) * tickValue);
}

export function assertTradeAllowed(state: AppState, setup: ScannerSetup): void {
  if (state.emergency || state.botStatus !== 'RUNNING') throw new Error('Bot is not running');
  if (setup.status !== 'VALID_SETUP' || setup.confidence < 75) throw new Error('Setup does not meet the 75/100 confidence gate');
  if (openTrades(state).length >= state.risk.maxOpenTrades) throw new Error('Maximum open trades reached');
  if (![setup.entry, setup.stopLoss, setup.takeProfit1, setup.takeProfit2].every((n) => Number.isFinite(n) && n > 0)) {
    throw new Error('Invalid setup prices');
  }
  if (setup.direction === 'NEUTRAL' || setup.entry === setup.stopLoss) throw new Error('Invalid trade direction or stop-loss');
}

export function openPaperTrade(state: AppState, setup: ScannerSetup, equity = 10000): Trade {
  assertTradeAllowed(state, setup);
  const side: TradeSide = setup.direction === 'LONG' ? 'BUY' : 'SELL';
  const initialRisk = Math.abs(setup.entry - setup.stopLoss);
  const quantity = positionSize(equity, state.risk.riskPercent, setup.entry, setup.stopLoss);
  const trade: Trade = {
    id: crypto.randomUUID(),
    symbol: setup.symbol,
    side,
    entry: setup.entry,
    stopLoss: setup.stopLoss,
    initialRisk,
    takeProfit1: setup.takeProfit1,
    takeProfit2: setup.takeProfit2,
    rr: setup.rr,
    quantity,
    riskPercent: state.risk.riskPercent,
    status: 'INITIAL',
    partialLotClosed: 0,
    trailingStop: null,
    breakEvenTriggered: false,
    currentPrice: setup.entry,
    pnl: 0,
    createdAt: new Date().toISOString()
  };
  state.trades.unshift(trade);
  audit(state, 'PAPER_TRADE_OPENED', `${side} ${setup.symbol} opened in paper mode`);
  return trade;
}

export function managePaperTrade(state: AppState, tradeId: string, price: number): Trade {
  const trade = state.trades.find((item) => item.id === tradeId);
  if (!trade || trade.status === 'CLOSED') throw new Error('Trade not found or already closed');

  const risk = trade.initialRisk;
  const move = trade.side === 'BUY' ? price - trade.entry : trade.entry - price;
  trade.currentPrice = price;
  trade.pnl = move * trade.quantity;

  if (move <= -risk) return closeTrade(state, trade, 'Stop-loss');

  if (move >= risk && !trade.breakEvenTriggered) {
    trade.breakEvenTriggered = true;
    trade.status = 'BREAKEVEN';
    trade.stopLoss = trade.entry;
    audit(state, 'BE', `${trade.symbol} moved to break-even`);
  }

  if (move >= risk * 2 && trade.partialLotClosed === 0) {
    trade.partialLotClosed = trade.quantity * 0.5;
    trade.status = 'PARTIAL';
    audit(state, 'PARTIAL', `${trade.symbol} 50% partial taken`);
  }

  if (trade.breakEvenTriggered && move > risk * 2) {
    const nextStop = trade.side === 'BUY' ? price - risk : price + risk;
    if (trade.trailingStop === null || (trade.side === 'BUY' ? nextStop > trade.trailingStop : nextStop < trade.trailingStop)) {
      trade.trailingStop = nextStop;
      trade.stopLoss = nextStop;
      trade.status = 'TRAILING';
      audit(state, 'TRAILING', `${trade.symbol} trailing stop updated`);
    }
  }

  if (move >= risk * 3) return closeTrade(state, trade, 'Take-profit');
  return trade;
}

function closeTrade(state: AppState, trade: Trade, reason: string): Trade {
  trade.status = 'CLOSED';
  trade.closedAt = new Date().toISOString();
  state.realizedPnl += trade.pnl;
  audit(state, 'TRADE_CLOSED', `${trade.symbol} closed: ${reason}`);
  return trade;
}

export function closeAll(state: AppState): void {
  for (const trade of openTrades(state)) closeTrade(state, trade, 'Manual close all');
}
