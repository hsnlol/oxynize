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

  async getTransactions(address: string, limit = 20): Promise<HeliusTransaction[]> {
    try {
      return await heliusAPI.getTransactionHistory(address, limit);
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