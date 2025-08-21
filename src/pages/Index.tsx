import { useState } from 'react';
import { Brain, Zap, BarChart3, BookOpen, TrendingUp, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ImageUpload } from '@/components/ImageUpload';
import { StrategySelector, StrategyType } from '@/components/StrategySelector';
import { AnalysisResults } from '@/components/AnalysisResults';
import { TradeJournal, Trade } from '@/components/TradeJournal';
import { TradingStats } from '@/components/TradingStats';
import { MarketSelector, CurrencyType, TimeframeType, TradingType } from '@/components/MarketSelector';
import { PricePrediction } from '@/components/PricePrediction';
import { CryptoNews } from '@/components/CryptoNews';
import { SMCAnalysis } from '@/components/SMCAnalysis';
import { ICTAnalysis } from '@/components/ICTAnalysis';

import { AutoTradingSignals } from '@/components/AutoTradingSignals';
import { AutoTrader } from '@/components/AutoTrader';
import { toast } from 'sonner';

const Index = () => {
  const [selectedStrategy, setSelectedStrategy] = useState<StrategyType>('swing');
  const [selectedCurrency, setSelectedCurrency] = useState<CurrencyType>('BTC');
  const [selectedTimeframe, setSelectedTimeframe] = useState<TimeframeType>('4h');
  const [selectedTradingType, setSelectedTradingType] = useState<TradingType>('spot');
  const [uploadedImage, setUploadedImage] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [predictionResult, setPredictionResult] = useState<any>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [showJournal, setShowJournal] = useState(false);

  const handleImageUpload = (file: File, imageUrl: string) => {
    setUploadedImage(imageUrl);
    setAnalysisResult(null);
  };

  const handleRemoveImage = () => {
    setUploadedImage('');
    setAnalysisResult(null);
  };

  const handleUpdateTrade = (tradeId: string, updates: Partial<Trade>) => {
    setTrades(prevTrades =>
      prevTrades.map(trade =>
        trade.id === tradeId ? { ...trade, ...updates } : trade
      )
    );
  };

  const createTradeFromAnalysis = (analysisData: any) => {
    const newTrade: Trade = {
      id: `trade_${Date.now()}`,
      strategy: analysisData.strategy,
      pattern: analysisData.pattern,
      direction: analysisData.direction === 'bullish' ? 'long' : 'short',
      entry: analysisData.entry,
      stopLoss: analysisData.stopLoss,
      takeProfit: analysisData.takeProfit,
      analyzedAt: new Date(),
      estimatedEntryTime: analysisData.estimatedEntryTime,
      status: 'pending'
    };

    setTrades(prevTrades => [newTrade, ...prevTrades]);
    toast.success('Trade added to journal!');
  };

  const simulateAnalysis = () => {
    setIsAnalyzing(true);

    // Simulate AI analysis delay
    setTimeout(() => {
      const currentPrice = selectedCurrency === 'BTC' ? 45000 :
                        selectedCurrency === 'ETH' ? 2500 :
                        selectedCurrency === 'BNB' ? 350 :
                        selectedCurrency === 'SOL' ? 85 : 25;
      const direction = Math.random() > 0.5 ? 'bullish' : 'bearish' as 'bullish' | 'bearish';
      const changePercent = (Math.random() * 4 + 1) * (direction === 'bullish' ? 1 : -1);

      const mockAnalysisResult = {
        strategy: selectedStrategy,
        confidence: Math.floor(Math.random() * 30) + 70,
        pattern: selectedStrategy === 'swing' ? 'Bull Flag' : 'Ascending Triangle',
        direction,
        entry: currentPrice,
        stopLoss: direction === 'bullish' ? currentPrice * 0.97 : currentPrice * 1.03,
        takeProfit: direction === 'bullish' ? currentPrice * 1.05 : currentPrice * 0.95,
        riskReward: selectedStrategy === 'swing' ? '1:3.2' : '1:1.8',
        timeframe: selectedTimeframe,
        volume: ['high', 'medium', 'low'][Math.floor(Math.random() * 3)] as 'high' | 'medium' | 'low',
        estimatedEntryTime: selectedStrategy === 'swing' ? '2-4 hours' : '5-15 minutes',
        keyLevels: {
          support: [currentPrice * 0.97, currentPrice * 0.95, currentPrice * 0.93],
          resistance: [currentPrice * 1.03, currentPrice * 1.05, currentPrice * 1.07]
        }
      };

      setAnalysisResult(mockAnalysisResult);
      
      // Also set prediction result
      setPredictionResult({
        predicted_price: currentPrice * (1 + changePercent / 100),
        confidence: mockAnalysisResult.confidence,
        direction,
        timeframe: selectedTimeframe,
        factors: [
          'Technical indicators suggest ' + direction + ' momentum',
          'Volume analysis confirms the trend',
          'Market sentiment aligns with prediction'
        ]
      });
      
      setIsAnalyzing(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Effects */}
      <div className="absolute inset-0 bg-gradient-background" />
      <div className="absolute inset-0">
        <div className="absolute top-20 left-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 right-20 w-80 h-80 bg-accent/10 rounded-full blur-3xl animate-float" style={{animationDelay: '2s'}} />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-secondary/10 rounded-full blur-3xl animate-float" style={{animationDelay: '4s'}} />
      </div>
      
      <div className="relative container mx-auto px-4 py-12 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-in">
          <div className="inline-block mb-6">
            <h1 className="text-5xl md:text-7xl font-luxury font-black tracking-tight mb-4">
              Chart<span className="text-luxury">Trader</span>
            </h1>
            <div className="h-1 w-full bg-gradient-primary rounded-full shadow-glow" />
          </div>
          <p className="text-xl md:text-2xl text-foreground/80 mb-8 font-medium">
            Professional Trading Analysis & Strategy Platform
          </p>
          <div className="inline-flex items-center gap-3 glass-card px-6 py-3 rounded-full">
            <div className="w-2 h-2 bg-primary rounded-full animate-pulse-glow" />
            <span className="text-sm font-medium text-primary">Live Market Analysis</span>
          </div>
        </div>

        {/* Market & Strategy Selection */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12 animate-slide-in">
          <div className="glass-card p-8 rounded-2xl shadow-floating glow">
            <MarketSelector
              selectedCurrency={selectedCurrency}
              onCurrencyChange={setSelectedCurrency}
              selectedTimeframe={selectedTimeframe}
              onTimeframeChange={setSelectedTimeframe}
              selectedTradingType={selectedTradingType}
              onTradingTypeChange={setSelectedTradingType}
            />
          </div>
          <div className="glass-card p-8 rounded-2xl shadow-floating glow">
            <StrategySelector
              selectedStrategy={selectedStrategy}
              onStrategyChange={setSelectedStrategy}
            />
          </div>
        </div>

        {/* Chart Upload & Analysis */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-12 animate-scale-in">
          <div className="xl:col-span-2">
            <div className="glass-card p-8 rounded-2xl shadow-floating">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-gradient-primary rounded-lg shadow-luxury">
                  <Brain className="h-6 w-6 text-primary-foreground" />
                </div>
                <h2 className="text-2xl font-bold text-luxury">AI Chart Analysis</h2>
              </div>
              
              <ImageUpload
                onImageUploaded={handleImageUpload}
                onRemoveImage={handleRemoveImage}
                uploadedImage={uploadedImage}
              />

              {uploadedImage && (
                <div className="mt-6">
                  <Button 
                    onClick={simulateAnalysis}
                    disabled={isAnalyzing}
                    className="w-full btn-luxury h-14 text-lg font-semibold"
                  >
                    {isAnalyzing ? (
                      <>
                        <Zap className="mr-3 h-5 w-5 animate-spin" />
                        Analyzing Chart...
                      </>
                    ) : (
                      <>
                        <Brain className="mr-3 h-5 w-5" />
                        Analyze Chart with AI
                      </>
                    )}
                  </Button>
                </div>
              )}

              {analysisResult && (
                <div className="mt-6">
                  <AnalysisResults 
                    data={analysisResult}
                    imageUrl={uploadedImage}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-card rounded-2xl shadow-floating">
              <TradingStats trades={trades} />
            </div>
            
            <div className="flex gap-3">
              <Button
                variant={showJournal ? "default" : "outline"}
                onClick={() => setShowJournal(true)}
                className={`flex-1 h-12 font-semibold ${showJournal ? 'btn-luxury' : 'glass-card border-primary/20 hover:border-primary/40'}`}
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Journal
              </Button>
              <Button
                variant={!showJournal ? "default" : "outline"}
                onClick={() => setShowJournal(false)}
                className={`flex-1 h-12 font-semibold ${!showJournal ? 'btn-luxury' : 'glass-card border-primary/20 hover:border-primary/40'}`}
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Analysis
              </Button>
            </div>
          </div>
        </div>

        {/* Conditional Content */}
        {showJournal ? (
          <div className="glass-card rounded-2xl shadow-floating p-1">
            <TradeJournal 
              trades={trades}
              onUpdateTrade={handleUpdateTrade}
            />
          </div>
        ) : (
          <div className="space-y-12">
            {/* Price Prediction & News */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="glass-card rounded-2xl shadow-floating p-1">
                <PricePrediction 
                  currency={selectedCurrency}
                  timeframe={selectedTimeframe}
                  data={predictionResult || {
                    currentPrice: 45000,
                    predictedPrice: 47000,
                    priceChange: 2000,
                    percentageChange: 4.4,
                    direction: 'bullish',
                    confidence: 75,
                    timeToTarget: '24-48 hours',
                    keyEvents: ['Technical breakout expected', 'Volume increasing'],
                    volatility: 'medium'
                  }}
                />
              </div>
              <div className="glass-card rounded-2xl shadow-floating p-1">
                <CryptoNews selectedCurrency={selectedCurrency} />
              </div>
            </div>

            {/* Advanced Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="glass-card rounded-2xl shadow-floating p-1">
                <SMCAnalysis 
                  currency={selectedCurrency}
                  timeframe={selectedTimeframe}
                />
              </div>
              <div className="glass-card rounded-2xl shadow-floating p-1">
                <ICTAnalysis 
                  currency={selectedCurrency}
                  timeframe={selectedTimeframe}
                />
              </div>
            </div>

            {/* Auto Trading Signals */}
            <div className="glass-card rounded-2xl shadow-floating p-1">
              <AutoTradingSignals 
                selectedCurrency={selectedCurrency}
                selectedTimeframe={selectedTimeframe}
                tradingType={selectedTradingType}
              />
            </div>

            {/* AI Auto Trading Bot */}
            <div className="glass-card rounded-2xl shadow-floating p-8">
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-3 mb-4">
                  <div className="p-3 bg-gradient-primary rounded-xl shadow-luxury">
                    <Bot className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <h2 className="text-3xl font-bold text-luxury">AI Auto Trading Bot</h2>
                </div>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Automatisk trading bot som analyserar marknaden och utför max 5 trades/dag med 4% risk per trade
                </p>
              </div>
              <AutoTrader />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;