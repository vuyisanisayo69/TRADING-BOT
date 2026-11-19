/**
 * Apex Trader AI - Price Alert Engine
 * Evaluates real-time price tick crossings, proximity alerts,
 * and maintains alert state transitions.
 */

export type AlertCondition = 'CROSSES_ABOVE' | 'CROSSES_BELOW' | 'REACHES';
export type AlertStatus = 'ACTIVE' | 'TRIGGERED' | 'DISABLED';

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  condition: AlertCondition;
  status: AlertStatus;
  note: string;
  createdAt: number;
  triggeredAt?: number;
  triggeredPrice?: number;
  oneShot: boolean; // if true, disables after first trigger
  tolerancePoints?: number; // for 'REACHES' condition
}

/**
 * Pure evaluation function for a price tick transition
 */
export function evaluateAlertTrigger(
  alert: PriceAlert,
  currentPrice: number,
  prevPrice: number
): { triggered: boolean; reason?: string } {
  if (alert.status !== 'ACTIVE') {
    return { triggered: false };
  }

  const target = alert.targetPrice;
  let tolerance = alert.tolerancePoints;
  if (tolerance === undefined) {
    if (alert.symbol.includes('BTC')) {
      tolerance = 15.0;
    } else if (alert.symbol.includes('XAU')) {
      tolerance = 0.35;
    } else if (alert.symbol.includes('JPY')) {
      tolerance = 0.03;
    } else {
      tolerance = 0.0002; // Forex (e.g. 2 pips)
    }
  }

  if (alert.condition === 'CROSSES_ABOVE') {
    // Crosses above if previous was below or equal, and current is above
    if (prevPrice <= target && currentPrice >= target) {
      return {
        triggered: true,
        reason: `${alert.symbol} crossed above target price ${target} (Current: ${currentPrice})`,
      };
    }
  } else if (alert.condition === 'CROSSES_BELOW') {
    // Crosses below if previous was above or equal, and current is below
    if (prevPrice >= target && currentPrice <= target) {
      return {
        triggered: true,
        reason: `${alert.symbol} crossed below target price ${target} (Current: ${currentPrice})`,
      };
    }
  } else if (alert.condition === 'REACHES') {
    // Within tolerance zone of target price
    if (Math.abs(currentPrice - target) <= tolerance) {
      return {
        triggered: true,
        reason: `${alert.symbol} reached target level ${target} (Current: ${currentPrice})`,
      };
    }
  }

  return { triggered: false };
}

/**
 * Calculates distance from current price to target price
 */
export function calculateAlertDistance(
  currentPrice: number,
  targetPrice: number,
  pipSize: number = 0.0001
): { distancePoints: number; distancePips: number; distancePercent: number; isAbove: boolean } {
  const diff = targetPrice - currentPrice;
  const distancePoints = Math.abs(diff);
  const distancePips = pipSize > 0 ? distancePoints / pipSize : distancePoints;
  const distancePercent = currentPrice > 0 ? (distancePoints / currentPrice) * 100 : 0;
  const isAbove = targetPrice >= currentPrice;

  return {
    distancePoints: Number(distancePoints.toFixed(5)),
    distancePips: Number(distancePips.toFixed(1)),
    distancePercent: Number(distancePercent.toFixed(2)),
    isAbove,
  };
}

/**
 * Formats unix timestamp in UTC+2 timezone
 */
export function formatTimeUTC2(
  timestampSeconds: number,
  includeSeconds: boolean = false,
  utcOffsetHours: number = 2
): string {
  const date = new Date((timestampSeconds + utcOffsetHours * 3600) * 1000);
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  if (includeSeconds) {
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds} (UTC+2)`;
  }
  return `${hours}:${minutes} (UTC+2)`;
}
