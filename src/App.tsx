import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { ArrowRight, X, Wallet, Timer, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Brain } from 'lucide-react';
import OpenAI from 'openai';
import Typewriter from 'typewriter-effect';
import useSWR from 'swr';
import WalletAnalyzer from './WalletAnalyzer';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

interface CryptoData {
  name: string;
  symbol: string;
  price: number;
  change: number;
  marketCap: number;
  volume: number;
  expanded: boolean;
  analysis?: string;
  loading?: boolean;
  coingeckoId: string;
}

const initialCryptoData: CryptoData[] = [
  {
    name: 'Bitcoin',
    symbol: 'BTC',
    price: 67000,
    change: 2.5,
    marketCap: 329.92e9,
    volume: 14.14e9,
    expanded: false,
    coingeckoId: 'bitcoin'
  },
  {
    name: 'Ethereum',
    symbol: 'ETH',
    price: 3850,
    change: -0.38,
    marketCap: 329.92e9,
    volume: 14.14e9,
    expanded: false,
    coingeckoId: 'ethereum'
  },
  {
    name: 'Solana',
    symbol: 'SOL',
    price: 125,
    change: 0.87,
    marketCap: 54e9,
    volume: 2.1e9,
    expanded: false,
    coingeckoId: 'solana'
  }
];

