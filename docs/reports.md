# Reports API Documentation

This document covers the Reports API functionality for generating dashboard and chart data for merchants.

## Overview

The Reports API provides comprehensive analytics and reporting capabilities for merchants to track their order performance, revenue, and trends. It's designed specifically for dashboard and chart visualization, providing pre-aggregated data optimized for frontend charting libraries.

## Features

- **Dashboard Summary**: Total orders, revenue, and currency breakdowns
- **Time-series Data**: Daily, weekly, and monthly trends
- **Multi-currency Support**: Track performance across different currencies
- **Chart-ready Data**: Optimized data structures for popular charting libraries
- **Real-time Analytics**: Up-to-date data with caching for performance

## API Endpoints

### GET /reports/summary

Generates comprehensive dashboard report data for charts and analytics.

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `from` | string | Yes | - | Start date in YYYY-MM-DD format |
| `to` | string | Yes | - | End date in YYYY-MM-DD format |
| `group_by` | string | No | `day` | Grouping period: `day`, `week`, or `month` |

#### Request Example

```bash
GET /reports/summary?from=2024-01-01&to=2024-01-31&group_by=day
Authorization: Bearer <jwt_token>
```

#### Response Structure

```typescript
{
  success: true,
  data: {
    merchant_id: string,
    date_range: {
      from: string,
      to: string
    },
    summary: {
      total_completed_orders: number,
      total_required_amount_usd: number,
      total_display_amounts: {
        [currency: string]: number
      }
    },
    charts: {
      daily_trends: DailyTrend[],
      currency_breakdown: CurrencyBreakdown[],
      order_volume: OrderVolume[]
    }
  }
}
```

#### Data Types

##### DailyTrend
```typescript
interface DailyTrend {
  date: string;           // "2024-01-15"
  orders_count: number;   // 5
  usd_amount: number;     // 150.50
  display_amounts: {      // Multi-currency support
    USD: 100.00,
    MYR: 450.00,
    SGD: 135.00
  };
}
```

##### CurrencyBreakdown
```typescript
interface CurrencyBreakdown {
  currency: string;       // "USD"
  amount: number;         // 1000.00
  percentage: number;     // 45.5
}
```

##### OrderVolume
```typescript
interface OrderVolume {
  date: string;          // "2024-01-15"
  count: number;         // 8
}
```

## Usage Examples

### Basic Dashboard Data

```bash
curl -X GET "https://your-domain.com/functions/v1/reports/summary?from=2024-01-01&to=2024-01-31" \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Weekly Aggregation

```bash
curl -X GET "https://your-domain.com/functions/v1/reports/summary?from=2024-01-01&to=2024-01-31&group_by=week" \
  -H "Authorization: Bearer <your_jwt_token>"
```

### Monthly Trends

```bash
curl -X GET "https://your-domain.com/functions/v1/reports/summary?from=2024-01-01&to=2024-12-31&group_by=month" \
  -H "Authorization: Bearer <your_jwt_token>"
```

## Frontend Integration

### Chart.js Integration

```javascript
// Daily trends for line chart
const lineChartData = {
  labels: data.charts.daily_trends.map(d => d.date),
  datasets: [{
    label: 'Orders Count',
    data: data.charts.daily_trends.map(d => d.orders_count),
    borderColor: 'rgb(75, 192, 192)',
    tension: 0.1
  }, {
    label: 'USD Amount',
    data: data.charts.daily_trends.map(d => d.usd_amount),
    borderColor: 'rgb(255, 99, 132)',
    tension: 0.1
  }]
};

// Currency breakdown for pie chart
const pieChartData = {
  labels: data.charts.currency_breakdown.map(c => c.currency),
  datasets: [{
    data: data.charts.currency_breakdown.map(c => c.amount),
    backgroundColor: [
      '#FF6384',
      '#36A2EB',
      '#FFCE56',
      '#4BC0C0',
      '#9966FF'
    ]
  }]
};

// Order volume for bar chart
const barChartData = {
  labels: data.charts.order_volume.map(v => v.date),
  datasets: [{
    label: 'Order Count',
    data: data.charts.order_volume.map(v => v.count),
    backgroundColor: 'rgba(54, 162, 235, 0.2)',
    borderColor: 'rgba(54, 162, 235, 1)',
    borderWidth: 1
  }]
};
```

### Recharts Integration

```javascript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

// Transform data for Recharts
const rechartsData = data.charts.daily_trends.map(trend => ({
  date: trend.date,
  orders: trend.orders_count,
  usd: trend.usd_amount,
  ...trend.display_amounts
}));

