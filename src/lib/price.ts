import { logger } from './logger';

interface CoinGeckoPrice {
  solana: {
    usd: number;
    usd_24h_change: number;
  };
}

class PriceManager {
  private static instance: PriceManager;
  private cache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute

  private constructor() {}

  static getInstance(): PriceManager {
    if (!PriceManager.instance) {
      PriceManager.instance = new PriceManager();
    }
    return PriceManager.instance;
  }

  async getSolanaPrice(): Promise<{ price: number; change24h: number }> {
    try {
      const cached = this.cache.get('solana');
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        return { price: cached.price, change24h: 0 };
      }

      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true'
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json() as CoinGeckoPrice;
      const price = data.solana.usd;
      const change24h = data.solana.usd_24h_change;

      this.cache.set('solana', { price, timestamp: Date.now() });

      return { price, change24h };
    } catch (error) {
      logger.error('Error fetching Solana price:', error);
      // Return a fallback price if the API fails
      return { price: 100, change24h: 0 };
    }
  }
}

export const priceManager = PriceManager.getInstance();