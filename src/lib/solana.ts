import { Connection, PublicKey, ParsedTransactionWithMeta, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from './logger';
import { heliusAPI, HeliusTransaction } from './helius';
import bs58 from 'bs58';

interface TokenAccountInfo {
  mint: string;
  owner: string;
  amount: number;
  decimals: number;
  symbol?: string;
  name?: string;
  logo?: string;
}

interface ProcessedTransaction {
  signature: string;
  type: string;
  amount: number;
  timestamp: number;
  status: 'success' | 'error';
  tokenSymbol?: string;
  fee?: number;
  description?: string;
}

class SolanaConnectionManager {
  private static instance: SolanaConnectionManager;
  private connection: Connection;

  private constructor() {
    this.connection = new Connection(heliusAPI.getRpcUrl(), {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
  }

  static getInstance(): SolanaConnectionManager {
    if (!SolanaConnectionManager.instance) {
      SolanaConnectionManager.instance = new SolanaConnectionManager();
    }
    return SolanaConnectionManager.instance;
  }

  private processTransaction(tx: HeliusTransaction, walletAddress: string): ProcessedTransaction | null {
    try {
      const MIN_SOL_AMOUNT = 0.001; // Minimum SOL amount to consider
      const MIN_USD_VALUE = 1; // Minimum USD value to consider

      let type = tx.type || 'Unknown';
      let amount = 0;
      let tokenSymbol = 'SOL';
      let description = '';

      // Process native SOL transfers
      if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
        const transfer = tx.nativeTransfers[0];
        amount = transfer.amount / LAMPORTS_PER_SOL;

        if (transfer.fromUserAccount === walletAddress) {
          type = 'Send SOL';
          description = `Sent ${amount.toFixed(3)} SOL`;
        } else if (transfer.toUserAccount === walletAddress) {
          type = 'Receive SOL';
          description = `Received ${amount.toFixed(3)} SOL`;
        }
      }

      // Process token transfers
      if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        const transfer = tx.tokenTransfers[0];
        amount = transfer.amount;
        tokenSymbol = 'Token';

        if (transfer.fromUserAccount === walletAddress) {
          type = 'Send Token';
          description = `Sent ${amount} ${tokenSymbol}`;
        } else if (transfer.toUserAccount === walletAddress) {
          type = 'Receive Token';
          description = `Received ${amount} ${tokenSymbol}`;
        }
      }

      // Check for swaps
      const txString = JSON.stringify(tx).toLowerCase();
      if (txString.includes('swap') || txString.includes('jupiter') || txString.includes('orca')) {
        type = 'Swap';
        description = 'Token Swap';
      }

      // Filter out small transactions
      if (tokenSymbol === 'SOL' && amount < MIN_SOL_AMOUNT) {
        return null;
      }

      // Skip transactions with no meaningful amount
      if (amount === 0) {
        return null;
      }

      return {
        signature: tx.signature || '',
        type,
        amount,
        timestamp: tx.timestamp || Date.now(),
        status: 'success',
        tokenSymbol,
        fee: tx.fee || 0,
        description
      };
    } catch (error) {
      logger.error('Error processing transaction:', error);
      return null;
    }
  }

  async getBalance(address: string): Promise<number> {
    try {
      const pubKey = new PublicKey(address);
      const balance = await this.connection.getBalance(pubKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.error('Error fetching balance', { error: error instanceof Error ? error.message : 'Unknown error', address });
      throw new Error('Failed to fetch balance');
    }
  }

  async getTokenAccounts(address: string): Promise<TokenAccountInfo[]> {
    try {
      const pubKey = new PublicKey(address);
      
      // First try using getParsedTokenAccountsByOwner
      try {
        const response = await this.connection.getParsedTokenAccountsByOwner(
          pubKey,
          { programId: TOKEN_PROGRAM_ID },
          'confirmed'
        );

        if (!response?.value?.length) {
          logger.debug('No token accounts found using getParsedTokenAccountsByOwner', { address });
          return [];
        }

        const tokenAccounts = response.value
          .filter(account => {
            const info = account.account.data.parsed?.info;
            return info && info.tokenAmount?.uiAmount > 0;
          })
          .map(account => {
            const info = account.account.data.parsed.info;
            return {
              mint: info.mint,
              owner: info.owner,
              amount: info.tokenAmount.uiAmount,
              decimals: info.tokenAmount.decimals
            };
          });

        // Fetch metadata for all mints
        const mints = tokenAccounts.map(account => account.mint);
        const metadata = await heliusAPI.getTokenMetadata(mints);
        
        // Create a map of mint to metadata
        const metadataMap = new Map(metadata.map(m => [m.mint, m]));

        // Enhance token accounts with metadata
        return tokenAccounts.map(account => {
          const meta = metadataMap.get(account.mint);
          return {
            ...account,
            symbol: meta?.symbol || 'Unknown',
            name: meta?.name || 'Unknown Token',
            logo: meta?.logoURI
          };
        });
      } catch (error) {
        logger.error('Error using getParsedTokenAccountsByOwner', { 
          error: error instanceof Error ? error.message : 'Unknown error',
          address 
        });
        
        // Fallback to getTokenAccountsByOwner
        const response = await this.connection.getTokenAccountsByOwner(
          pubKey,
          { programId: TOKEN_PROGRAM_ID },
          'confirmed'
        );

        if (!response?.value?.length) {
          logger.debug('No token accounts found using getTokenAccountsByOwner', { address });
          return [];
        }

        const tokenAccounts = await Promise.all(
          response.value.map(async ({ pubkey, account }) => {
            try {
              const accountInfo = await this.connection.getParsedAccountInfo(pubkey);
              const parsedInfo = (accountInfo.value?.data as any)?.parsed?.info;
              
              if (!parsedInfo || !parsedInfo.tokenAmount?.uiAmount) {
                return null;
              }

              return {
                mint: parsedInfo.mint,
                owner: parsedInfo.owner,
                amount: parsedInfo.tokenAmount.uiAmount,
                decimals: parsedInfo.tokenAmount.decimals
              };
            } catch (error) {
              logger.error('Error parsing token account', {
                error: error instanceof Error ? error.message : 'Unknown error',
                pubkey: pubkey.toBase58()
              });
              return null;
            }
          })
        );

        const validAccounts = tokenAccounts.filter((account): account is TokenAccountInfo => 
          account !== null && account.amount > 0
        );

        // Fetch metadata for valid accounts
        const mints = validAccounts.map(account => account.mint);
        const metadata = await heliusAPI.getTokenMetadata(mints);
        
        // Create a map of mint to metadata
        const metadataMap = new Map(metadata.map(m => [m.mint, m]));

        // Enhance token accounts with metadata
        return validAccounts.map(account => {
          const meta = metadataMap.get(account.mint);
          return {
            ...account,
            symbol: meta?.symbol || 'Unknown',
            name: meta?.name || 'Unknown Token',
            logo: meta?.logoURI
          };
        });
      }
    } catch (error) {
      logger.error('Error fetching token accounts', { 
        error: error instanceof Error ? error.message : 'Unknown error',
        address 
      });
      throw new Error('Failed to fetch token accounts');
    }
  }

  async getTransactions(address: string, limit = 20): Promise<ProcessedTransaction[]> {
    try {
      const txs = await heliusAPI.getTransactionHistory(address, limit);
      const processedTxs = txs
        .map(tx => this.processTransaction(tx, address))
        .filter((tx): tx is ProcessedTransaction => tx !== null)
        .sort((a, b) => b.timestamp - a.timestamp);

      return processedTxs;
    } catch (error) {
      logger.error('Error fetching transactions', {
        error: error instanceof Error ? error.message : 'Unknown error',
        address
      });
      throw new Error('Failed to fetch transactions');
    }
  }

  async getTransactionDetails(signature: string) {
    try {
      return await heliusAPI.parseTransaction(signature);
    } catch (error) {
      logger.error('Error fetching transaction details', {
        error: error instanceof Error ? error.message : 'Unknown error',
        signature
      });
      throw new Error('Failed to fetch transaction details');
    }
  }
}

export const solanaManager = SolanaConnectionManager.getInstance();
