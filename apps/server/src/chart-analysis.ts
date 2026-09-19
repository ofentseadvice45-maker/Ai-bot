import type { ChartAnalysisRequest, ChartAnalysisResult, ChartValidationCheck } from '@manyama/shared';

export interface ChartAnalysisService {
  analyze(input: ChartAnalysisRequest): Promise<ChartAnalysisResult>;
}

type VisionFinding = {
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  h4Bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  h1Structure: boolean;
  bos: boolean;
  supplyDemand: boolean;
  liquidity: boolean;
  momentum: boolean;
  entry: number | null;
  stopLoss: number | null;
  takeProfit1: number | null;
  takeProfit2: number | null;
  rr: number | null;
  confidence: number;
  notes: string[];
};

const cleanNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const asBool = (value: unknown): boolean => value === true || value === 'true';

function parseVisionText(text: string): VisionFinding {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Vision model returned no JSON object');
  const raw = JSON.parse(match[0]) as Record<string, unknown>;
  const direction = raw.direction === 'LONG' || raw.direction === 'SHORT' ? raw.direction : 'NEUTRAL';
  const h4Bias = raw.h4Bias === 'BULLISH' || raw.h4Bias === 'BEARISH' ? raw.h4Bias : 'NEUTRAL';
  return {
    direction,
    h4Bias,
    h1Structure: asBool(raw.h1Structure),
    bos: asBool(raw.bos),
    supplyDemand: asBool(raw.supplyDemand),
    liquidity: asBool(raw.liquidity),
    momentum: asBool(raw.momentum),
    entry: cleanNumber(raw.entry),
    stopLoss: cleanNumber(raw.stopLoss),
    takeProfit1: cleanNumber(raw.takeProfit1),
    takeProfit2: cleanNumber(raw.takeProfit2),
    rr: cleanNumber(raw.rr),
    confidence: Math.max(0, Math.min(100, Number(raw.confidence) || 0)),
    notes: Array.isArray(raw.notes) ? raw.notes.filter((x): x is string => typeof x === 'string').slice(0, 8) : []
  };
}

function validateFinding(input: ChartAnalysisRequest, finding: VisionFinding, priorH4Bias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL'): ChartAnalysisResult {
  const scannedAt = new Date().toISOString();
  const effectiveH4Bias = input.timeframe === 'H4' ? finding.h4Bias : (priorH4Bias ?? finding.h4Bias);
  const direction = finding.direction;
  const rr = finding.rr ?? (
    finding.entry !== null && finding.stopLoss !== null && finding.takeProfit2 !== null
      ? Math.abs(finding.takeProfit2 - finding.entry) / Math.abs(finding.entry - finding.stopLoss)
      : null
  );
  const riskValid = finding.entry !== null && finding.stopLoss !== null &&
    ((direction === 'LONG' && finding.stopLoss < finding.entry) || (direction === 'SHORT' && finding.stopLoss > finding.entry));
  const targetValid = finding.entry !== null && finding.takeProfit2 !== null &&
    ((direction === 'LONG' && finding.takeProfit2 > finding.entry) || (direction === 'SHORT' && finding.takeProfit2 < finding.entry));

  const checks: ChartValidationCheck[] = [
    { name: 'HTF Bias', passed: effectiveH4Bias !== 'NEUTRAL' && direction !== 'NEUTRAL' && effectiveH4Bias === (direction === 'LONG' ? 'BULLISH' : 'BEARISH'), detail: effectiveH4Bias },
    { name: 'H1 Structure', passed: finding.h1Structure, detail: finding.h1Structure ? 'Confirmed' : 'Not confirmed' },
    { name: 'BOS', passed: finding.bos, detail: finding.bos ? 'Confirmed' : 'Not confirmed' },
    { name: 'Supply / Demand', passed: finding.supplyDemand, detail: finding.supplyDemand ? 'Zone identified' : 'No clean zone' },
    { name: 'Liquidity', passed: finding.liquidity, detail: finding.liquidity ? 'Confirmed' : 'Not confirmed' },
    { name: 'Entry Confirmation', passed: finding.momentum, detail: finding.momentum ? 'Confirmed' : 'Not confirmed' },
    { name: 'SL Valid', passed: riskValid, detail: riskValid ? 'Structure-valid stop' : 'Invalid/missing stop' },
    { name: 'TP2 Valid', passed: targetValid, detail: targetValid ? 'Target aligns with direction' : 'Invalid/missing target' },
    { name: 'RR ≥ 1:2', passed: rr !== null && rr >= 2, detail: rr === null ? 'Unavailable' : rr.toFixed(2) },
    { name: 'Confidence ≥ 75%', passed: finding.confidence >= 75, detail: `${Math.round(finding.confidence)}%` }
  ];

  const reasons = checks.filter(c => !c.passed).map(c => `${c.name}: ${c.detail}`);
  if (finding.notes.length) reasons.push(...finding.notes);
  const valid = checks.every(c => c.passed);
  const status = valid ? 'VALID_SETUP' : finding.confidence >= 55 ? 'WATCHING' : 'NO_SETUP';

  return {
    status,
    valid,
    symbol: input.symbol,
    timeframe: input.timeframe,
    direction,
    h4Bias: effectiveH4Bias,
    h1Structure: finding.h1Structure,
    bos: finding.bos,
    supplyDemand: finding.supplyDemand,
    liquidity: finding.liquidity,
    momentum: finding.momentum,
    entry: finding.entry ?? undefined,
    stopLoss: finding.stopLoss ?? undefined,
    takeProfit1: finding.takeProfit1 ?? undefined,
    takeProfit2: finding.takeProfit2 ?? undefined,
    rr: rr ?? undefined,
    confidence: Math.round(finding.confidence),
    checks,
    reasons: reasons.length ? reasons : ['All validation gates passed'],
    invalidation: finding.stopLoss !== null ? `Invalid if price crosses ${finding.stopLoss}` : 'No valid stop-loss was identified',
    scannedAt
  };
}

