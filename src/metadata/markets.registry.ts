export interface MarketComplianceRequirement {
  key: string;
  label: string;
  category: 'BUSINESS' | 'TAX' | 'FOOD_SAFETY';
}

export interface MarketTimeZoneOption {
  value: string;
  label: string;
  keywords: string[];
}

export interface MarketDefinition {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  currencyMinorUnits: number;
  defaultTimeZone: string;
  timeZones: MarketTimeZoneOption[];
  region:
    | 'NORTH_AMERICA'
    | 'INDIA'
    | 'EURO_AREA'
    | 'AUSTRALIA'
    | 'SOUTH_AMERICA';
  complianceRequirements: MarketComplianceRequirement[];
}

const timeZone = (
  value: string,
  label: string,
  keywords: string[] = [],
): MarketTimeZoneOption => ({
  value,
  label,
  keywords: [...new Set([value, label, ...keywords])],
});

const singleTimeZone = (
  value: string,
  label: string,
  keywords: string[] = [],
) => [timeZone(value, label, keywords)];

const US_TIME_ZONES = [
  timeZone('America/New_York', 'Eastern Time', [
    'new york',
    'washington',
    'boston',
    'miami',
    'atlanta',
    'philadelphia',
    'eastern',
  ]),
  timeZone('America/Chicago', 'Central Time', [
    'chicago',
    'dallas',
    'austin',
    'houston',
    'minneapolis',
    'central',
  ]),
  timeZone('America/Denver', 'Mountain Time', [
    'denver',
    'salt lake city',
    'boise',
    'mountain',
  ]),
  timeZone('America/Phoenix', 'Arizona Time', ['phoenix', 'arizona']),
  timeZone('America/Los_Angeles', 'Pacific Time', [
    'los angeles',
    'san francisco',
    'seattle',
    'portland',
    'san diego',
    'pacific',
    'california',
  ]),
  timeZone('America/Anchorage', 'Alaska Time', ['anchorage', 'alaska']),
  timeZone('Pacific/Honolulu', 'Hawaii Time', ['honolulu', 'hawaii']),
];

const CANADA_TIME_ZONES = [
  timeZone('America/Toronto', 'Eastern Time', [
    'toronto',
    'ottawa',
    'montreal',
    'quebec',
    'ontario',
  ]),
  timeZone('America/Winnipeg', 'Central Time', ['winnipeg', 'manitoba']),
  timeZone('America/Regina', 'Saskatchewan Time', [
    'regina',
    'saskatoon',
    'saskatchewan',
  ]),
  timeZone('America/Edmonton', 'Mountain Time', [
    'edmonton',
    'calgary',
    'alberta',
  ]),
  timeZone('America/Vancouver', 'Pacific Time', [
    'vancouver',
    'victoria',
    'british columbia',
  ]),
  timeZone('America/Halifax', 'Atlantic Time', [
    'halifax',
    'nova scotia',
    'new brunswick',
  ]),
  timeZone('America/St_Johns', 'Newfoundland Time', [
    "st john's",
    'st. johns',
    'newfoundland',
  ]),
];

const MEXICO_TIME_ZONES = [
  timeZone('America/Mexico_City', 'Central Mexico Time', [
    'mexico city',
    'ciudad de mexico',
    'monterrey',
    'guadalajara',
    'central',
  ]),
  timeZone('America/Cancun', 'Eastern Mexico Time', ['cancun', 'quintana roo']),
  timeZone('America/Chihuahua', 'Mountain Mexico Time', ['chihuahua']),
  timeZone('America/Mazatlan', 'Pacific Mexico Time', ['mazatlan', 'sinaloa']),
  timeZone('America/Tijuana', 'Baja California Time', ['tijuana', 'baja']),
];

const AUSTRALIA_TIME_ZONES = [
  timeZone('Australia/Sydney', 'Eastern Time - Sydney / Melbourne', [
    'sydney',
    'melbourne',
    'canberra',
    'new south wales',
    'victoria',
  ]),
  timeZone('Australia/Brisbane', 'Eastern Time - Queensland', [
    'brisbane',
    'queensland',
  ]),
  timeZone('Australia/Adelaide', 'Central Time - Adelaide', [
    'adelaide',
    'south australia',
  ]),
  timeZone('Australia/Darwin', 'Central Time - Darwin', [
    'darwin',
    'northern territory',
  ]),
  timeZone('Australia/Perth', 'Western Time - Perth', [
    'perth',
    'western australia',
  ]),
  timeZone('Australia/Hobart', 'Tasmania Time', ['hobart', 'tasmania']),
];

