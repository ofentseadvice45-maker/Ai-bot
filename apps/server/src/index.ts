import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { initialState, audit } from './state.js';
import { validateRiskPercent, closeAll, openPaperTrade } from './risk.js';
import { heartbeat, mt5Status, report } from './mt5.js';
import { scan } from './scanner.js';
import type { AppState } from './types.js';
dotenv.config();
const app = express(); app.use(cors()); app.use(express.json({ limit: '8mb' }));
const stateFile = process.env.STATE_FILE ?? path.resolve(process.cwd(), 'data/manyama-state.json');
let state: AppState = initialState();
async function persist(): Promise<void> { await fs.mkdir(path.dirname(stateFile), { recursive: true }); await fs.writeFile(stateFile, JSON.stringify(state, null, 2)); }
async function load(): Promise<void> { try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')) as AppState; } catch { await persist(); } }
const ok = (res: express.Response): void => { void persist(); res.json(state); };
app.get('/api/health', (_req, res) => res.json({ ok: true, executionMode: 'PAPER_ONLY', liveTrading: false }));
app.get('/api/state', (_req, res) => res.json(state));
app.post('/api/settings', (req, res, next) => { try { if (req.body.riskPercent !== undefined) state.risk.riskPercent = validateRiskPercent(req.body.riskPercent); if (req.body.maxOpenTrades !== undefined && req.body.maxOpenTrades !== 2) throw new Error('Maximum open trades is hard-limited to 2'); audit(state, 'SETTINGS_CHANGED', 'Risk settings updated'); ok(res); } catch (error) { next(error); } });
app.post('/api/command', (req, res, next) => { try { const command = req.body.command; if (!['START', 'PAUSE', 'CLOSE_ALL', 'EMERGENCY_STOP'].includes(command)) throw new Error('Unknown command'); if (command === 'START') { state.botStatus = 'RUNNING'; state.emergency = false; } if (command === 'PAUSE') state.botStatus = 'PAUSED'; if (command === 'CLOSE_ALL') closeAll(state); if (command === 'EMERGENCY_STOP') { state.emergency = true; state.botStatus = 'EMERGENCY_STOPPED'; closeAll(state); } audit(state, command, `Command ${command} applied`); ok(res); } catch (error) { next(error); } });
app.post('/api/scan', (req, res, next) => { try { const setup = scan(req.body.symbol, req.body.entry, req.body.stopLoss, req.body.takeProfit1, req.body.takeProfit2, req.body.features); state.scanner = { status: setup.status, confidence: setup.confidence, activeSetup: setup }; if (setup.status === 'VALID_SETUP' && state.botStatus === 'RUNNING') openPaperTrade(state, setup); audit(state, 'SETUP_DETECTED', `${setup.symbol} ${setup.status}`); ok(res); } catch (error) { next(error); } });
app.post('/api/chart/analyze', (req, res, next) => { try { const { symbol, timeframe, imageBase64 } = req.body; if (!imageBase64 || typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image/')) return res.json({ status: 'UNCLEAR', valid: false, reasons: ['A valid image upload is required'], scannedAt: new Date().toISOString() }); if (!symbol || !timeframe) return res.json({ status: 'UNCLEAR', valid: false, reasons: ['Symbol and timeframe are required'], scannedAt: new Date().toISOString() }); res.json({ status: 'UNCLEAR', valid: false, symbol, timeframe, reasons: ['Analysis-only adapter is ready; no reliable vision provider configured'], invalidation: 'Do not trade from an unclear image', scannedAt: new Date().toISOString() }); } catch (error) { next(error); } });
app.get('/api/mt5/status', (_req, res) => res.json(mt5Status(state)));
app.post('/api/mt5/heartbeat', (req, res, next) => { try { res.json(heartbeat(state, req.body ?? {})); void persist(); } catch (error) { next(error); } });
app.post('/api/mt5/report', (req, res, next) => { try { res.json(report(state, req.body)); void persist(); } catch (error) { next(error); } });
app.get('/api/mt5/commands', (_req, res) => res.json({ executionMode: 'PAPER_ONLY', commands: [] }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => res.status(400).json({ error: error instanceof Error ? error.message : 'Request failed' }));
await load(); const port = Number(process.env.PORT ?? 4000); app.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Manyama API listening on ${port} (PAPER_ONLY)`));