export class OpenAIChartAnalysisService implements ChartAnalysisService {
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly model = process.env.OPENAI_VISION_MODEL ?? 'gpt-5.6-luna';
  private readonly h4BiasBySymbol = new Map<string, 'BULLISH' | 'BEARISH' | 'NEUTRAL'>();

  async analyze(input: ChartAnalysisRequest): Promise<ChartAnalysisResult> {
    const scannedAt = new Date().toISOString();
    const imageBase64 = typeof input?.imageBase64 === 'string' ? input.imageBase64 : '';
    if (!imageBase64.startsWith('data:image/')) {
      return { status: 'UNCLEAR', valid: false, reasons: ['A valid image upload is required'], scannedAt };
    }
    if (!input.symbol || !input.timeframe) return { status: 'UNCLEAR', valid: false, reasons: ['Symbol and timeframe are required'], scannedAt };
    if (!this.apiKey) return { status: 'UNCLEAR', valid: false, symbol: input.symbol, timeframe: input.timeframe, reasons: ['OPENAI_API_KEY is not configured on the backend'], invalidation: 'AI analysis is unavailable; do not trade', scannedAt };

    const prompt = `You are the Manyama Scanner chart-vision engine. Analyze ONLY what is visible in this trading chart image. Do not invent candles, prices, indicators, or levels. The strategy requires higher-timeframe alignment, break of structure, supply/demand, liquidity, confirmation, valid risk levels, RR >= 2, and confidence >= 75. Selected symbol: ${input.symbol}. Selected timeframe: ${input.timeframe}.

Return ONLY one JSON object with exactly these fields:
{"direction":"LONG|SHORT|NEUTRAL","h4Bias":"BULLISH|BEARISH|NEUTRAL","h1Structure":true,"bos":true,"supplyDemand":true,"liquidity":true,"momentum":true,"entry":0,"stopLoss":0,"takeProfit1":0,"takeProfit2":0,"rr":0,"confidence":0,"notes":["short evidence"]}

For numeric fields use null when the chart does not make the level reliable. Confidence is 0-100 and must reflect visual evidence, not optimism. If the selected chart is not H4, only set h4Bias from visible higher-timeframe evidence; otherwise use NEUTRAL. If a condition is unclear, set it false. Do not create a trade just because price is moving.`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model,
        input: [{
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            { type: 'input_image', image_url: imageBase64, detail: 'high' }
          ]
        }],
        max_output_tokens: 1200
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Vision provider error ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const outputText = data.output_text ?? data.output?.flatMap(item => item.content ?? []).map(item => item.text ?? '').join('') ?? '';
    const finding = parseVisionText(outputText);
    if (input.timeframe === 'H4') this.h4BiasBySymbol.set(input.symbol, finding.h4Bias);
    return validateFinding(input, finding, this.h4BiasBySymbol.get(input.symbol));
  }
}

export class SafeChartAnalysisService extends OpenAIChartAnalysisService {}
