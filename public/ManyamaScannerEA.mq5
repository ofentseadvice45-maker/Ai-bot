#property strict
#property version   "1.0"
#property description "Manyama Scanner MT5 execution bridge. DEMO is the default; LIVE requires explicit confirmation."

#include <Trade/Trade.mqh>

CTrade trade;

enum ExecutionMode
  {
   MODE_DEMO = 0,
   MODE_LIVE = 1
  };

input string ApiBaseUrl = "http://127.0.0.1:4000";
input ExecutionMode Mode = MODE_DEMO;
input bool ConfirmLiveTrading = false;
input int PollSeconds = 5;
input double RiskPercent = 0.50;
input int MaxOpenTrades = 2;
input int SlippagePoints = 50;
input string SymbolsCsv = "XAUUSD,BTCUSD";

string lastSignalId = "";
datetime lastPoll = 0;

string Trim(string value)
  {
   StringTrimLeft(value);
   StringTrimRight(value);
   return value;
  }

bool IsAllowedSymbol(string symbol)
  {
   string parts[];
   int n=StringSplit(SymbolsCsv,',',parts);
   for(int i=0;i<n;i++)
      if(Trim(parts[i])==symbol) return true;
   return false;
  }

bool IsExecutionAllowed()
  {
   if(Mode==MODE_DEMO)
      return AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_DEMO;

   if(!ConfirmLiveTrading)
     {
      Print("LIVE mode blocked: ConfirmLiveTrading=false.");
      return false;
     }

   return AccountInfoInteger(ACCOUNT_TRADE_MODE)==ACCOUNT_TRADE_MODE_REAL;
  }

int CountOpenPositions()
  {
   int count=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket=PositionGetTicket(i);
      if(ticket>0) count++;
     }
   return count;
  }

double NormalizeVolume(string symbol,double volume)
  {
   double minv=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
   double maxv=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
   if(step<=0) return 0;
   volume=MathMax(minv,MathMin(maxv,volume));
   volume=MathFloor(volume/step)*step;
   return NormalizeDouble(volume,2);
  }

double CalculateVolume(string symbol,double entry,double sl)
  {
   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   double riskMoney=equity*RiskPercent/100.0;
   double tickSize=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_SIZE);
   double tickValue=SymbolInfoDouble(symbol,SYMBOL_TRADE_TICK_VALUE);
   double distance=MathAbs(entry-sl);
   if(equity<=0 || riskMoney<=0 || distance<=0 || tickSize<=0 || tickValue<=0) return 0;
   double lossPerLot=(distance/tickSize)*tickValue;
   if(lossPerLot<=0) return 0;
   return NormalizeVolume(symbol,riskMoney/lossPerLot);
  }

bool ParseJsonString(string json,string key,string &value)
  {
   string needle="\"" + key + "\":\"";
   int p=StringFind(json,needle);
   if(p<0) return false;
   p+=StringLen(needle);
   int e=StringFind(json,"\"",p);
   if(e<0) return false;
   value=StringSubstr(json,p,e-p);
   return true;
  }

bool ParseJsonNumber(string json,string key,double &value)
  {
   string needle="\"" + key + "\":";
   int p=StringFind(json,needle);
   if(p<0) return false;
   p+=StringLen(needle);
   int e=p;
   while(e<StringLen(json))
     {
      ushort c=StringGetCharacter(json,e);
      if((c>='0' && c<='9') || c=='.' || c=='-' || c=='+') e++;
      else break;
     }
   string raw=StringSubstr(json,p,e-p);
   value=StringToDouble(raw);
   return raw!="";
  }

bool SignalIsValid(string json,string &id,string &symbol,string &direction,double &entry,double &sl,double &tp1,double &tp2,double &rr,double &confidence)
  {
   if(!ParseJsonString(json,"id",id)) return false;
   if(!ParseJsonString(json,"symbol",symbol)) return false;
   if(!ParseJsonString(json,"direction",direction)) return false;
   if(!ParseJsonNumber(json,"entry",entry) || !ParseJsonNumber(json,"stopLoss",sl) ||
      !ParseJsonNumber(json,"takeProfit1",tp1) || !ParseJsonNumber(json,"takeProfit2",tp2) ||
      !ParseJsonNumber(json,"rr",rr) || !ParseJsonNumber(json,"confidence",confidence)) return false;

   if(!IsAllowedSymbol(symbol) || (direction!="LONG" && direction!="SHORT")) return false;
   if(confidence<75.0 || rr<2.0 || entry<=0 || sl<=0 || tp1<=0 || tp2<=0) return false;

   if(direction=="LONG" && !(sl<entry && tp1>entry && tp2>tp1)) return false;
   if(direction=="SHORT" && !(sl>entry && tp1<entry && tp2<tp1)) return false;

   return true;
  }

bool GetSignal(string &body)
  {
   char data[];
   char result[];
   string headers="Content-Type: application/json\r\n";
   string responseHeaders;
   ResetLastError();
   int status=WebRequest("GET",ApiBaseUrl+"/api/mt5/commands",headers,5000,data,result,responseHeaders);
   if(status!=200)
     {
      Print("Manyama API request failed. HTTP=",status," error=",GetLastError());
      return false;
     }
   body=CharArrayToString(result);
   return body!="";
  }

void SendHeartbeat()
  {
   string json="{\"terminal\":\"MT5\",\"accountLabel\":\""+IntegerToString((int)AccountInfoInteger(ACCOUNT_LOGIN))+"\",\"symbols\":[\"XAUUSD\",\"BTCUSD\"]}";
   char data[];
   StringToCharArray(json,data,0,StringLen(json));
   char result[];
   string responseHeaders;
   WebRequest("POST",ApiBaseUrl+"/api/mt5/heartbeat","Content-Type: application/json\r\n",5000,data,result,responseHeaders);
  }

