import Big from 'big.js';
import {
  EstimateRequest,
  EstimateResponse,
  FulfillmentOptionInput,
  FulfillmentOptionType,
  FulfillmentBand,
  FulfillmentBandResultAmountType,
  OrderItem,
  ValidationResult,
  WeightUnit,
} from './types';

const SUPPORTED_WEIGHT_UNITS: Record<WeightUnit, string> = {
  POUNDS: 'POUNDS',
  KILOGRAMS: 'KILOGRAMS',
  GRAMS: 'GRAMS',
  OUNCES: 'OUNCES',
};

function parseDecimal(value: string): Big {
  return new Big(value);
}

function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isDecimalString(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    parseDecimal(value);
    return true;
  } catch {
    return false;
  }
}

function formatMoney(value: Big): string {
  return value.round(2, 0).toFixed(2);
}

function convertWeight(value: Big, unit: WeightUnit): Big {
  switch (unit) {
    case 'POUNDS':
      return value;
    case 'KILOGRAMS':
      return value.times('2.204622621848');
    case 'GRAMS':
      return value.times('0.002204622621848');
    case 'OUNCES':
      return value.times('0.0625');
    default:
      throw new Error(`Unsupported weight unit: ${unit}`);
  }
}

function validateFulfillmentBand(band: unknown, index: number, errors: string[]): void {
  if (typeof band !== 'object' || band === null) {
    errors.push(`bands[${index}] must be an object`);
    return;
  }

  const maybeBand = band as FulfillmentBand;
  if (!isDecimalString(maybeBand.minimum)) {
    errors.push(`bands[${index}].minimum must be a valid decimal string`);
  }
  if (!isDecimalString(maybeBand.amount)) {
    errors.push(`bands[${index}].amount must be a valid decimal string`);
  }
  if (maybeBand.amountType !== 'RATE' && maybeBand.amountType !== 'PERCENTAGE') {
    errors.push(`bands[${index}].amountType must be RATE or PERCENTAGE`);
  }
}

function validateFulfillmentOption(option: unknown, index: number, errors: string[]): void {
  if (typeof option !== 'object' || option === null) {
    errors.push(`options[${index}] must be an object`);
    return;
  }

  const maybeOption = option as FulfillmentOptionInput;
  if (!maybeOption.id || typeof maybeOption.id !== 'string') {
    errors.push(`options[${index}].id is required`);
  }
  if (maybeOption.type !== 'fixed' && maybeOption.type !== 'bandedPrice' && maybeOption.type !== 'bandedWeight') {
    errors.push(`options[${index}].type must be fixed, bandedPrice, or bandedWeight`);
  }

  if (maybeOption.type === 'fixed') {
    if (!isDecimalString(maybeOption.price)) {
      errors.push(`options[${index}].price is required for fixed fulfillment options`);
    }
  }

  if (maybeOption.type === 'bandedPrice' || maybeOption.type === 'bandedWeight') {
    if (!Array.isArray(maybeOption.bands) || maybeOption.bands.length === 0) {
      errors.push(`options[${index}].bands is required and must contain at least one band`);
    } else {
      maybeOption.bands.forEach((band, bandIndex) => validateFulfillmentBand(band, bandIndex, errors));
    }
  }
}

