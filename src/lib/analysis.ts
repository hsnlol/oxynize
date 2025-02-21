import OpenAI from 'openai';
import { logger } from './logger';
import { HeliusTransaction } from './helius';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true
});

class TransactionAnalyzer {
  private static instance: TransactionAnalyzer;

  private constructor() {}

  static getInstance(): TransactionAnalyzer {
    if (!TransactionAnalyzer.instance) {
      TransactionAnalyzer.instance = new TransactionAnalyzer();
    }
    return TransactionAnalyzer.instance;
  }

  private isTradeTransaction(tx: HeliusTransaction): boolean {
    if (!tx) return false;

    const type = tx.type?.toLowerCase() || '';
    const description = JSON.stringify(tx).toLowerCase();

    // Check for common DEX and trading patterns
    const tradePatterns = [
      'swap',
      'trade',
      'exchange',
      'jupiter',
      'orca',
      'raydium',
      'serum',
      'dex',
      'amm',
      'liquidity',
      'pool',
      'market'
    ];

    // Check if any trade pattern exists in type or full transaction description
    const hasTradePattern = tradePatterns.some(pattern => 
      type.includes(pattern) || description.includes(pattern)
    );

    // Check for token or SOL transfers
    const hasTransfers = (
      (tx.nativeTransfers?.length > 0) ||
      (tx.tokenTransfers?.length > 0)
    );

    // Check account data for balance changes
    const hasBalanceChanges = tx.accountData?.some(account => 
      account.nativeBalanceChange !== 0 || account.tokenBalanceChanges?.length > 0
    );

    return hasTradePattern || (hasTransfers && hasBalanceChanges);
  }

  private classifyTradeType(tx: HeliusTransaction): 'buy' | 'sell' | 'unknown' {
    if (!tx) return 'unknown';

    const type = tx.type?.toLowerCase() || '';
    const description = JSON.stringify(tx).toLowerCase();

    // Direct indicators in transaction type
    if (type.includes('buy') || type.includes('swap_in')) return 'buy';
    if (type.includes('sell') || type.includes('swap_out')) return 'sell';

    // Check native transfers
    if (tx.nativeTransfers?.length > 0) {
      const totalNativeOut = tx.nativeTransfers.reduce((sum, transfer) => {
        // If this wallet is sending SOL, it's likely a buy of tokens
        if (transfer.fromUserAccount === tx.source) {
          return sum + transfer.amount;
        }
        return sum;
      }, 0);

      if (totalNativeOut > 0) return 'buy';
    }

    // Check token transfers
    if (tx.tokenTransfers?.length > 0) {
      const totalTokensOut = tx.tokenTransfers.reduce((sum, transfer) => {
        // If this wallet is sending tokens, it's likely a sell
        if (transfer.fromUserAccount === tx.source) {
          return sum + transfer.amount;
        }
        return sum;
      }, 0);

      if (totalTokensOut > 0) return 'sell';
    }

    // Check for common patterns in the full transaction data
    if (description.includes('swap_exact_tokens_for_tokens') || 
        description.includes('swap_exact_sol_for_tokens')) {
      return 'buy';
    }
    if (description.includes('swap_exact_tokens_for_sol') || 
        description.includes('swap_tokens_for_exact_sol')) {
      return 'sell';
    }

    return 'unknown';
  }

  private calculateTradeValue(tx: HeliusTransaction): number {
    if (!tx) return 0;

    let value = 0;

    // Add up native transfers
    if (tx.nativeTransfers?.length > 0) {
      value += tx.nativeTransfers.reduce((sum, transfer) => sum + (transfer.amount || 0), 0);
    }

    // Add up token transfers
    if (tx.tokenTransfers?.length > 0) {
      value += tx.tokenTransfers.reduce((sum, transfer) => sum + (transfer.amount || 0), 0);
    }

    // Check account data for additional value changes
    if (tx.accountData?.length > 0) {
      const balanceChanges = tx.accountData.reduce((sum, account) => {
        let change = account.nativeBalanceChange || 0;
        
        // Add token balance changes
        if (account.tokenBalanceChanges?.length > 0) {
          change += account.tokenBalanceChanges.reduce((tokenSum, token) => 
            tokenSum + Math.abs(token.amount), 0
          );
        }
        
        return sum + Math.abs(change);
      }, 0);

      // Use the larger value between transfers and balance changes
      value = Math.max(value, balanceChanges);
    }

    return value;
  }

