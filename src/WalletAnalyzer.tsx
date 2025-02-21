import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PublicKey } from '@solana/web3.js';
import { 
  ArrowLeft, Wallet, Coins, History, 
  TrendingUp, TrendingDown, Activity, Box, Brain
} from 'lucide-react';
import { format } from 'date-fns';
import Typewriter from 'typewriter-effect';
import { logger } from './lib/logger';
import { solanaManager } from './lib/solana';
import { priceManager } from './lib/price';
import { transactionAnalyzer } from './lib/analysis';
import { HeliusTransaction } from './lib/helius';

interface TokenBalance {
  mint: string;
  amount: number;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  value: number;
  decimals: number;
  logo?: string;
}

interface Transaction {
  signature: string;
  type: string;
  amount: number;
  timestamp: number;
  status: 'success' | 'error';
  tokenSymbol?: string;
  fee?: number;
  description?: string;
}

interface EnhancedTransaction extends Transaction {
  analysis?: string;
}

const WalletAnalyzer: React.FC = () => {
  const navigate = useNavigate();
  const { address } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [solBalance, setSolBalance] = useState(0);
  const [solPrice, setSolPrice] = useState(0);
  const [solChange, setSolChange] = useState(0);
  const [tokens, setTokens] = useState<TokenBalance[]>([]);
  const [transactions, setTransactions] = useState<EnhancedTransaction[]>([]);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [portfolioChange, setPortfolioChange] = useState(0);
  const [activeTab, setActiveTab] = useState<'overview' | 'tokens' | 'transactions'>('overview');
  const [activityAnalysis, setActivityAnalysis] = useState<string>('');
  const [analyzingTransactions, setAnalyzingTransactions] = useState(false);

  useEffect(() => {
    const fetchWalletData = async () => {
      if (!address) return;

      try {
        setLoading(true);
        setError(null);

        // Validate address
        try {
          new PublicKey(address);
        } catch (e) {
          throw new Error('Invalid wallet address');
        }

        // Fetch SOL price
        const { price: currentSolPrice, change24h } = await priceManager.getSolanaPrice();
        setSolPrice(currentSolPrice);
        setSolChange(change24h);

        // Fetch SOL balance
        const balance = await solanaManager.getBalance(address);
        setSolBalance(balance);

        // Fetch token accounts
        const tokenAccounts = await solanaManager.getTokenAccounts(address);
        setTokens(tokenAccounts);

        // Calculate portfolio value
        const solValue = balance * currentSolPrice;
        const tokenValue = tokenAccounts.reduce((acc, token) => acc + (token.value || 0), 0);
        const totalValue = solValue + tokenValue;
        setPortfolioValue(totalValue);
        setPortfolioChange(change24h);

        setLoading(false);
      } catch (err) {
        logger.error('Error in fetchWalletData:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch wallet data');
        setLoading(false);
        setAnalyzingTransactions(false);
      }
    };

    fetchWalletData();
  }, [address]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-xl mb-4">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-white text-black rounded-xl hover:scale-105 transition-transform"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const solValue = solBalance * solPrice;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-white/70 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Home
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <div className="col-span-2">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold mb-2">Wallet Analysis</h1>
                <p className="text-white/70 flex items-center gap-2">
                  <Wallet className="w-4 h-4" />
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold">${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                <p className={`flex items-center gap-1 justify-end ${
                  portfolioChange >= 0 ? 'text-green-500' : 'text-red-500'
                }`}>
                  {portfolioChange >= 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {Math.abs(portfolioChange).toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/[0.02] rounded-3xl border border-white/[0.05] p-6 mb-6">
              <h3 className="text-xl font-semibold mb-4">Portfolio Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 bg-white/[0.02] rounded-xl">
                    <h4 className="text-lg font-medium mb-2">Total Value</h4>
                    <p className="text-2xl font-bold">${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl">
                    <h4 className="text-lg font-medium mb-2">SOL Holdings</h4>
                    <p className="text-2xl font-bold">{solBalance.toFixed(2)} SOL</p>
                    <p className="text-sm text-white/50">${solValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-white/[0.02] rounded-xl">
                    <h4 className="text-lg font-medium mb-2">Token Count</h4>
                    <p className="text-2xl font-bold">{tokens.length}</p>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl">
                    <h4 className="text-lg font-medium mb-2">Transaction Count</h4>
                    <p className="text-2xl font-bold">{transactions.length}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="backdrop-blur-xl bg-white/[0.02] rounded-3xl border border-white/[0.05] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">AI Analysis</h3>
                <Brain className="w-5 h-5 text-white/50" />
              </div>
              {analyzingTransactions ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                </div>
              ) : (
                <div className="p-4 bg-white/[0.02] rounded-xl">
                  <div className="text-white/70">
                    <Typewriter
                      options={{
                        delay: 30,
                        cursor: '',
                      }}
                      onInit={(typewriter) => {
                        typewriter
                          .typeString(activityAnalysis || "Click the Transactions tab to analyze wallet activity")
                          .start();
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-1 space-y-6">
            {/* Recent Activity Box */}
            <div className="backdrop-blur-xl bg-white/[0.02] rounded-3xl border border-white/[0.05] p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">Recent Activity</h3>
                <Activity className="w-5 h-5 text-white/50" />
              </div>
              <div className="space-y-4">
                {transactions.slice(0, 5).map((tx) => (
                  <div 
                    key={tx.signature}
                    className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl hover:bg-white/[0.05] transition-colors"
                  >
                    <div>
                      <p className="font-medium">{tx.type}</p>
                      <p className="text-sm text-white/50">
                        {format(new Date(tx.timestamp), 'MMM dd HH:mm')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {tx.amount} {tx.tokenSymbol || 'SOL'}
                      </p>
                      <p className={`text-sm ${
                        tx.status === 'success' ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {tx.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 rounded-xl transition-all ${
              activeTab === 'overview'
                ? 'bg-white text-black'
                : 'bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setActiveTab('tokens')}
            className={`px-6 py-3 rounded-xl transition-all ${
              activeTab === 'tokens'
                ? 'bg-white text-black'
                : 'bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            Tokens
          </button>
          <button
            onClick={async () => {
              setActiveTab('transactions');
              if (transactions.length === 0) {
                setAnalyzingTransactions(true);
                try {
                  // Fetch transactions only when clicking the Transactions tab
                  const txs = await solanaManager.getTransactions(address!);
                  const batchAnalysis = await transactionAnalyzer.analyzeBatch(txs);
                  setActivityAnalysis(batchAnalysis);

                  const processedTransactions = txs.map((tx) => ({
                    signature: tx.signature || '',
                    type: tx.type || 'Unknown',
                    amount: tx.nativeTransfers?.[0]?.amount || 0,
                    timestamp: tx.timestamp || Date.now(),
                    status: 'success' as const,
                    tokenSymbol: tx.tokenTransfers?.[0]?.mint ? 'Token' : 'SOL',
                    fee: tx.fee || 0
                  }));

                  setTransactions(processedTransactions);
                } catch (error) {
                  logger.error('Error fetching transactions:', error);
                }
                setAnalyzingTransactions(false);
              }
            }}
            className={`px-6 py-3 rounded-xl transition-all ${
              activeTab === 'transactions'
                ? 'bg-white text-black'
                : 'bg-white/[0.02] hover:bg-white/[0.05]'
            }`}
          >
            Transactions
          </button>
        </div>

        <div className="backdrop-blur-xl bg-white/[0.02] rounded-3xl border border-white/[0.05] p-6">
          {activeTab === 'overview' && (
            <div>
              <h3 className="text-xl font-semibold mb-4">Portfolio Overview</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-4 bg-white/[0.02] rounded-xl">
                    <h4 className="text-lg font-medium mb-2">Total Value</h4>
                    <p className="text-2xl font-bold">${portfolioValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl">
                    <h4 className="text-lg font-medium mb-2">SOL Holdings</h4>
                    <p className="text-2xl font-bold">{solBalance.toFixed(2)} SOL</p>
                    <p className="text-sm text-white/50">${solValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="p-4 bg-white/[0.02] rounded-xl">
                    <h4 className="text-lg font-medium mb-2">Token Count</h4>
                    <p className="text-2xl font-bold">{tokens.length}</p>
                  </div>
                  <div className="p-4 bg-white/[0.02] rounded-xl">
                    <h4 className="text-lg font-medium mb-2">Transaction Count</h4>
                    <p className="text-2xl font-bold">{transactions.length}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tokens' && (
            <div>
              <h3 className="text-xl font-semibold mb-4">Token Holdings</h3>
              <div className="space-y-4">
                {tokens.map((token) => (
                  <div
                    key={token.mint}
                    className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {token.logo ? (
                        <img src={token.logo} alt={token.symbol} className="w-8 h-8 rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-white/[0.1] flex items-center justify-center">
                          <span className="text-xs">{token.symbol.slice(0, 2)}</span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{token.name}</p>
                        <p className="text-sm text-white/50">{token.symbol}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{token.amount.toLocaleString()} {token.symbol}</p>
                      <p className="text-sm text-white/50">${(token.value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div>
              <h3 className="text-xl font-semibold mb-4">Transaction History</h3>
              <div className="space-y-4">
                {transactions.map((tx) => (
                  <div
                    key={tx.signature}
                    className="flex items-center justify-between p-4 bg-white/[0.02] rounded-xl hover:bg-white/[0.05] transition-colors"
                  >
                    <div>
                      <p className="font-medium">{tx.type}</p>
                      <p className="text-sm text-white/50">
                        {format(new Date(tx.timestamp), 'MMM dd HH:mm')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">
                        {tx.amount} {tx.tokenSymbol || 'SOL'}
                      </p>
                      <p className={`text-sm ${
                        tx.status === 'success' ? 'text-green-500' : 'text-red-500'
                      }`}>
                        {tx.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletAnalyzer;
