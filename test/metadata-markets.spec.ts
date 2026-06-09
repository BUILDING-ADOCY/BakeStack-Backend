import { MetadataController } from '../src/metadata/metadata.controller';
import { MarketsService } from '../src/metadata/markets.service';

describe('Markets metadata', () => {
  const service = new MarketsService();

  it('publishes nine standalone markets and all 21 euro-area members', () => {
    const markets = service.findAll();
    const euroArea = markets.filter((market) => market.region === 'EURO_AREA');
    const southAmerica = markets.filter(
      (market) => market.region === 'SOUTH_AMERICA',
    );

    expect(markets).toHaveLength(30);
    expect(euroArea).toHaveLength(21);
    expect(southAmerica).toHaveLength(4);
    expect(euroArea).toContainEqual(
      expect.objectContaining({
        countryCode: 'BG',
        countryName: 'Bulgaria',
        currencyCode: 'EUR',
      }),
    );
    expect(markets).toContainEqual(
      expect.objectContaining({ countryCode: 'IN', currencyCode: 'INR' }),
    );
    expect(markets).toContainEqual(
      expect.objectContaining({
        countryCode: 'BR',
        countryName: 'Brazil',
        currencyCode: 'BRL',
        region: 'SOUTH_AMERICA',
      }),
    );
  });

  it('returns registry data from the metadata controller', () => {
    const controller = new MetadataController(service);

    expect(controller.findMarkets()).toMatchObject({
      data: expect.any(Array),
      message: 'Markets retrieved successfully',
    });
  });
});