bool FindBrokerSymbol(string baseSymbol,string &brokerSymbol)
  {
   if(SymbolSelect(baseSymbol,true))
     {
      brokerSymbol=baseSymbol;
      return true;
     }

   int total=SymbolsTotal(false);
   for(int i=0;i<total;i++)
     {
      string name=SymbolName(i,false);
      if(StringFind(name,baseSymbol)==0)
        {
         brokerSymbol=name;
         SymbolSelect(brokerSymbol,true);
         return true;
        }
     }

   return false;
  }

void SendMarketUpdate(string baseSymbol)
  {
   string brokerSymbol;
   if(!FindBrokerSymbol(baseSymbol,brokerSymbol))
     {
      Print("Manyama market update: symbol not found for ",baseSymbol);
      return;
     }

   MqlTick tick;
   if(!SymbolInfoTick(brokerSymbol,tick))
     {
      Print("Manyama market update: no tick for ",brokerSymbol);
      return;
     }

   double price=tick.bid;
   if(price<=0) price=tick.last;
   if(price<=0)
     {
      Print("Manyama market update: invalid price for ",brokerSymbol);
      return;
     }

   string timestamp=TimeToString(TimeCurrent(),TIME_DATE|TIME_SECONDS);
   string json="{\"symbol\":\""+baseSymbol+"\",\"price\":"+DoubleToString(price,8)+",\"timestamp\":\""+timestamp+"\",\"source\":\"PAPER\"}";

   char data[];
   StringToCharArray(json,data,0,StringLen(json));
   char result[];
   string responseHeaders;

   ResetLastError();
   int status=WebRequest(
      "POST",
      ApiBaseUrl+"/api/market/update",
      "Content-Type: application/json\r\n",
      5000,
      data,
      result,
      responseHeaders
   );

   int error=GetLastError();
   Print("Manyama market update: ",baseSymbol," broker=",brokerSymbol,
         " price=",DoubleToString(price,8),
         " HTTP=",status," error=",error);
  }

void TryOpenSignal(string json)
  {
   if(CountOpenPositions()>=MaxOpenTrades) return;

   string id,symbol,direction;
   double entry,sl,tp1,tp2,rr,confidence;
   if(!SignalIsValid(json,id,symbol,direction,entry,sl,tp1,tp2,rr,confidence)) return;
   if(id==lastSignalId) return;
   if(!IsExecutionAllowed()) return;

   if(!SymbolSelect(symbol,true)) return;
   double volume=CalculateVolume(symbol,entry,sl);
   if(volume<=0) { Print("Manyama: volume calculation failed for ",symbol); return; }

   trade.SetDeviationInPoints(SlippagePoints);
   bool ok=false;
   if(direction=="LONG")
      ok=trade.Buy(volume,symbol,0.0,sl,tp2,"Manyama "+id);
   else
      ok=trade.Sell(volume,symbol,0.0,sl,tp2,"Manyama "+id);

   if(ok)
     {
      lastSignalId=id;
      Print("Manyama order opened: ",direction," ",symbol," volume=",DoubleToString(volume,2)," SL=",DoubleToString(sl,_Digits)," TP2=",DoubleToString(tp2,_Digits));
     }
   else
      Print("Manyama order rejected: ",trade.ResultRetcodeDescription());
  }

void ManagePositions()
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0 || !PositionSelectByTicket(ticket)) continue;

      string symbol=PositionGetString(POSITION_SYMBOL);
      long type=PositionGetInteger(POSITION_TYPE);
      double open=PositionGetDouble(POSITION_PRICE_OPEN);
      double sl=PositionGetDouble(POSITION_SL);
      double tp=PositionGetDouble(POSITION_TP);
      double volume=PositionGetDouble(POSITION_VOLUME);
      double current=(type==POSITION_TYPE_BUY) ? SymbolInfoDouble(symbol,SYMBOL_BID) : SymbolInfoDouble(symbol,SYMBOL_ASK);
      double initialRisk=MathAbs(open-sl);
      if(initialRisk<=0) continue;

      double move=(type==POSITION_TYPE_BUY) ? current-open : open-current;

      if(move>=initialRisk && (sl==0 || (type==POSITION_TYPE_BUY && sl<open) || (type==POSITION_TYPE_SELL && sl>open)))
        trade.PositionModify(ticket,open,tp);

      if(move>=initialRisk*2.0 && volume>SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN)*2.0)
        {
         double partial=NormalizeVolume(symbol,volume*0.5);
         if(partial>0 && partial<volume)
            trade.PositionClosePartial(ticket,partial);
        }

      if(move>initialRisk*2.0)
        {
         double trail=(type==POSITION_TYPE_BUY) ? current-initialRisk : current+initialRisk;
         bool improve=(type==POSITION_TYPE_BUY) ? trail>sl : (sl==0 || trail<sl);
         if(improve)
            trade.PositionModify(ticket,trail,tp);
        }
   }
  }

int OnInit()
  {
   if(PollSeconds<1) return INIT_PARAMETERS_INCORRECT;
   EventSetTimer(PollSeconds);
   Print("Manyama Scanner EA initialized. Mode=",Mode==MODE_DEMO ? "DEMO" : "LIVE");
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
  }

void OnTimer()
  {
   SendHeartbeat();
   SendMarketUpdate("XAUUSD");
   SendMarketUpdate("BTCUSD");
   ManagePositions();

   if(!IsExecutionAllowed()) return;
   string body;
   if(GetSignal(body)) TryOpenSignal(body);
  }
