export interface ReportRequest {
  from: string;
  to: string;
  group_by?: "day" | "week" | "month";
}

export interface ChartData {
  merchant_id: string;
  date_range: { from: string; to: string };
  summary: {
    total_completed_orders: number;
    total_required_amount_usd: number;
    total_display_amounts: Record<string, number>;
  };
  charts: {
    daily_trends: DailyTrend[];
    currency_breakdown: CurrencyBreakdown[];
    order_volume: OrderVolume[];
  };
}

export interface DailyTrend {
  date: string;
  orders_count: number;
  usd_amount: number;
  display_amounts: Record<string, number>;
}

export interface CurrencyBreakdown {
  currency: string;
  amount: number;
  percentage: number;
}

export interface OrderVolume {
  date: string;
  count: number;
}

/**
 * Generate dashboard report data for charts
 */
export async function generateDashboardReport(
  supabase: any,
  merchantId: string,
  request: ReportRequest,
): Promise<{ success: boolean; data?: ChartData; error?: string }> {
  try {
    // Validate date range
    const fromDate = new Date(request.from);
    const toDate = new Date(request.to);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return { success: false, error: "Invalid date format" };
    }
    
    if (fromDate > toDate) {
      return { success: false, error: "Invalid date range: 'from' must be before 'to'" };
    }
    
    // Check if date range is too large (max 1 year)
    const daysDiff = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff > 365) {
      return { success: false, error: "Date range cannot exceed 1 year" };
    }

    const fromISO = fromDate.toISOString();
    const toISO = toDate.toISOString();

    // Query 1: Summary data
    const { data: summaryData, error: summaryError } = await supabase
      .from("orders")
      .select("required_amount_usd, display_amount, display_currency")
      .eq("merchant_id", merchantId)
      .eq("status", "COMPLETED")
      .gte("created_at", fromISO)
      .lte("created_at", toISO);

    if (summaryError) {
      return { success: false, error: summaryError.message };
    }

    // Query 2: Daily trends data
    const { data: dailyData, error: dailyError } = await supabase
      .from("orders")
      .select("created_at, required_amount_usd, display_amount, display_currency")
      .eq("merchant_id", merchantId)
      .eq("status", "COMPLETED")
      .gte("created_at", fromISO)
      .lte("created_at", toISO)
      .order("created_at", { ascending: true });

    if (dailyError) {
      return { success: false, error: dailyError.message };
    }

    // Process summary data
    const summary = processSummaryData(summaryData || []);
    
    // Process chart data
    const charts = processChartData(dailyData || [], request.group_by || "day");

    const result: ChartData = {
      merchant_id: merchantId,
      date_range: {
        from: request.from,
        to: request.to,
      },
      summary,
      charts,
    };

    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process summary data from raw order data
 */
function processSummaryData(orders: any[]): ChartData["summary"] {
  const totalCompletedOrders = orders.length;
  const totalRequiredAmountUsd = orders.reduce((sum, order) => sum + (order.required_amount_usd || 0), 0);
  
  const totalDisplayAmounts: Record<string, number> = {};
  orders.forEach(order => {
    const currency = order.display_currency || "USD";
    const amount = order.display_amount || 0;
    totalDisplayAmounts[currency] = (totalDisplayAmounts[currency] || 0) + amount;
  });

  return {
    total_completed_orders: totalCompletedOrders,
    total_required_amount_usd: parseFloat(totalRequiredAmountUsd.toFixed(2)),
    total_display_amounts: totalDisplayAmounts,
  };
}

/**
 * Process chart data from raw order data
 */
function processChartData(orders: any[], groupBy: string): ChartData["charts"] {
  // Group orders by date
  const ordersByDate = new Map<string, any[]>();
  
  orders.forEach(order => {
    const date = new Date(order.created_at);
    let dateKey: string;
    
    switch (groupBy) {
      case "week": {
        // Get start of week (Monday)
        const startOfWeek = new Date(date);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        startOfWeek.setDate(diff);
        dateKey = startOfWeek.toISOString().split('T')[0];
        break;
      }
      case "month": {
        dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
        break;
      }
      default: { // day
        dateKey = date.toISOString().split('T')[0];
        break;
      }
    }
    
    if (!ordersByDate.has(dateKey)) {
      ordersByDate.set(dateKey, []);
    }
    ordersByDate.get(dateKey)!.push(order);
  });

  // Process daily trends
  const dailyTrends: DailyTrend[] = [];
  const orderVolume: OrderVolume[] = [];
  
  for (const [date, dayOrders] of ordersByDate) {
    const ordersCount = dayOrders.length;
    const usdAmount = dayOrders.reduce((sum, order) => sum + (order.required_amount_usd || 0), 0);
    
    const displayAmounts: Record<string, number> = {};
    dayOrders.forEach(order => {
      const currency = order.display_currency || "USD";
      const amount = order.display_amount || 0;
      displayAmounts[currency] = (displayAmounts[currency] || 0) + amount;
    });

    dailyTrends.push({
      date,
      orders_count: ordersCount,
      usd_amount: parseFloat(usdAmount.toFixed(2)),
      display_amounts: displayAmounts,
    });

    orderVolume.push({
      date,
      count: ordersCount,
    });
  }

  // Sort by date
  dailyTrends.sort((a, b) => a.date.localeCompare(b.date));
  orderVolume.sort((a, b) => a.date.localeCompare(b.date));

  // Process currency breakdown
  const currencyBreakdown = processCurrencyBreakdown(orders);

  return {
    daily_trends: dailyTrends,
    currency_breakdown: currencyBreakdown,
    order_volume: orderVolume,
  };
}

/**
 * Process currency breakdown data
 */
function processCurrencyBreakdown(orders: any[]): CurrencyBreakdown[] {
  const currencyTotals: Record<string, number> = {};
  
  orders.forEach(order => {
    const currency = order.display_currency || "USD";
    const amount = order.display_amount || 0;
    currencyTotals[currency] = (currencyTotals[currency] || 0) + amount;
  });

  const totalAmount = Object.values(currencyTotals).reduce((sum, amount) => sum + amount, 0);
  
  if (totalAmount === 0) {
    return [];
  }
  
  const breakdown: CurrencyBreakdown[] = Object.entries(currencyTotals)
    .map(([currency, amount]) => ({
      currency,
      amount: parseFloat(amount.toFixed(2)),
      percentage: parseFloat(((amount / totalAmount) * 100).toFixed(2)),
    }))
    .sort((a, b) => b.amount - a.amount);

  return breakdown;
}
