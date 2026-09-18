export type ExecutionMode = 'PAPER_ONLY';
export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'INITIAL' | 'BREAKEVEN' | 'PARTIAL' | 'TRAILING' | 'CLOSED';
export type ScannerStatus = 'VALID_SETUP' | 'WATCHING' | 'NO_SETUP' | 'UNCLEAR';
export type BotStatus = 'PAUSED' | 'RUNNING' | 'EMERGENCY_STOPPED';

export interface RiskSettings { riskPercent: number; maxOpenTrades: number; }
export interface Trade { id: string; symbol: string; side: TradeSide; entry: number; stopLoss: number; takeProfit1: number; takeProfit2: number; rr: number; quantity: number; riskPercent: number; status: TradeStatus; partialLotClosed: number; trailingStop: number | null; breakEvenTriggered: boolean; currentPrice: number; pnl: number; createdAt: string; closedAt?: string; }
export interface MarketSnapshot { symbol: string; price: number; source: 'MT5' | 'PAPER'; bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; structure: string; scannerStatus: ScannerStatus; confidence: number; }
export interface ScannerSetup { symbol: string; direction: 'LONG' | 'SHORT' | 'NEUTRAL'; entry: number; stopLoss: number; takeProfit1: number; takeProfit2: number; rr: number; confidence: number; bias: string; bos: boolean; liquidity: boolean; supplyDemand: boolean; confirmation: boolean; reasons: string[]; invalidation: string; status: ScannerStatus; }
export interface AuditEvent { id: string; type: string; message: string; createdAt: string; }
export interface AppState { executionMode: ExecutionMode; botStatus: BotStatus; emergency: boolean; risk: RiskSettings; scanner: { status: ScannerStatus; confidence: number; activeSetup?: ScannerSetup }; markets: Record<string, MarketSnapshot>; trades: Trade[]; realizedPnl: number; audit: AuditEvent[]; mt5: { lastHeartbeat: string | null; terminal?: string; accountLabel?: string; symbols: Record<string, { price: number; updatedAt: string }> }; }
export interface Mt5StatusResponse { status: 'connected' | 'disconnected'; heartbeat: string | null; executionMode: ExecutionMode; demoMode: true; account: { type: 'demo'; broker: 'paper-demo'; label?: string }; symbols: string[]; prices: Record<string, number>; }
