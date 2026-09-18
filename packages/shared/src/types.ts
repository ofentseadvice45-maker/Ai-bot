export type ExecutionMode = 'PAPER_ONLY';
export type TradeSide = 'BUY' | 'SELL';
export type TradeStatus = 'OPEN' | 'PARTIALLY_CLOSED' | 'CLOSED';
export type ScannerStatus = 'VALID_SETUP' | 'WATCHING' | 'NO_SETUP' | 'UNCLEAR';

export interface RiskSettings {
  riskPercent: number;
  maxOpenTrades: number;
  allowPartialClose: boolean;
  noMartingale: boolean;
  noAveragingDown: boolean;
  noIncreasingLotAfterLoss: boolean;
  neverWidenStopLoss: boolean;
  neverRemoveStopLoss: boolean;
  breakEvenAtOneR: boolean;
  partialCloseAtTwoR: boolean;
  trailingRemainingPosition: boolean;
}

export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  rr: number;
  quantity: number;
  riskPercent: number;
  status: TradeStatus;
  partialLotClosed: number;
  trailingStop: number | null;
  breakEvenTriggered: boolean;
  createdAt: string;
}

export interface ChartAnalysisRequest {
  symbol?: string;
  timeframe?: string;
  imageBase64?: string;
  imageName?: string;
  direction?: 'LONG' | 'SHORT' | 'NEUTRAL';
  bias?: string;
  bos?: boolean;
  supplyDemand?: boolean;
  liquidity?: boolean;
  confirmation?: boolean;
  confidence?: number;
  entryZone?: number;
  stopLoss?: number;
  takeProfit1?: number;
  takeProfit2?: number;
  rr?: number;
  reasons?: string[];
  invalidation?: string;
}

export interface ChartAnalysisResult extends ChartAnalysisRequest {
  status: ScannerStatus;
  valid: boolean;
  scannedAt: string;
}

export interface DashboardSummary {
  executionMode: ExecutionMode;
  status: string;
  scanner: {
    status: ScannerStatus;
    confidence: number;
  };
  market: {
    XAUUSD: number;
    BTCUSD: number;
  };
  risk: RiskSettings;
  trades: Trade[];
  portfolio: {
    pnl: number;
    openTrades: number;
  };
}

export interface Mt5StatusResponse {
  status: 'connected' | 'disconnected';
  heartbeat: string;
  executionMode: ExecutionMode;
  demoMode: boolean;
  account: {
    type: 'demo';
    broker: 'paper-demo';
  };
  symbols: string[];
}
