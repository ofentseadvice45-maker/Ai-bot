# Manyama Scanner MT5 bridge

The repository now contains an MT5 Expert Advisor at `public/ManyamaScannerEA.mq5`.

Safety defaults:
- DEMO mode only by default.
- LIVE mode requires both `Mode=MODE_LIVE` and `ConfirmLiveTrading=true`.
- LIVE mode also requires MT5 to report a real trading account.
- Maximum 2 open positions.
- Risk is capped by the EA input and should normally remain at 0.5% or less.
- Signals must have confidence >= 75 and RR >= 2.
- Only XAUUSD and BTCUSD are accepted by default.
- The EA manages break-even at 1R, 50% partial at 2R, and a trailing stop after 2R.

Before demo/live execution, add the Manyama API URL under MT5:
Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL.
