import React, { useEffect, useRef, useState } from 'react';
import type { AppState, ScannerSetup } from '../../../packages/shared/src/types';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
const api = async (url: string, options?: RequestInit) => {
  const response = await fetch(`${API_BASE}${url}`, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (!response.ok) throw new Error('API unavailable');
  return response.json();
};

const demoState: AppState = {
  executionMode: 'PAPER_ONLY', botStatus: 'PAUSED', emergency: false,
  risk: { riskPercent: 0.5, maxOpenTrades: 2 }, scanner: { status: 'WATCHING', confidence: 0 },
  markets: {
    XAUUSD: { symbol: 'XAUUSD', price: 0, source: 'PAPER', bias: 'NEUTRAL', structure: 'Waiting for MT5', scannerStatus: 'UNCLEAR', confidence: 0 },
    BTCUSD: { symbol: 'BTCUSD', price: 0, source: 'PAPER', bias: 'NEUTRAL', structure: 'Waiting for MT5', scannerStatus: 'UNCLEAR', confidence: 0 }
  },
  trades: [], realizedPnl: 0,
  audit: [{ id: 'demo', type: 'SYSTEM', message: 'Frontend preview — connect the Manyama backend for live scanner state.', createdAt: new Date().toISOString() }],
  mt5: { lastHeartbeat: null, terminal: 'Not connected', accountLabel: 'MT5 DEMO', symbols: {} }
};

type ScanState = { fileName: string; preview: string; symbol: 'XAUUSD' | 'BTCUSD'; timeframe: 'M5' | 'M15' | 'H1' | 'H4'; status: string; reasons: string[]; invalidation?: string; direction?: string; h4Bias?: string; entry?: number; stopLoss?: number; takeProfit1?: number; takeProfit2?: number; rr?: number; confidence?: number; checks?: { name: string; passed: boolean; detail: string }[] };

export default function App() {
  const [state, setState] = useState<AppState>(demoState);
  const [online, setOnline] = useState(false);
  const [message, setMessage] = useState('GitHub preview mode');
  const [scan, setScan] = useState<ScanState | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanSymbol, setScanSymbol] = useState<'XAUUSD' | 'BTCUSD'>('XAUUSD');
  const [scanTf, setScanTf] = useState<'M5' | 'M15' | 'H1' | 'H4'>('M15');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    try {
      const next = await api('/api/state') as AppState;
      setState(next); setOnline(true); setMessage('Backend connected');
    } catch { setOnline(false); }
  };

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const command = async (name: string) => {
    try {
      await api('/api/command', { method: 'POST', body: JSON.stringify({ command: name }) });
      setMessage(`Command sent: ${name}`); refresh();
    } catch {
      setMessage(`Preview: ${name} armed locally`);
      if (name === 'START') setState((s) => ({ ...s, botStatus: 'RUNNING' }));
      if (name === 'PAUSE') setState((s) => ({ ...s, botStatus: 'PAUSED' }));
      if (name === 'EMERGENCY_STOP') setState((s) => ({ ...s, botStatus: 'EMERGENCY_STOPPED', emergency: true }));
    }
  };

  const analyze = async (file: File) => {
    setScanning(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const preview = String(reader.result);
      setScan({ fileName: file.name, preview, symbol: scanSymbol, timeframe: scanTf, status: 'ANALYZING', reasons: [] });
      try {
        const result = await api('/api/chart/analyze', {
          method: 'POST',
          body: JSON.stringify({ imageBase64: preview, imageName: file.name, symbol: scanSymbol, timeframe: scanTf })
        });
        setScan({ fileName: file.name, preview, symbol: scanSymbol, timeframe: scanTf, status: result.status, reasons: result.reasons ?? [], invalidation: result.invalidation, direction: result.direction, h4Bias: result.h4Bias, entry: result.entry, stopLoss: result.stopLoss, takeProfit1: result.takeProfit1, takeProfit2: result.takeProfit2, rr: result.rr, confidence: result.confidence, checks: result.checks ?? [] });
        setMessage(`Chart scan complete · ${result.status}`);
      } catch {
        setScan({ fileName: file.name, preview, symbol: scanSymbol, timeframe: scanTf, status: 'PREVIEW ONLY', reasons: ['Chart image loaded successfully.', 'Backend connected, but the vision provider must be configured.', 'No trade is created from screenshot analysis.'] });
        setMessage('Chart loaded in preview mode');
      } finally { setScanning(false); }
    };
    reader.readAsDataURL(file);
  };

  const setup = state.scanner.activeSetup as ScannerSetup | undefined;
  const openTrades = state.trades.filter((t) => t.status !== 'CLOSED').length;
  const mt5Fresh = Boolean(state.mt5.lastHeartbeat);

  return (
    <main className="app-shell">
      <div className="grid-noise" /><div className="orb orb-one" /><div className="orb orb-two" />
      <header className="topbar">
        <div className="brand"><span className="brand-mark">M</span><div><span className="eyebrow">AUTONOMOUS MARKET INTELLIGENCE</span><h1>MANYAMA <b>SCANNER</b></h1></div></div>
        <div className="status-stack"><span className={online ? 'status online' : 'status'}><i />{online ? 'CORE ONLINE' : 'PREVIEW MODE'}</span><span className="mode">PAPER ONLY</span></div>
      </header>

      <section className="hero glass">
        <div className="bot-core"><div className="bot-eye left" /><div className="bot-eye right" /><div className="bot-mouth">⌁</div><span className="bot-ring" /></div>
        <div className="hero-copy"><span className="eyebrow">MANYAMA AI CORE</span><h2>See the setup.<br /><em>Respect the confirmation.</em></h2><p>Supply & demand · BOS · liquidity · momentum · risk gate</p><div className="hero-tags"><span>75% GATE</span><span>MAX 2 TRADES</span><span>RR 1:2–1:3</span></div></div>
        <div className="core-readout"><small>ENGINE</small><strong>{state.botStatus.replace('_', ' ')}</strong><span>{message}</span></div>
      </section>

      <section className="market-grid">
        {Object.values(state.markets).map((market) => (
          <article className="glass market" key={market.symbol}>
            <div className="card-top"><div><span className="ticker-dot" />{market.symbol}</div><span className="pill">{market.source === 'MT5' ? 'MT5 PRICE' : 'WAITING MT5'}</span></div>
            <strong className="price">{market.price > 0 ? market.price.toLocaleString() : '— —'}</strong>
            <div className="market-meta"><span>{market.bias}</span><span>{market.structure}</span></div>
            <div className="meter"><i style={{ width: `${market.confidence}%` }} /></div>
            <div className="confidence"><span>SETUP CONFIDENCE</span><b>{market.confidence}%</b></div>
          </article>
        ))}
      </section>

      <section className="control-row">
        <div className="glass controls"><span className="eyebrow">COMMAND CENTER</span><div className="button-grid"><button className="primary" onClick={() => command('START')}>START SCANNER</button><button onClick={() => command('PAUSE')}>PAUSE</button><button onClick={() => command('CLOSE_ALL')}>CLOSE ALL</button><button className="danger" onClick={() => command('EMERGENCY_STOP')}>KILL SWITCH</button></div></div>
        <div className="glass mt5-card"><div><span className="eyebrow">MT5 BRIDGE</span><h3>{mt5Fresh ? 'CONNECTED' : 'NOT CONNECTED'}</h3><p>{state.mt5.terminal ?? 'Windows VPS terminal required'}</p></div><span className={mt5Fresh ? 'bridge-dot good' : 'bridge-dot'} /></div>
      </section>

      <section className="stats"><div className="glass stat"><small>RISK</small><b>{state.risk.riskPercent.toFixed(2)}%</b><span>per setup</span></div><div className="glass stat"><small>OPEN TRADES</small><b>{openTrades} / 2</b><span>paper engine</span></div><div className="glass stat"><small>PAPER P/L</small><b>{state.realizedPnl.toFixed(2)}</b><span>realized</span></div><div className="glass stat"><small>EXECUTION</small><b>LOCKED</b><span>demo only</span></div></section>

      <section className="scanner glass">
        <div className="scanner-copy"><span className="eyebrow">VISION SCANNER · CHART ANALYSIS</span><h2>Drop a chart.<br /><em>Find the confluence.</em></h2><p>Upload a screenshot and inspect a candidate setup. The scanner never bypasses confirmation or risk gates.</p>
          <div className="scan-options"><select value={scanSymbol} onChange={(e) => setScanSymbol(e.target.value as 'XAUUSD' | 'BTCUSD')}><option>XAUUSD</option><option>BTCUSD</option></select><select value={scanTf} onChange={(e) => setScanTf(e.target.value as 'M5' | 'M15' | 'H1' | 'H4')}><option>M5</option><option>M15</option><option>H1</option><option>H4</option></select></div>
        </div>
        <button className="scan" onClick={() => fileRef.current?.click()} disabled={scanning}><span className="camera">◉</span>{scanning ? ' ANALYZING…' : ' SCAN CHART'} <b>↗</b></button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && analyze(e.target.files[0])} />
      </section>

      <div className="chart-panel glass"><div className="chart-head"><div><span className="eyebrow">MARKET MAP</span><h3>{scanSymbol} · {scanTf}</h3></div><span className="chart-live">SIMULATED VIEW</span></div><div className="chart-canvas"><div className="chart-grid-lines" /><div className="zone supply">SUPPLY</div><div className="zone demand">DEMAND</div><div className="liq liq-high">LIQUIDITY HIGH</div><div className="liq liq-low">LIQUIDITY LOW</div><div className="structure-line line-one" /><div className="structure-line line-two" /><div className="entry-line">ENTRY ZONE</div><div className="sl-line">SL</div><div className="tp-line tp1">TP1 · 2R</div><div className="tp-line tp2">TP2 · 3R</div><div className="candle c1" /><div className="candle c2" /><div className="candle c3" /><div className="candle c4" /><div className="candle c5" /><div className="candle c6" /><div className="candle c7" /><div className="candle c8" /><div className="candle c9" /><div className="candle c10" /><div className="candle c11" /><div className="candle c12" /></div><div className="chart-legend"><span>● BOS</span><span>● LIQUIDITY</span><span>● SUPPLY/DEMAND</span><span>● ENTRY</span></div></div>

      {scan && <section className="glass scan-result">
        <div className="scan-image-wrap"><img src={scan.preview} alt="Uploaded trading chart" /><div className="scan-label">{scan.symbol} · {scan.timeframe}</div></div>
        <div className="scan-report"><div className="section-head"><span className="eyebrow">VISION REPORT</span><span className={scan.status === 'VALID_SETUP' ? 'report-good' : 'report-neutral'}>{scan.status}</span></div><h3>{scan.status === 'VALID_SETUP' ? 'Candidate setup detected' : 'Validation gate blocked entry'}</h3><div className="setup-grid"><span>DIRECTION <b>{scan.direction ?? '—'}</b></span><span>HTF BIAS <b>{scan.h4Bias ?? '—'}</b></span><span>ENTRY <b>{scan.entry ?? '—'}</b></span><span>SL <b>{scan.stopLoss ?? '—'}</b></span><span>TP1 <b>{scan.takeProfit1 ?? '—'}</b></span><span>TP2 <b>{scan.takeProfit2 ?? '—'}</b></span><span>R:R <b>{scan.rr ? scan.rr.toFixed(2) : '—'}</b></span><span>CONFIDENCE <b>{scan.confidence ?? 0}%</b></span></div><div className="report-list">{(scan.checks ?? []).map((check, i) => <div key={i}><i>{check.passed ? '✓' : '✕'}</i><span><b>{check.name}</b> · {check.detail}</span></div>)}</div><div className="report-list">{scan.reasons.map((reason, i) => <div key={i}><i>!</i><span>{reason}</span></div>)}</div>{scan.invalidation && <div className="invalidation"><small>INVALIDATION</small><span>{scan.invalidation}</span></div>}<button className="secondary" onClick={() => setScan(null)}>CLEAR SCAN</button></div>
      </section>}

      {setup && <section className="glass setup"><div className="setup-head"><div><span className="eyebrow">ACTIVE SETUP · {setup.status}</span><h2>{setup.direction} {setup.symbol}</h2></div><b className="setup-confidence">{setup.confidence}%</b></div><div className="setup-grid"><span>ENTRY <b>{setup.entry}</b></span><span>SL <b>{setup.stopLoss}</b></span><span>TP1 <b>{setup.takeProfit1}</b></span><span>TP2 <b>{setup.takeProfit2}</b></span><span>R:R <b>{setup.rr}</b></span><span>BOS <b>{setup.bos ? 'YES' : 'NO'}</b></span></div><p>{setup.reasons.join(' · ')}</p></section>}

      <section className="glass activity"><div className="section-head"><span className="eyebrow">AUDIT STREAM</span><span>{state.audit.length} EVENTS</span></div>{state.audit.slice(0, 6).map((event) => <div className="event" key={event.id}><b>{event.type}</b><span>{event.message}</span></div>)}</section>
      <footer><span>MANYAMA SCANNER v1</span><span>MT5 EXECUTION ADAPTER · PAPER ONLY</span></footer>
    </main>
  );
}
