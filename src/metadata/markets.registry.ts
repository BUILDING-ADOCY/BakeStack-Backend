export interface MarketComplianceRequirement {
  key: string;
  label: string;
  category: 'BUSINESS' | 'TAX' | 'FOOD_SAFETY';
}

export interface MarketDefinition {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  currencyMinorUnits: number;
  region: 'NORTH_AMERICA' | 'INDIA' | 'EURO_AREA' | 'AUSTRALIA';
  complianceRequirements: MarketComplianceRequirement[];
}

const foodBusinessRegistration: MarketComplianceRequirement = {
  key: 'food_business_registration',
  label: 'Food business registration',
  category: 'FOOD_SAFETY',
};

const euroAreaComplianceRequirements: MarketComplianceRequirement[] = [
  {
    key: 'business_registration_number',
    label: 'Business registration number',
    category: 'BUSINESS',
  },
  {
    key: 'vat_number',
    label: 'VAT number',
    category: 'TAX',
  },
  foodBusinessRegistration,
];

const euroAreaMarket = (
  countryCode: string,
  countryName: string,
): MarketDefinition => ({
  countryCode,
  countryName,
  currencyCode: 'EUR',
  currencySymbol: '€',
  currencyMinorUnits: 2,
  region: 'EURO_AREA',
  complianceRequirements: euroAreaComplianceRequirements,
});

export const MARKETS: MarketDefinition[] = [
  {
    countryCode: 'US',
    countryName: 'United States',
    currencyCode: 'USD',
    currencySymbol: '$',
    currencyMinorUnits: 2,
    region: 'NORTH_AMERICA',
    complianceRequirements: [
      {
        key: 'business_registration_number',
        label: 'State business registration number',
        category: 'BUSINESS',
      },
      { key: 'ein', label: 'Employer Identification Number', category: 'TAX' },
      {
        key: 'food_establishment_permit',
        label: 'Food establishment permit',
        category: 'FOOD_SAFETY',
      },
    ],
  },
  {
    countryCode: 'CA',
    countryName: 'Canada',
    currencyCode: 'CAD',
    currencySymbol: '$',
    currencyMinorUnits: 2,
    region: 'NORTH_AMERICA',
    complianceRequirements: [
      {
        key: 'business_number',
        label: 'Business Number',
        category: 'BUSINESS',
      },
      {
        key: 'gst_hst_number',
        label: 'GST/HST number',
        category: 'TAX',
      },
      foodBusinessRegistration,
    ],
  },
  {
    countryCode: 'MX',
    countryName: 'Mexico',
    currencyCode: 'MXN',
    currencySymbol: '$',
    currencyMinorUnits: 2,
    region: 'NORTH_AMERICA',
    complianceRequirements: [
      {
        key: 'business_registration_number',
        label: 'Business registration number',
        category: 'BUSINESS',
      },
      {
        key: 'rfc',
        label: 'Registro Federal de Contribuyentes',
        category: 'TAX',
      },
      {
        key: 'cofepris_notice',
        label: 'COFEPRIS operating notice',
        category: 'FOOD_SAFETY',
      },
    ],
  },
  {
    countryCode: 'IN',
    countryName: 'India',
    currencyCode: 'INR',
    currencySymbol: '₹',
    currencyMinorUnits: 2,
    region: 'INDIA',
    complianceRequirements: [
      {
        key: 'business_registration_number',
        label: 'Business registration number',
        category: 'BUSINESS',
      },
      { key: 'gstin', label: 'GSTIN', category: 'TAX' },
      {
        key: 'fssai_license_number',
        label: 'FSSAI license number',
        category: 'FOOD_SAFETY',
      },
    ],
  },
  {
    countryCode: 'AU',
    countryName: 'Australia',
    currencyCode: 'AUD',
    currencySymbol: '$',
    currencyMinorUnits: 2,
    region: 'AUSTRALIA',
    complianceRequirements: [
      {
        key: 'abn',
        label: 'Australian Business Number',
        category: 'BUSINESS',
      },
      { key: 'gst_number', label: 'GST registration', category: 'TAX' },
      foodBusinessRegistration,
    ],
  },
  euroAreaMarket('AT', 'Austria'),
  euroAreaMarket('BE', 'Belgium'),
  euroAreaMarket('BG', 'Bulgaria'),
  euroAreaMarket('HR', 'Croatia'),
  euroAreaMarket('CY', 'Cyprus'),
  euroAreaMarket('EE', 'Estonia'),
  euroAreaMarket('FI', 'Finland'),
  euroAreaMarket('FR', 'France'),
  euroAreaMarket('DE', 'Germany'),
  euroAreaMarket('GR', 'Greece'),
  euroAreaMarket('IE', 'Ireland'),
  euroAreaMarket('IT', 'Italy'),
  euroAreaMarket('LV', 'Latvia'),
  euroAreaMarket('LT', 'Lithuania'),
  euroAreaMarket('LU', 'Luxembourg'),
  euroAreaMarket('MT', 'Malta'),
  euroAreaMarket('NL', 'Netherlands'),
  euroAreaMarket('PT', 'Portugal'),
  euroAreaMarket('SK', 'Slovakia'),
  euroAreaMarket('SI', 'Slovenia'),
  euroAreaMarket('ES', 'Spain'),
];

const marketsByCountryCode = new Map(
  MARKETS.map((market) => [market.countryCode, market]),
);

const marketsByCountryName = new Map(
  MARKETS.map((market) => [market.countryName.toLowerCase(), market]),
);

marketsByCountryName.set('usa', marketsByCountryCode.get('US')!);
marketsByCountryName.set(
  'united states of america',
  marketsByCountryCode.get('US')!,
);

export const findMarket = (
  countryCode?: string,
  countryName?: string,
): MarketDefinition | undefined => {
  const normalizedCode = countryCode?.trim().toUpperCase();
  if (normalizedCode) {
    return marketsByCountryCode.get(normalizedCode);
  }

  const normalizedName = countryName?.trim().toLowerCase();
  return normalizedName ? marketsByCountryName.get(normalizedName) : undefined;
};