export function validateEstimateRequest(body: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof body !== 'object' || body === null) {
    return { valid: false, errors: ['Request body must be a JSON object'] };
  }

  const request = body as Record<string, unknown>;

  if (!request.currency || typeof request.currency !== 'string') {
    errors.push('currency is required and must be a string');
  }

  if (!Array.isArray(request.items)) {
    errors.push('items is required and must be an array');
  } else {
    request.items.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) {
        errors.push(`items[${index}] must be an object`);
        return;
      }
      const maybeItem = item as OrderItem;
      if (!isPositiveInteger(maybeItem.quantity)) {
        errors.push(`items[${index}].quantity must be an integer greater than zero`);
      }
      if (maybeItem.price !== undefined && !isDecimalString(maybeItem.price)) {
        errors.push(`items[${index}].price must be a valid decimal string`);
      }
      if (maybeItem.weight !== undefined && !isDecimalString(maybeItem.weight)) {
        errors.push(`items[${index}].weight must be a valid decimal string`);
      }
      if (maybeItem.weightUnit !== undefined && !(maybeItem.weightUnit in SUPPORTED_WEIGHT_UNITS)) {
        errors.push(`items[${index}].weightUnit must be one of ${Object.keys(SUPPORTED_WEIGHT_UNITS).join(', ')}`);
      }
      if (maybeItem.flatRates !== undefined && typeof maybeItem.flatRates !== 'object') {
        errors.push(`items[${index}].flatRates must be an object keyed by option id`);
      } else if (typeof maybeItem.flatRates === 'object' && maybeItem.flatRates !== null) {
        Object.entries(maybeItem.flatRates).forEach(([optionId, rate]) => {
          if (!isDecimalString(rate)) {
            errors.push(`items[${index}].flatRates[${optionId}] must be a valid decimal string`);
          }
        });
      }
    });
  }

  if (!Array.isArray(request.options)) {
    errors.push('options is required and must be an array');
  } else {
    request.options.forEach((option, index) => validateFulfillmentOption(option, index, errors));
  }

  return { valid: errors.length === 0, errors, request: errors.length === 0 ? (request as EstimateRequest) : undefined };
}

function computeFulfillmentOptionPrice(
  option: FulfillmentOptionInput,
  request: EstimateRequest
): string {
  const currency = request.currency;
  const items = request.items;

  if (option.type === 'fixed') {
    return formatMoney(parseDecimal(option.price!));
  }

  const useFlatRates = option.useFlatRates === true;
  const bands = option.bands || [];
  let flatTotal = new Big(0);
  let retailTotal = new Big(0);
  let weightTotal = new Big(0);
  let foundCandidateForBand = false;

  for (const item of items) {
    const flatRateValue = useFlatRates && item.flatRates?.[option.id];
    if (flatRateValue && isDecimalString(flatRateValue)) {
      flatTotal = flatTotal.plus(parseDecimal(flatRateValue));
      continue;
    }

    foundCandidateForBand = true;
    if (option.type === 'bandedPrice') {
      const itemPrice = item.price ? parseDecimal(item.price) : new Big(0);
      retailTotal = retailTotal.plus(itemPrice.times(item.quantity));
    }

    if (option.type === 'bandedWeight') {
      const itemWeight = item.weight ? parseDecimal(item.weight) : new Big(0);
      const weightUnit = item.weightUnit ?? 'POUNDS';
      const convertedWeight = convertWeight(itemWeight, weightUnit as WeightUnit).times(item.quantity);
      weightTotal = weightTotal.plus(convertedWeight);
    }
  }

  let lowestBandPrice: Big | null = null;
  let lowestBandMinimum = new Big(0);

  if (foundCandidateForBand) {
    for (const band of bands) {
      const bandMinimum = parseDecimal(band.minimum);
      const matched =
        option.type === 'bandedPrice'
          ? retailTotal.gte(bandMinimum)
          : weightTotal.gte(bandMinimum);

      if (!matched) {
        continue;
      }

      let bandPrice: Big;
      if (band.amountType === 'RATE') {
        bandPrice = parseDecimal(band.amount);
      } else {
        bandPrice = retailTotal.times(parseDecimal(band.amount));
      }

      if (lowestBandPrice === null) {
        lowestBandPrice = bandPrice;
        lowestBandMinimum = bandMinimum;
        continue;
      }

      if (bandMinimum.eq(lowestBandMinimum)) {
        if (bandPrice.lte(lowestBandPrice)) {
          lowestBandPrice = bandPrice;
        }
      } else if (bandMinimum.gt(lowestBandMinimum)) {
        lowestBandPrice = bandPrice;
        lowestBandMinimum = bandMinimum;
      }
    }
  }

  if (lowestBandPrice === null) {
    lowestBandPrice = new Big(0);
  }

  return formatMoney(lowestBandPrice.plus(flatTotal));
}

export function estimateShipping(request: EstimateRequest): EstimateResponse {
  return {
    optionPrices: request.options.map((option) => ({
      optionId: option.id,
      price: computeFulfillmentOptionPrice(option, request),
      currency: request.currency,
    })),
  };
}
