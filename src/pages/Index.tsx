import { useState } from 'react';
import { Brain, Zap, BarChart3, BookOpen, TrendingUp } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Chart<span className="text-blue-500">Trader</span>
          </h1>
          <p className="text-xl text-gray-300 mb-8">
            Professional Trading Analysis & Strategy Platform
          </p>
        </div>

        {/* Market & Strategy Selection */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <MarketSelector
            selectedCurrency={selectedCurrency}
            onCurrencyChange={setSelectedCurrency}
            selectedTimeframe={selectedTimeframe}
            onTimeframeChange={setSelectedTimeframe}
            selectedTradingType={selectedTradingType}
            onTradingTypeChange={setSelectedTradingType}
          />
          <StrategySelector
            selectedStrategy={selectedStrategy}
            onStrategyChange={setSelectedStrategy}
          />
        </div>

        {/* Chart Upload & Analysis */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
          <div className="xl:col-span-2">
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="h-5 w-5 text-blue-500" />
                <h2 className="text-xl font-semibold text-white">Chart Analysis</h2>
              </div>
              
              <ImageUpload
                onImageUpload={handleImageUpload}
                onImageRemove={handleRemoveImage}
                uploadedImage={uploadedImage}
              />

              {uploadedImage && (
                <div className="mt-4">
                  <Button 
                    onClick={simulateAnalysis}
                    disabled={isAnalyzing}
                    className="w-full"
                  >
                    {isAnalyzing ? (
                      <>
                        <Zap className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing Chart...
                      </>
                    ) : (
                      <>
                        <Brain className="mr-2 h-4 w-4" />
                        Analyze Chart
                      </>
                    )}
                  </Button>
                </div>
              )}

              {analysisResult && (
                <AnalysisResults 
                  result={analysisResult}
                  onAddToJournal={createTradeFromAnalysis}
                />
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <TradingStats trades={trades} />
            
            <div className="flex gap-2">
              <Button
                variant={showJournal ? "default" : "outline"}
                onClick={() => setShowJournal(true)}
                className="flex-1"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Journal
              </Button>
              <Button
                variant={!showJournal ? "default" : "outline"}
                onClick={() => setShowJournal(false)}
                className="flex-1"
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                Analysis
              </Button>
            </div>
          </div>
        </div>

        {/* Conditional Content */}
        {showJournal ? (
          <TradeJournal 
            trades={trades}
            onUpdateTrade={handleUpdateTrade}
          />
        ) : (
          <div className="space-y-6">
            {/* Price Prediction & News */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PricePrediction 
                selectedCurrency={selectedCurrency}
                predictionResult={predictionResult}
              />
              <CryptoNews selectedCurrency={selectedCurrency} />
            </div>

            {/* Advanced Analysis */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SMCAnalysis 
                selectedCurrency={selectedCurrency}
                selectedTimeframe={selectedTimeframe}
              />
              <ICTAnalysis 
                selectedCurrency={selectedCurrency}
                selectedTimeframe={selectedTimeframe}
              />
            </div>

            {/* Auto Trading Signals */}
            <AutoTradingSignals 
              selectedCurrency={selectedCurrency}
              selectedStrategy={selectedStrategy}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;