const EURO_AREA_TIME_ZONES: Record<string, MarketTimeZoneOption[]> = {
  AT: singleTimeZone('Europe/Vienna', 'Austria Time', ['vienna']),
  BE: singleTimeZone('Europe/Brussels', 'Belgium Time', ['brussels']),
  BG: singleTimeZone('Europe/Sofia', 'Bulgaria Time', ['sofia']),
  HR: singleTimeZone('Europe/Zagreb', 'Croatia Time', ['zagreb']),
  CY: singleTimeZone('Asia/Nicosia', 'Cyprus Time', ['nicosia']),
  EE: singleTimeZone('Europe/Tallinn', 'Estonia Time', ['tallinn']),
  FI: singleTimeZone('Europe/Helsinki', 'Finland Time', ['helsinki']),
  FR: singleTimeZone('Europe/Paris', 'France Time', ['paris']),
  DE: singleTimeZone('Europe/Berlin', 'Germany Time', ['berlin']),
  GR: singleTimeZone('Europe/Athens', 'Greece Time', ['athens']),
  IE: singleTimeZone('Europe/Dublin', 'Ireland Time', ['dublin']),
  IT: singleTimeZone('Europe/Rome', 'Italy Time', ['rome', 'milan']),
  LV: singleTimeZone('Europe/Riga', 'Latvia Time', ['riga']),
  LT: singleTimeZone('Europe/Vilnius', 'Lithuania Time', ['vilnius']),
  LU: singleTimeZone('Europe/Luxembourg', 'Luxembourg Time', ['luxembourg']),
  MT: singleTimeZone('Europe/Malta', 'Malta Time', ['valletta']),
  NL: singleTimeZone('Europe/Amsterdam', 'Netherlands Time', ['amsterdam']),
  PT: [
    timeZone('Europe/Lisbon', 'Portugal Mainland Time', ['lisbon', 'porto']),
    timeZone('Atlantic/Madeira', 'Madeira Time', ['madeira']),
    timeZone('Atlantic/Azores', 'Azores Time', ['azores']),
  ],
  SK: singleTimeZone('Europe/Bratislava', 'Slovakia Time', ['bratislava']),
  SI: singleTimeZone('Europe/Ljubljana', 'Slovenia Time', ['ljubljana']),
  ES: [
    timeZone('Europe/Madrid', 'Spain Mainland Time', ['madrid', 'barcelona']),
    timeZone('Atlantic/Canary', 'Canary Islands Time', ['canary']),
    timeZone('Africa/Ceuta', 'Ceuta Time', ['ceuta']),
  ],
};

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
): MarketDefinition => {
  const timeZones =
    EURO_AREA_TIME_ZONES[countryCode] ??
    singleTimeZone('Europe/Paris', `${countryName} Time`, [countryName]);

  return {
    countryCode,
    countryName,
    currencyCode: 'EUR',
    currencySymbol: '€',
    currencyMinorUnits: 2,
    defaultTimeZone: timeZones[0].value,
    timeZones,
    region: 'EURO_AREA',
    complianceRequirements: euroAreaComplianceRequirements,
  };
};

