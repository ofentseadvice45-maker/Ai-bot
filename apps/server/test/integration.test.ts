import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/index.js';
import { confidenceGate } from '../src/scanner.js';
import type { AppState } from '@manyama/shared';
import type { Server } from 'node:http';

const features = { h4Bias: 'BULLISH' as const, h1Structure: true, bos: true, supplyDemand: true, liquidity: true, momentum: true, rr: 2 };
let server: Server; let baseUrl = '';
async function req(path: string, init?: RequestInit) { const response = await fetch(baseUrl + path, { headers: { 'Content-Type': 'application/json' }, ...init }); return { response, body: await response.json() as Record<string, unknown> }; }
const post = (path: string, body: unknown) => req(path, { method: 'POST', body: JSON.stringify(body) });
beforeEach(() => { const created = createApp(); server = created.app.listen(0); const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test server address'); baseUrl = `http://127.0.0.1:${address.port}`; });
afterEach(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

describe('HTTP routes', () => {
  it('health and safe state', async () => { expect((await req('/api/health')).response.status).toBe(200); expect((await req('/api/health')).body).toMatchObject({ executionMode: 'PAPER_ONLY', liveTrading: false }); expect((await req('/api/state')).body).toMatchObject({ botStatus: 'PAUSED', emergency: false, executionMode: 'PAPER_ONLY' }); });
  it('commands and invalid command', async () => { for (const command of ['START','PAUSE','CLOSE_ALL','EMERGENCY_STOP']) expect((await post('/api/command',{command})).response.status).toBe(200); expect((await post('/api/command',{command:'LIVE_ORDER'})).response.status).toBe(400); });
  it('risk boundaries', async () => { for (const riskPercent of [0.1,0.5,1]) expect((await post('/api/settings',{riskPercent})).response.status).toBe(200); for (const riskPercent of [0.099,1.01,'0.5',null]) expect((await post('/api/settings',{riskPercent})).response.status).toBe(400); });
  it('market validation and paper propagation', async () => { const now = new Date().toISOString(); expect((await post('/api/market/update',{source:'PAPER',symbol:'XAUUSD',price:2700,timestamp:now})).response.status).toBe(200); expect(((await req('/api/state')).body as {markets:{XAUUSD:{price:number}}}).markets.XAUUSD.price).toBe(2700); for (const body of [{source:'PAPER',symbol:'EURUSD',price:1,timestamp:now},{source:'PAPER',symbol:'BTCUSD',price:0,timestamp:now},{source:'PAPER',symbol:'BTCUSD',price:-1,timestamp:now},{source:'PAPER',symbol:'BTCUSD',price:100000,timestamp:'bad'}]) expect((await post('/api/market/update',body)).response.status).toBe(400); });
  it('MT5 heartbeat carries prices and stale timestamps are disconnected', async () => { const now = new Date().toISOString(); const fresh = await post('/api/mt5/heartbeat',{terminal:'MT5',accountLabel:'MT5 DEMO',timestamp:now,symbols:['XAUUSD','BTCUSD'],prices:{XAUUSD:2701.25,BTCUSD:110001.5}}); expect(fresh.body).toMatchObject({status:'connected',prices:{XAUUSD:2701.25,BTCUSD:110001.5}}); const stale = await post('/api/mt5/heartbeat',{terminal:'MT5',accountLabel:'MT5 DEMO',timestamp:new Date(Date.now()-60000).toISOString(),prices:{XAUUSD:2690,BTCUSD:109000}}); expect(stale.body).toMatchObject({status:'disconnected'}); expect((await req('/api/mt5/status')).body).toMatchObject({status:'disconnected'}); });
  it('chart analysis is safe without a vision provider', async () => { expect((await post('/api/chart/analyze',{imageBase64:'data:image/png;base64,AAAA',symbol:'XAUUSD',timeframe:'M15'})).body).toMatchObject({status:'UNCLEAR',valid:false}); expect((await post('/api/chart/analyze',{})).body).toMatchObject({status:'UNCLEAR',valid:false}); expect((await post('/api/chart/analyze',{imageBase64:'not-image',symbol:'XAUUSD',timeframe:'M15'})).body).toMatchObject({status:'UNCLEAR',valid:false}); });
});

describe('paper flow and hard safety', () => {
  it('runs entry -> 1R BE -> 2R partial -> trailing -> close', async () => {
    await post('/api/command',{command:'START'}); expect((await post('/api/scan',{symbol:'XAUUSD',entry:100,stopLoss:90,takeProfit1:120,takeProfit2:130,features})).response.status).toBe(200);
    const update = (price:number) => post('/api/market/update',{source:'PAPER',symbol:'XAUUSD',price,timestamp:new Date().toISOString()});
    let state = (await req('/api/state')).body as AppState; expect(state.trades.filter(t => t.status !== 'CLOSED')).toHaveLength(1);
    await update(110); state = (await req('/api/state')).body as AppState; expect(state.trades[0].status).toBe('BREAKEVEN'); expect(state.trades[0].stopLoss).toBe(100);
    await update(120); state = (await req('/api/state')).body as AppState; expect(state.trades[0].status).toBe('PARTIAL');
    await update(125); state = (await req('/api/state')).body as AppState; const trailingStop = state.trades[0].stopLoss; expect(state.trades[0].status).toBe('TRAILING');
    await update(118); state = (await req('/api/state')).body as AppState; expect(state.trades[0].stopLoss).toBe(trailingStop);
    await update(130); state = (await req('/api/state')).body as AppState; expect(state.trades[0].status).toBe('CLOSED');
  });
  it('enforces two open trades and rejects missing stop', async () => { await post('/api/command',{command:'START'}); const setup={symbol:'XAUUSD',entry:100,stopLoss:90,takeProfit1:120,takeProfit2:130,features}; expect((await post('/api/scan',setup)).response.status).toBe(200); expect((await post('/api/scan',{...setup,symbol:'BTCUSD'})).response.status).toBe(200); expect((await post('/api/scan',setup)).response.status).toBe(400); expect((await post('/api/scan',{...setup,stopLoss:0})).response.status).toBe(400); });
  it('enforces confidence 74/75/80', () => { expect(confidenceGate(74)).toBe(false); expect(confidenceGate(75)).toBe(true); expect(confidenceGate(80)).toBe(true); });
});
