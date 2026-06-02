import { MetadataController } from '../src/metadata/metadata.controller';
import { MarketsService } from '../src/metadata/markets.service';

describe('Markets metadata', () => {
  const service = new MarketsService();

  it('publishes five standalone markets and all 21 euro-area members', () => {
    const markets = service.findAll();
    const euroArea = markets.filter((market) => market.region === 'EURO_AREA');

    expect(markets).toHaveLength(26);
    expect(euroArea).toHaveLength(21);
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
  });

  it('returns registry data from the metadata controller', () => {
    const controller = new MetadataController(service);

    expect(controller.findMarkets()).toMatchObject({
      data: expect.any(Array),
      message: 'Markets retrieved successfully',
    });
  });
});