  async analyzeBatch(transactions: HeliusTransaction[]): Promise<string> {
    try {
      // Filter and analyze trading activity
      const trades = transactions
        .filter(tx => this.isTradeTransaction(tx))
        .map(tx => ({
          type: this.classifyTradeType(tx),
          value: this.calculateTradeValue(tx),
          timestamp: tx.timestamp,
          originalType: tx.type
        }));

      // Calculate trading metrics
      const buyCount = trades.filter(t => t.type === 'buy').length;
      const sellCount = trades.filter(t => t.type === 'sell').length;
      const totalTrades = trades.length;
      const averageTradeValue = trades.reduce((sum, t) => sum + t.value, 0) / totalTrades || 0;

      // Sort trades by timestamp for pattern analysis
      const sortedTrades = trades.sort((a, b) => b.timestamp - a.timestamp);

      const prompt = `
        Analyze this wallet's trading activity:
        
        Trading Summary:
        - Total trades identified: ${totalTrades}
        - Buy transactions: ${buyCount}
        - Sell transactions: ${sellCount}
        - Average trade value: ${averageTradeValue.toFixed(2)} SOL
        
        Recent Trades:
        ${sortedTrades.slice(0, 5).map(t => 
          `- ${t.originalType} (${t.type}): ${t.value.toFixed(2)} SOL`
        ).join('\n')}
        
        Trading Patterns:
        - Buy/Sell ratio: ${buyCount}:${sellCount}
        - Trading frequency: ${totalTrades} trades in recent history
        
        Based on this data, provide a concise analysis of:
        1. Trading strategy and patterns
        2. Risk management approach
        3. Potential profitability indicators
        4. Recent trading decisions
        
        Focus on concrete observations about trading behavior and profitability.
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a trading expert analyzing wallet activity. Focus on concrete trading patterns and profitability indicators. Be specific about trading behavior observed and avoid generic statements. If there are few or no trades, explicitly state this and what it indicates about the wallet's activity."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 200,
        temperature: 0.7
      });

      return response.choices[0].message.content || "Unable to analyze transactions";
    } catch (error) {
      logger.error('Error analyzing transactions:', error);
      return "Batch analysis unavailable";
    }
  }

  async analyzeTransaction(tx: HeliusTransaction): Promise<string> {
    try {
      const isTrade = this.isTradeTransaction(tx);
      const tradeType = this.classifyTradeType(tx);
      const value = this.calculateTradeValue(tx);
      
      const prompt = `
        Analyze this Solana transaction:
        Type: ${tx.type}
        Trade Classification: ${isTrade ? `${tradeType} trade` : 'non-trade transaction'}
        Value: ${value} SOL
        Fee: ${tx.fee} SOL
        
        ${tx.nativeTransfers?.length ? 
          `SOL Transfers: ${tx.nativeTransfers.map(t => 
            `${t.amount} SOL from ${t.fromUserAccount.slice(0, 4)}... to ${t.toUserAccount.slice(0, 4)}...`
          ).join(', ')}` : ''
        }
        
        ${tx.tokenTransfers?.length ? 
          `Token Transfers: ${tx.tokenTransfers.map(t => 
            `${t.amount} tokens from ${t.fromUserAccount.slice(0, 4)}... to ${t.toUserAccount.slice(0, 4)}...`
          ).join(', ')}` : ''
        }
        
        Provide a brief analysis of this transaction's trading implications and potential impact on portfolio value.
      `;
      
      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a Solana blockchain expert focusing on trading activity and profitability analysis. Keep responses brief and focused on buys, sells, and their impact."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 100,
        temperature: 0.7
      });

      return response.choices[0].message.content || "Unable to analyze transaction";
    } catch (error) {
      logger.error('Error analyzing transaction:', error);
      return "Analysis unavailable";
    }
  }
}

export const transactionAnalyzer = TransactionAnalyzer.getInstance();