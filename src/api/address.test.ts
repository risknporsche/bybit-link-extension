import { describe, it, expect } from 'vitest';
import { getRandomAddressFromCountry } from './address';

const COUNTRIES = [
  { code: 'at', name: 'Austria' },
  { code: 'de', name: 'Germany' },
  { code: 'is', name: 'Iceland' },
  { code: 'cy', name: 'Cyprus' },
  { code: 'ee', name: 'Estonia' },
  { code: 'br', name: 'Brazil' },
  { code: 'mx', name: 'Mexico' },
  { code: 'za', name: 'South Africa' },
  { code: 'id', name: 'Indonesia' },
];

describe('getRandomAddressFromCountry', () => {
  it.each(COUNTRIES)(
    'should return a valid address for $name ($code)',
    async ({ code, name }) => {
      const address = await getRandomAddressFromCountry(code);
      expect(address).toBeDefined();
      expect(address.state).toBeTypeOf('string');
      expect(address.postCode).toBeTypeOf('string');
      expect(address.street).toBeTypeOf('string');

      console.log(`Found ${name} Address:`, address);
    },
    120000,
  );

  it('should throw an error for an invalid country code', async () => {
    await expect(getRandomAddressFromCountry('zzzzzz')).rejects.toThrow();
  }, 30000);
});