// Line chart component
<LineChart width={800} height={400} data={rechartsData}>
  <CartesianGrid strokeDasharray="3 3" />
  <XAxis dataKey="date" />
  <YAxis />
  <Tooltip />
  <Legend />
  <Line type="monotone" dataKey="orders" stroke="#8884d8" />
  <Line type="monotone" dataKey="usd" stroke="#82ca9d" />
</LineChart>
```

## Error Handling

### Common Error Responses

#### 400 Bad Request
```json
{
  "success": false,
  "error": "Missing required parameters: 'from' and 'to' dates (YYYY-MM-DD format)"
}
```

#### 401 Unauthorized
```json
{
  "success": false,
  "error": "Invalid or expired token"
}
```

#### 403 Forbidden
```json
{
  "success": false,
  "error": "Account blocked due to PIN security violations",
  "code": "PIN_BLOCKED"
}
```

#### 404 Not Found
```json
{
  "success": false,
  "error": "Merchant not found"
}
```

## Validation Rules

### Date Parameters
- **Format**: Must be YYYY-MM-DD
- **Range**: Maximum 1 year between `from` and `to`
- **Logic**: `from` must be before or equal to `to`

### Group By Parameter
- **Valid values**: `day`, `week`, `month`
- **Default**: `day` if not specified

### Authentication
- **Required**: Valid JWT token (Dynamic or Privy)
- **Merchant status**: Must be `ACTIVE` (not `PIN_BLOCKED` or `INACTIVE`)

## Performance Considerations

### Caching
- **Strategy**: In-memory caching with 5-minute TTL
- **Cache key**: `dashboard:${merchantId}:${from}:${to}:${groupBy}`
- **Benefit**: Reduces database load for repeated requests

### Database Optimization
- **Indexes**: `(merchant_id, status, created_at)`
- **Queries**: Optimized aggregation queries
- **Data transfer**: Minimal data transfer with pre-aggregated results

### Rate Limiting
- **Recommendation**: Implement client-side rate limiting
- **Cache utilization**: Use cached data when possible
- **Batch requests**: Combine multiple date ranges when needed

## Security

### Authentication
- **Dual provider support**: Dynamic and Privy authentication
- **Token validation**: JWT signature and expiration verification
- **Merchant isolation**: Data restricted to authenticated merchant only

### Data Privacy
- **Merchant-specific**: Only returns data for authenticated merchant
- **Status validation**: Checks merchant account status before data access
- **Input sanitization**: Validates all input parameters

## Monitoring and Logging

### Metrics to Track
- **Request volume**: Number of report requests per merchant
- **Response times**: Query execution and data processing times
- **Cache hit rates**: Effectiveness of caching strategy
- **Error rates**: Failed requests and error types

### Logging
- **Request details**: Merchant ID, date range, group by parameter
- **Performance metrics**: Query execution time, data processing time
- **Error tracking**: Detailed error messages and stack traces

## Best Practices

### Frontend Implementation
1. **Cache responses**: Store API responses locally for 5 minutes
2. **Debounce requests**: Avoid rapid successive requests
3. **Error handling**: Implement proper error states and retry logic
4. **Loading states**: Show loading indicators during data fetch

### Data Usage
1. **Date ranges**: Use appropriate date ranges for your use case
2. **Grouping**: Choose appropriate grouping based on data density
3. **Currency handling**: Handle multi-currency data properly
4. **Chart updates**: Refresh data periodically for real-time dashboards

### Performance Optimization
1. **Batch requests**: Combine multiple date ranges when possible
2. **Lazy loading**: Load chart data only when needed
3. **Data transformation**: Cache transformed data for charts
4. **Memory management**: Clean up unused chart data

## Troubleshooting

### Common Issues

#### Empty Data
- **Check date range**: Ensure orders exist in the specified date range
- **Verify status**: Only `COMPLETED` orders are included
- **Merchant validation**: Confirm merchant has orders in the system

#### Slow Response Times
- **Date range**: Reduce date range for faster queries
- **Caching**: Check if caching is working properly
- **Database**: Monitor database performance and indexes

#### Authentication Errors
- **Token validity**: Ensure JWT token is not expired
- **Merchant status**: Check if merchant account is active
- **Provider support**: Verify authentication provider configuration

### Debug Mode
Enable debug logging by setting environment variable:
```bash
DEBUG_REPORTS=true
```

This will provide detailed logging of:
- Query execution times
- Data processing steps
- Cache hit/miss information
- Error details and stack traces
