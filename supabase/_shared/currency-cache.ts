/**
 * Currency Rate Caching Utility
 * Provides in-memory caching for currency conversion rates with TTL
 */

interface CurrencyRate {
  currency_id: string;
  usd_price: number;
  cached_at: number;
  ttl: number; // Time to live in milliseconds
}

class CurrencyCache {
  private cache = new Map<string, CurrencyRate>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100;

  /**
   * Get currency rate from cache or fetch from database
   */
  async getCurrencyRate(
    supabase: any,
    currencyId: string,
    ttl: number = this.DEFAULT_TTL
  ): Promise<{ success: boolean; rate?: number; error?: string }> {
    try {
      // Check cache first
      const cached = this.cache.get(currencyId);
      if (cached && this.isValid(cached)) {
        return { success: true, rate: cached.usd_price };
      }

      // Fetch from database
      const { data: currency, error } = await supabase
        .from("currencies")
        .select("usd_price")
        .eq("currency_id", currencyId)
        .single();

      if (error || !currency) {
        return { success: false, error: "Currency not found" };
      }

      // Cache the result
      this.setCache(currencyId, currency.usd_price, ttl);

      return { success: true, rate: currency.usd_price };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Convert amount from any currency to USD
   */
  async convertToUSD(
    supabase: any,
    currencyId: string,
    amount: number
  ): Promise<{ success: boolean; usdAmount?: number; error?: string }> {
    // Skip conversion for USD
    if (currencyId === "USD") {
      return { success: true, usdAmount: amount };
    }

    const rateResult = await this.getCurrencyRate(supabase, currencyId);
    if (!rateResult.success || rateResult.rate === undefined) {
      return { success: false, error: rateResult.error };
    }

    const usdAmount = rateResult.rate * amount;
    return { success: true, usdAmount };
  }

  /**
   * Check if cached rate is still valid
   */
  private isValid(cached: CurrencyRate): boolean {
    return Date.now() - cached.cached_at < cached.ttl;
  }

  /**
   * Set currency rate in cache
   */
  private setCache(currencyId: string, usdPrice: number, ttl: number): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(currencyId, {
      currency_id: currencyId,
      usd_price: usdPrice,
      cached_at: Date.now(),
      ttl,
    });
  }

  /**
   * Clear expired entries from cache
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.cached_at >= value.ttl) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }
}

// Global cache instance
export const currencyCache = new CurrencyCache();

// Cleanup expired entries every minute
setInterval(() => {
  currencyCache.cleanup();
}, 60 * 1000);

export { CurrencyCache };
