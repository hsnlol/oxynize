import { logger } from './logger';

interface CoinGeckoPrice {
  solana: {
    usd: number;
    usd_24h_change: number;
  };
}

class PriceManager {
  private static instance: PriceManager;
  private cache: Map<string, { price: number; change24h: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute
  private retryCount = 0;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  private constructor() {}

  static getInstance(): PriceManager {
    if (!PriceManager.instance) {
      PriceManager.instance = new PriceManager();
    }
    return PriceManager.instance;
  }

  private async fetchWithRetry(url: string): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let i = 0; i <= this.MAX_RETRIES; i++) {
      try {
        const response = await fetch(url, {
          headers: {
            'Accept': 'application/json',
            'Cache-Control': 'no-cache'
          },
          mode: 'cors'
        });
        
        if (response.status === 429) { // Rate limit
          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter ? parseInt(retryAfter) * 1000 : this.RETRY_DELAY;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Network error');
        if (i < this.MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY * Math.pow(2, i)));
        }
      }
    }
    
    throw lastError || new Error('Failed to fetch after retries');
  }

  async getSolanaPrice(): Promise<{ price: number; change24h: number }> {
    try {
      // Check cache first
      const cached = this.cache.get('solana');
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return { price: cached.price, change24h: cached.change24h };
      }

      // Try primary endpoint (CoinGecko)
      try {
        const response = await this.fetchWithRetry(
          'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true'
        );

        if (response.ok) {
          const data = await response.json() as CoinGeckoPrice;
          
          if (data.solana && typeof data.solana.usd === 'number') {
            const price = data.solana.usd;
            const change24h = data.solana.usd_24h_change || 0;

            this.cache.set('solana', { price, change24h, timestamp: Date.now() });
            this.retryCount = 0;
            return { price, change24h };
          }
        }
      } catch (primaryError) {
        logger.warn('CoinGecko endpoint failed, trying Jupiter:', primaryError);
      }

      // Try first backup (Jupiter)
      try {
        const response = await this.fetchWithRetry(
          'https://price.jup.ag/v4/price?ids=SOL'
        );

        if (response.ok) {
          const data = await response.json();
          if (data.data?.SOL?.price) {
            const price = data.data.SOL.price;
            const change24h = cached?.change24h || 0;

            this.cache.set('solana', { price, change24h, timestamp: Date.now() });
            return { price, change24h };
          }
        }
      } catch (jupiterError) {
        logger.warn('Jupiter endpoint failed, trying Binance:', jupiterError);
      }

      // Try second backup (Binance)
      try {
        const response = await this.fetchWithRetry(
          'https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT'
        );

        if (response.ok) {
          const data = await response.json();
          if (data.lastPrice && data.priceChangePercent) {
            const price = parseFloat(data.lastPrice);
            const change24h = parseFloat(data.priceChangePercent);

            this.cache.set('solana', { price, change24h, timestamp: Date.now() });
            return { price, change24h };
          }
        }
      } catch (binanceError) {
        logger.error('All price endpoints failed:', binanceError);
      }

      // If we have cached data, use it even if expired
      if (cached) {
        logger.info('Using cached price data');
        return { price: cached.price, change24h: cached.change24h };
      }

      // Final fallback
      return { price: 100, change24h: 0 };
    } catch (error) {
      logger.error('Error in getSolanaPrice:', error);
      
      // If we have cached data, use it even if expired
      const cached = this.cache.get('solana');
      if (cached) {
        logger.info('Using cached price data after error');
        return { price: cached.price, change24h: cached.change24h };
      }

      // Absolute fallback
      return { price: 100, change24h: 0 };
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

export const priceManager = PriceManager.getInstance();