export const MARKETS: MarketDefinition[] = [
  {
    countryCode: 'US',
    countryName: 'United States',
    currencyCode: 'USD',
    currencySymbol: '$',
    currencyMinorUnits: 2,
    defaultTimeZone: 'America/New_York',
    timeZones: US_TIME_ZONES,
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
    defaultTimeZone: 'America/Toronto',
    timeZones: CANADA_TIME_ZONES,
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
    defaultTimeZone: 'America/Mexico_City',
    timeZones: MEXICO_TIME_ZONES,
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
    defaultTimeZone: 'Asia/Kolkata',
    timeZones: singleTimeZone('Asia/Kolkata', 'India Standard Time', [
      'india',
      'mumbai',
      'delhi',
      'bengaluru',
      'bangalore',
      'pune',
      'kolkata',
      'chennai',
      'hyderabad',
    ]),
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
    defaultTimeZone: 'Australia/Sydney',
    timeZones: AUSTRALIA_TIME_ZONES,
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
  {
    countryCode: 'BR',
    countryName: 'Brazil',
    currencyCode: 'BRL',
    currencySymbol: 'R$',
    currencyMinorUnits: 2,
    defaultTimeZone: 'America/Sao_Paulo',
    timeZones: [
      timeZone('America/Sao_Paulo', 'Brasilia / Sao Paulo Time', [
        'sao paulo',
        'são paulo',
        'rio de janeiro',
        'brasilia',
        'brasília',
      ]),
      timeZone('America/Manaus', 'Amazon Time', ['manaus', 'amazonas']),
      timeZone('America/Rio_Branco', 'Acre Time', ['rio branco', 'acre']),
    ],
    region: 'SOUTH_AMERICA',
    complianceRequirements: [
      { key: 'cnpj', label: 'CNPJ', category: 'BUSINESS' },
      {
        key: 'inscricao_estadual',
        label: 'Inscrição Estadual',
        category: 'TAX',
      },
      {
        key: 'anvisa_license',
        label: 'ANVISA sanitary license',
        category: 'FOOD_SAFETY',
      },
    ],
  },
  {
    countryCode: 'AR',
    countryName: 'Argentina',
    currencyCode: 'ARS',
    currencySymbol: '$',
    currencyMinorUnits: 2,
    defaultTimeZone: 'America/Argentina/Buenos_Aires',
    timeZones: singleTimeZone(
      'America/Argentina/Buenos_Aires',
      'Argentina Time',
      ['buenos aires', 'argentina'],
    ),
    region: 'SOUTH_AMERICA',
    complianceRequirements: [
      { key: 'cuit', label: 'CUIT', category: 'BUSINESS' },
      { key: 'iva_registration', label: 'IVA registration', category: 'TAX' },
      foodBusinessRegistration,
    ],
  },
  {
    countryCode: 'CO',
    countryName: 'Colombia',
    currencyCode: 'COP',
    currencySymbol: '$',
    currencyMinorUnits: 2,
    defaultTimeZone: 'America/Bogota',
    timeZones: singleTimeZone('America/Bogota', 'Colombia Time', [
      'bogota',
      'bogotá',
      'colombia',
    ]),
    region: 'SOUTH_AMERICA',
    complianceRequirements: [
      { key: 'nit', label: 'NIT', category: 'BUSINESS' },
      { key: 'rut', label: 'RUT', category: 'TAX' },
      {
        key: 'invima_registration',
        label: 'INVIMA registration',
        category: 'FOOD_SAFETY',
      },
    ],
  },
  {
    countryCode: 'PE',
    countryName: 'Peru',
    currencyCode: 'PEN',
    currencySymbol: 'S/',
    currencyMinorUnits: 2,
    defaultTimeZone: 'America/Lima',
    timeZones: singleTimeZone('America/Lima', 'Peru Time', ['lima', 'peru']),
    region: 'SOUTH_AMERICA',
    complianceRequirements: [
      { key: 'ruc', label: 'RUC', category: 'BUSINESS' },
      { key: 'igv_registration', label: 'IGV registration', category: 'TAX' },
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

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export const inferMarketTimeZone = (
  market: MarketDefinition,
  placeParts: Array<string | null | undefined>,
) => {
  const placeText = normalizeSearchText(
    placeParts.filter(Boolean).join(' '),
  ).trim();

  if (placeText) {
    const matched = market.timeZones.find((option) =>
      option.keywords.some((keyword) =>
        placeText.includes(normalizeSearchText(keyword)),
      ),
    );

    if (matched) {
      return matched.value;
    }
  }

  return market.defaultTimeZone;
};

export const isMarketTimeZone = (
  market: MarketDefinition,
  timezone: string | undefined,
) =>
  Boolean(
    timezone &&
    market.timeZones.some((option) => option.value === timezone.trim()),
  );