function Home() {
  const navigate = useNavigate();
  const backgroundRef = useRef<HTMLDivElement>(null);
  const orbsRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  const [activePanel, setActivePanel] = useState<'wallet' | 'token' | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [cryptoPrices, setCryptoPrices] = useState(initialCryptoData);

  const generateAnalysis = async (crypto: CryptoData) => {
    try {
      const prompt = `Analyze ${crypto.name} (${crypto.symbol}):
      Current Price: $${crypto.price}
      24h Change: ${crypto.change}%
      Market Cap: $${crypto.marketCap}
      24h Volume: $${crypto.volume}

      Provide a brief, insightful market analysis focusing on:
      1. Current price action
      2. Market sentiment
      3. Key technical levels
      Keep it concise and professional.`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a professional crypto market analyst. Provide brief, focused analysis of market conditions and price action."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error generating analysis:', error);
      return "Analysis unavailable at this time.";
    }
  };

  const handleCardClick = async (symbol: string) => {
    setCryptoPrices(prices => prices.map(p => {
      if (p.symbol === symbol) {
        const newExpanded = !p.expanded;
        if (newExpanded && !p.analysis) {
          return { ...p, expanded: newExpanded, loading: true };
        }
        return { ...p, expanded: newExpanded };
      }
      return { ...p, expanded: false };
    }));

    const crypto = cryptoPrices.find(p => p.symbol === symbol);
    if (crypto && !crypto.analysis) {
      const analysis = await generateAnalysis(crypto);
      setCryptoPrices(prices => prices.map(p => 
        p.symbol === symbol ? { ...p, analysis, loading: false } : p
      ));
    }
  };

  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true'
        );
        const data = await response.json();
        
        if (data) {
          const updatedPrices = cryptoPrices.map(crypto => {
            const coinId = crypto.coingeckoId;
            return {
              ...crypto,
              price: data[coinId]?.usd || crypto.price,
              change: data[coinId]?.usd_24h_change || crypto.change
            };
          });
          setCryptoPrices(updatedPrices);
        }
      } catch (error) {
        console.error('Error fetching prices:', error);
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!backgroundRef.current || !orbsRef.current || !gridRef.current || !cursorRef.current || !contentRef.current) return;
      
      const { clientX, clientY } = e;
      const { innerWidth, innerHeight } = window;
      
      const normalizedX = (clientX / innerWidth - 0.5) * 2;
      const normalizedY = (clientY / innerHeight - 0.5) * 2;
      
      orbsRef.current.style.transform = `translate(${normalizedX * 30}px, ${normalizedY * 30}px)`;
      gridRef.current.style.transform = `translate(${normalizedX * 10}px, ${normalizedY * 10}px)`;
      backgroundRef.current.style.transform = `rotate(${normalizedX * 2}deg)`;
      
      const perspective = 1000 - Math.abs(normalizedX * 100);
      gridRef.current.style.perspective = `${perspective}px`;

      cursorRef.current.style.transform = `translate(${clientX - 100}px, ${clientY - 100}px)`;

      const box = contentRef.current.getBoundingClientRect();
      const boxCenterX = box.left + box.width / 2;
      const boxCenterY = box.top + box.height / 2;
      
      const deltaX = (clientX - boxCenterX) / innerWidth;
      const deltaY = (clientY - boxCenterY) / innerHeight;
      
      contentRef.current.style.transform = `
        perspective(1000px)
        rotateY(${deltaX * 5}deg)
        rotateX(${-deltaY * 5}deg)
        translateZ(0)
      `;
    };

    const handleMouseLeave = () => {
      if (!backgroundRef.current || !orbsRef.current || !gridRef.current || !contentRef.current) return;
      
      orbsRef.current.style.transform = 'translate(0, 0)';
      gridRef.current.style.transform = 'translate(0, 0)';
      backgroundRef.current.style.transform = 'rotate(0deg)';
      gridRef.current.style.perspective = '1000px';
      contentRef.current.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  const handleWalletSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (walletAddress) {
      navigate(`/wallet/${walletAddress}`);
    }
  };

  return (
    <div className="relative min-h-screen bg-zinc-950 overflow-hidden">
      <a 
        href="https://x.com/oxynize" 
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed top-6 left-6 z-50 w-8 h-8 text-white/70 hover:text-white transition-colors"
      >
        <svg width="32" height="32" viewBox="0 0 356 322" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M280.335 0H334.917L215.672 136.29L355.954 321.75H246.114L160.083 209.27L61.644 321.75H7.029L134.574 175.973L0 0H112.629L190.394 102.812L280.335 0ZM261.178 289.08H291.423L96.195 30.954H63.7395L261.178 289.08Z" fill="currentColor"/>
        </svg>
      </a>

      <a 
        href="https://dexscreener.com" 
        target="_blank" 
        rel="noopener noreferrer"
        className="fixed top-6 right-6 z-50 w-8 h-8 text-white/70 hover:text-white transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 252 300" fill="currentColor">
          <path d="M151.818 106.866c9.177-4.576 20.854-11.312 32.545-20.541 2.465 5.119 2.735 9.586 1.465 13.193-.9 2.542-2.596 4.753-4.826 6.512-2.415 1.901-5.431 3.285-8.765 4.033-6.326 1.425-13.712.593-20.419-3.197m1.591 46.886l12.148 7.017c-24.804 13.902-31.547 39.716-39.557 64.859-8.009-25.143-14.753-50.957-39.556-64.859l12.148-7.017a5.95 5.95 0 003.84-5.845c-1.113-23.547 5.245-33.96 13.821-40.498 3.076-2.342 6.434-3.518 9.747-3.518s6.671 1.176 9.748 3.518c8.576 6.538 14.934 16.951 13.821 40.498a5.95 5.95 0 003.84 5.845zM126 0c14.042.377 28.119 3.103 40.336 8.406 8.46 3.677 16.354 8.534 23.502 14.342 3.228 2.622 5.886 5.155 8.814 8.071 7.897.273 19.438-8.5 24.796-16.709-9.221 30.23-51.299 65.929-80.43 79.589-.012-.005-.02-.012-.029-.018-5.228-3.992-11.108-5.988-16.989-5.988s-11.76 1.996-16.988 5.988c-.009.005-.017.014-.029.018-29.132-13.66-71.209-49.359-80.43-79.589 5.357 8.209 16.898 16.982 24.795 16.709 2.929-2.915 5.587-5.449 8.814-8.071C69.31 16.94 77.204 12.083 85.664 8.406 97.882 3.103 111.959.377 126 0m-25.818 106.866c-9.176-4.576-20.854-11.312-32.544-20.541-2.465 5.119-2.735 9.586-1.466 13.193.901 2.542 2.597 4.753 4.826 6.512 2.416 1.901 5.432 3.285 8.766 4.033 6.326 1.425 13.711.593 20.418-3.197"></path><path d="M197.167 75.016c6.436-6.495 12.107-13.684 16.667-20.099l2.316 4.359c7.456 14.917 11.33 29.774 11.33 46.494l-.016 26.532.14 13.754c.54 33.766 7.846 67.929 24.396 99.193l-34.627-27.922-24.501 39.759-25.74-24.231L126 299.604l-41.132-66.748-25.739 24.231-24.501-39.759L0 245.25c16.55-31.264 23.856-65.427 24.397-99.193l.14-13.754-.016-26.532c0-16.721 3.873-31.578 11.331-46.494l2.315-4.359c4.56 6.415 10.23 13.603 16.667 20.099l-2.01 4.175c-3.905 8.109-5.198 17.176-2.156 25.799 1.961 5.554 5.54 10.317 10.154 13.953 4.48 3.531 9.782 5.911 15.333 7.161 3.616.814 7.3 1.149 10.96 1.035-.854 4.841-1.227 9.862-1.251 14.978L53.2 160.984l25.206 14.129a41.926 41.926 0 015.734 3.869c20.781 18.658 33.275 73.855 41.861 100.816 8.587-26.961 21.08-82.158 41.862-100.816a41.865 41.865 0 015.734-3.869l25.206-14.129-32.665-18.866c-.024-5.116-.397-10.137-1.251-14.978 3.66.114 7.344-.221 10.96-1.035 5.551-1.25 10.854-3.63 15.333-7.161 4.613-3.636 8.193-8.399 10.153-13.953 3.043-8.623 1.749-17.689-2.155-25.799l-2.01-4.175z"></path>
        </svg>
      </a>

      <div
        ref={cursorRef}
        className="pointer-events-none fixed top-0 left-0 w-[200px] h-[200px] rounded-full bg-white/[0.02] blur-[50px] transition-transform duration-[50ms]"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)',
        }}
      />

      <div ref={backgroundRef} className="absolute inset-0 transition-all duration-[800ms] ease-out">
        <div ref={orbsRef} className="absolute inset-0 transition-transform duration-[400ms] ease-out">
          <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-white/[0.03] blur-[120px] animate-float-slow" />
          <div className="absolute top-[40%] right-[-10%] w-[400px] h-[400px] rounded-full bg-white/[0.02] blur-[100px] animate-float-medium" />
          <div className="absolute bottom-[-10%] left-[20%] w-[600px] h-[600px] rounded-full bg-white/[0.03] blur-[150px] animate-float-fast" />
        </div>

        <div 
          ref={gridRef} 
          className="absolute inset-0 transition-all duration-[400ms] ease-out"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
            maskImage: 'radial-gradient(ellipse at center, black 50%, transparent 100%)',
          }}
        />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col">
        <div className="flex-grow flex items-center justify-center px-4">
          <div 
            ref={contentRef}
            className="backdrop-blur-xl bg-white/[0.02] p-12 rounded-3xl border border-white/[0.05] shadow-2xl animate-fade-in"
            style={{ transformStyle: 'preserve-3d' }}
          >
            <h1 className="text-7xl font-bold tracking-tight text-white text-center mb-4">
              Oxyn
            </h1>
            
            <p className="text-white/70 text-center text-lg mb-8">
              The fastest AI-Powered analyzer for wallets and tokens
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 animate-slide-up">
              <button 
                onClick={() => setActivePanel(activePanel === 'wallet' ? null : 'wallet')}
                className="group flex items-center justify-center gap-2 px-8 py-4 bg-white text-black rounded-2xl transition-all duration-300 hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
              >
                <Wallet className="w-5 h-5" />
                Analyze Wallet
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
              
              <button 
                onClick={() => setActivePanel(activePanel === 'token' ? null : 'token')}
                className="group flex items-center justify-center gap-2 px-8 py-4 bg-zinc-900 text-white rounded-2xl border border-white/[0.05] backdrop-blur-lg transition-all duration-300 hover:bg-zinc-800 hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]"
              >
                <Timer className="w-5 h-5" />
                Analyze Token
                <ArrowRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative z-20 w-full max-w-7xl mx-auto px-4 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cryptoPrices.map((crypto) => (
              <div
                key={crypto.symbol}
                className={`crypto-card backdrop-blur-xl bg-[#0A0A0A] rounded-[20px] p-6 cursor-pointer transition-all duration-300 hover:bg-[#0F0F0F] ${
                  crypto.expanded ? 'expanded' : 'collapsed'
                }`}
                onClick={() => handleCardClick(crypto.symbol)}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center">
                    {crypto.symbol === 'BTC' && (
                      <img src="https://assets.coingecko.com/coins/images/1/small/bitcoin.png" alt="BTC" className="w-8 h-8" />
                    )}
                    {crypto.symbol === 'ETH' && (
                      <img src="https://assets.coingecko.com/coins/images/279/small/ethereum.png" alt="ETH" className="w-8 h-8" />
                    )}
                    {crypto.symbol === 'SOL' && (
                      <img src="https://assets.coingecko.com/coins/images/4128/small/solana.png" alt="SOL" className="w-8 h-8" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-white text-lg font-medium">{crypto.name}</h3>
                    <p className="text-[#6F767E] text-sm">{crypto.symbol}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white text-2xl font-semibold">
                      ${crypto.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className={`flex items-center gap-1 ${crypto.change >= 0 ? 'text-[#00F2A9]' : 'text-[#FF422E]'}`}>
                      {crypto.change >= 0 ? (
                        <TrendingUp className="w-4 h-4" />
                      ) : (
                        <TrendingDown className="w-4 h-4" />
                      )}
                      <span className="text-sm">
                        {Math.abs(crypto.change).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  <button className="text-[#6F767E] hover:text-white transition-colors">
                    {crypto.expanded ? (
                      <ChevronUp className="w-5 h-5" />
                    ) : (
                      <ChevronDown className="w-5 h-5" />
                    )}
                  </button>
                </div>

                <div className={`crypto-content ${crypto.expanded ? 'expanded-content' : 'collapsed-content'}`}>
                  <div className="pt-6 border-t border-[#1A1A1A]">
                    <div className="crypto-stats">
                      <div>
                        <p className="text-[#6F767E] text-sm mb-1">Market Cap</p>
                        <p className="text-white font-medium">
                          ${(crypto.marketCap / 1e9).toFixed(2)}B
                        </p>
                      </div>
                      <div>
                        <p className="text-[#6F767E] text-sm mb-1">24h Volume</p>
                        <p className="text-white font-medium">
                          ${(crypto.volume / 1e9).toFixed(2)}B
                        </p>
                      </div>
                    </div>
                    
                    <div className="crypto-analysis mt-4">
                      <p className="text-[#6F767E] text-sm mb-2">AI Analysis</p>
                      <div className="text-[#6F767E] text-sm min-h-[60px]">
                        {crypto.loading ? (
                          <span className="flex items-center gap-2">
                            <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white/20"></span>
                            Generating analysis...
                          </span>
                        ) : crypto.analysis ? (
                          <Typewriter
                            options={{
                              delay: 30,
                              cursor: '',
                            }}
                            onInit={(typewriter) => {
                              typewriter
                                .typeString(crypto.analysis)
                                .start();
                            }}
                          />
                        ) : (
                          "Analysis will be generated when expanded."
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-500 ${activePanel ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setActivePanel(null)} />
          
          <div className={`relative w-full max-w-xl mx-4 transition-all duration-500 ${activePanel === 'wallet' ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
            <div className="backdrop-blur-xl bg-white/[0.02] p-8 rounded-3xl border border-white/[0.05] shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Enter Solana Wallet Address</h2>
                <button 
                  onClick={() => setActivePanel(null)}
                  className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
              <form onSubmit={handleWalletSubmit} className="space-y-4">
                <input
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  placeholder="Solana Wallet Address"
                  className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.05] rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/10 transition-all"
                />
                <button
                  type="submit"
                  className="w-full px-6 py-3 bg-white text-black rounded-xl font-medium hover:shadow-[0_0_30px_rgba(255,255,255,0.2)] hover:scale-[1.02] transition-all duration-300"
                >
                  Analyze Wallet
                </button>
              </form>
            </div>
          </div>

          <div className={`relative w-full max-w-xl mx-4 transition-all duration-500 ${activePanel === 'token' ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}`}>
            <div className="backdrop-blur-xl bg-white/[0.02] p-8 rounded-3xl border border-white/[0.05] shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Token Analysis</h2>
                <button 
                  onClick={() => setActivePanel(null)}
                  className="p-2 hover:bg-white/[0.05] rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-white" />
                </button>
              </div>
              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Timer className="w-16 h-16 text-white/30 mx-auto mb-4 animate-pulse" />
                  <p className="text-xl text-white font-medium">Coming Soon</p>
                  <p className="text-white/50 mt-2">Token analysis feature is under development</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/wallet/:address" element={<WalletAnalyzer />} />
      </Routes>
    </Router>
  );
}

export default App;