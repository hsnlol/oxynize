import { logger } from './logger';

const HELIUS_API_KEY = 'fd07d7fa-8da2-42f7-ab25-68253156823a';
const HELIUS_API_URL = 'https://api.helius.xyz/v0';
const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

export interface HeliusTransaction {
  signature: string;
  type: string;
  timestamp: number;
  slot: number;
  fee: number;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    amount: number;
  }>;
  accountData: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      mint: string;
      amount: number;
    }>;
  }>;
}

export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

class HeliusAPI {
  private static instance: HeliusAPI;
  private readonly defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };

  private constructor() {}

  static getInstance(): HeliusAPI {
    if (!HeliusAPI.instance) {
      HeliusAPI.instance = new HeliusAPI();
    }
    return HeliusAPI.instance;
  }

  private async fetchWithTimeout<T>(
    url: string, 
    options: RequestInit,
    timeout = 10000
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Add api-key to URL if not already present
      const urlWithKey = url.includes('api-key') ? url : `${url}${url.includes('?') ? '&' : '?'}api-key=${HELIUS_API_KEY}`;

      const response = await fetch(urlWithKey, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.defaultHeaders,
          ...options.headers
        }
      });

      clearTimeout(timeoutId);

      logger.debug('API Response', {
        url: urlWithKey,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries())
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('API Error Response', {
          url: urlWithKey,
          status: response.status,
          error: errorText
        });

        return {
          success: false,
          data: null,
          error: `HTTP ${response.status}: ${errorText || response.statusText}`
        };
      }

      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        logger.error('JSON Parse Error', { error: e, responseText });
        return {
          success: false,
          data: null,
          error: 'Invalid JSON response'
        };
      }

      if (responseData === undefined || responseData === null) {
        logger.error('Empty Response Data', { responseData });
        return {
          success: false,
          data: null,
          error: 'Empty response received'
        };
      }

      return {
        success: true,
        data: responseData,
        error: null
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            data: null,
            error: `Request timeout after ${timeout}ms`
          };
        }

        logger.error('API Request Error', {
          url,
          error: error.message,
          stack: error.stack
        });

        return {
          success: false,
          data: null,
          error: error.message
        };
      }

      return {
        success: false,
        data: null,
        error: 'Unknown error occurred'
      };
    }
  }

  async getTransactionHistory(address: string, limit = 100): Promise<HeliusTransaction[]> {
    const response = await this.fetchWithTimeout<any>(
      `${HELIUS_API_URL}/transactions`,
      {
        method: 'POST',
        body: JSON.stringify({
          query: {
            accounts: [address]
          },
          options: {
            limit,
            'order': 'desc'
          }
        })
      }
    );

    if (!response.success || !response.data) {
      throw new Error(`Failed to fetch transaction history: ${response.error || 'No data received'}`);
    }

    // Handle both array and object responses
    const transactions = Array.isArray(response.data) ? response.data : response.data.transactions || [];

    if (!Array.isArray(transactions)) {
      logger.error('Invalid Transaction Response', { response });
      throw new Error('Invalid response format: expected array of transactions');
    }

    return transactions;
  }

  async getTokenMetadata(mints: string[]): Promise<TokenMetadata[]> {
    if (!mints.length) {
      return [];
    }

    const response = await this.fetchWithTimeout<TokenMetadata[]>(
      `${HELIUS_API_URL}/token-metadata`,
      {
        method: 'POST',
        body: JSON.stringify({ mintAccounts: mints })
      }
    );

    if (!response.success || !response.data) {
      throw new Error(`Failed to fetch token metadata: ${response.error || 'No data received'}`);
    }

    const metadata = Array.isArray(response.data) ? response.data : response.data.tokens;

    if (!Array.isArray(metadata)) {
      logger.error('Invalid Token Metadata Response', { response });
      throw new Error('Invalid response format: expected array of token metadata');
    }

    return metadata;
  }

  async parseTransaction(signature: string): Promise<any> {
    const response = await this.fetchWithTimeout(
      `${HELIUS_API_URL}/transactions`,
      {
        method: 'POST',
        body: JSON.stringify({
          transactions: [signature]
        })
      }
    );

    if (!response.success || !response.data) {
      throw new Error(`Failed to parse transaction: ${response.error || 'No data received'}`);
    }

    const transactions = Array.isArray(response.data) ? response.data : response.data.transactions;

    if (!Array.isArray(transactions) || !transactions.length) {
      logger.error('Invalid Transaction Parse Response', { response });
      throw new Error('Invalid response format: expected array with transaction data');
    }

    return transactions[0];
  }

  getRpcUrl(): string {
    return HELIUS_RPC_URL;
  }
}

export const heliusAPI = HeliusAPI.getInstance();