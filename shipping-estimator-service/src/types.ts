export type CurrencyCode = string;

export type WeightUnit = 'POUNDS' | 'KILOGRAMS' | 'GRAMS' | 'OUNCES';

export type FulfillmentBandResultAmountType = 'RATE' | 'PERCENTAGE';

export type FulfillmentBand = {
  minimum: string;
  amount: string;
  amountType: FulfillmentBandResultAmountType;
};

export type OrderItem = {
  price?: string;
  quantity: number;
  weight?: string;
  weightUnit?: WeightUnit;
  flatRates?: Record<string, string>;
};

export type FulfillmentOptionType = 'fixed' | 'bandedPrice' | 'bandedWeight';

export type FulfillmentOptionInput = {
  id: string;
  type: FulfillmentOptionType;
  price?: string;
  bands?: FulfillmentBand[];
  useFlatRates?: boolean;
};

export type EstimateRequest = {
  currency: CurrencyCode;
  items: OrderItem[];
  options: FulfillmentOptionInput[];
};

export type OptionPrice = {
  optionId: string;
  price: string;
  currency: CurrencyCode;
};

export type EstimateResponse = {
  optionPrices: OptionPrice[];
};

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  request?: EstimateRequest;
};
