import axios from 'axios';
import { faker } from '@faker-js/faker/locale/eo';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
];

const getRandomUserAgent = () => {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
};

interface NominatimSearchResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  boundingbox: [string, string, string, string];
}

interface NominatimReverseResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  category: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name?: string;
  display_name: string;
  address?: {
    tourism?: string;
    road?: string;
    town?: string;
    state_district?: string;
    state?: string;
    ISO3166_2_lvl4?: string;
    region?: string;
    country?: string;
    country_code?: string;
    postcode: string;
    [key: string]: string | undefined;
  };
  boundingbox: [string, string, string, string];
}

export interface Address {
  state: string;
  postCode: string;
  street: string;
}

export const getRandomAddressFromCountry = async (
  countryCode: string,
): Promise<Address> => {
  try {
    // Step 1: Get country polygon/boundaries with strict country search
    const searchUrl = `https://nominatim.openstreetmap.org/search?country=${countryCode}&format=jsonv2&addresstype=country`;
    const searchResponse = await axios.get<NominatimSearchResult[]>(searchUrl, {
      headers: {
        'User-Agent': getRandomUserAgent(),
      },
    });

    if (!searchResponse.data || searchResponse.data.length === 0) {
      throw new Error(`Country ${countryCode} not found`);
    }

    const countryData = searchResponse.data[0];
    const boundingbox = countryData.boundingbox;

    // Parse bounding box coordinates with small margin to avoid borders
    const south = parseFloat(boundingbox[0]);
    const north = parseFloat(boundingbox[1]);
    const west = parseFloat(boundingbox[2]);
    const east = parseFloat(boundingbox[3]);

    // Add small margin (2% inward) to avoid border issues
    const latMargin = (north - south) * 0.2;
    const lonMargin = (east - west) * 0.2;

    const safeNorth = north - latMargin;
    const safeSouth = south + latMargin;
    const safeEast = east - lonMargin;
    const safeWest = west + lonMargin;

    let address: Address | undefined;
    let attempts = 0;
    const maxAttempts = 5; // Увеличил попытки

    // Try multiple times to get a valid address
    while (!address && attempts < maxAttempts) {
      if (attempts > 0) {
        // Respect Nominatim rate limit (1 req/sec)
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Generate random coordinates within safe bounding box
      const randomLat = Math.random() * (safeNorth - safeSouth) + safeSouth;
      const randomLon = Math.random() * (safeEast - safeWest) + safeWest;

      try {
        // Step 2: Get address details for random coordinates
        const reverseUrl = `https://nominatim.openstreetmap.org/reverse?lat=${randomLat}&lon=${randomLon}&format=jsonv2&zoom=18`;
        const reverseResponse = await axios.get<NominatimReverseResult>(
          reverseUrl,
          {
            headers: {
              'User-Agent': getRandomUserAgent(),
            },
          },
        );

        if (reverseResponse.data && reverseResponse.data.address) {
          const rawAddress = reverseResponse.data.address;
          const foundCountryCode = rawAddress.country_code?.toLowerCase();
          const targetCountryCode = countryCode.toLowerCase();

          // Strict country code check
          if (foundCountryCode !== targetCountryCode) {
            console.warn(
              `Attempt ${attempts + 1}: Address in wrong country: ${foundCountryCode}, need ${targetCountryCode}. Coords: ${randomLat}, ${randomLon}.`,
            );
            attempts++;
            continue;
          }

          // Extract address components with proper fallbacks
          const tempAddress = {
            state:
              rawAddress.state ||
              rawAddress.state_district ||
              rawAddress.country ||
              rawAddress.region ||
              '',
            postCode: rawAddress.postcode || faker.location.zipCode(),
            street:
              rawAddress.street ||
              rawAddress.road ||
              reverseResponse.data.display_name ||
              '',
          };

          // Require all three fields to be present
          if (tempAddress.state && tempAddress.postCode && tempAddress.street) {
            address = {
              ...tempAddress,
              ...(tempAddress.street === reverseResponse.data.display_name
                ? {
                    street: reverseResponse.data.display_name
                      .split(',')
                      .slice(0, 2)
                      .join(','),
                  }
                : null),
            } as Address;
            console.log(`Success on attempt ${attempts + 1}`);
          } else {
            console.warn(
              `Attempt ${attempts + 1}: Incomplete address - state: ${!!tempAddress.state}, postCode: ${!!tempAddress.postCode}, street: ${!!tempAddress.street}. Coords: ${randomLat}, ${randomLon}`,
            );
          }
        }
      } catch (e) {
        // Ignore individual request errors and retry
        console.warn(
          `Attempt ${attempts + 1} failed:`,
          e instanceof Error ? e.message : String(e),
        );
      }

      attempts++;
    }

    if (!address) {
      throw new Error(
        `Could not find valid address in country ${countryCode} after ${maxAttempts} attempts`,
      );
    }

    return address;
  } catch (error) {
    console.error('Error getting random address:', error);
    throw new Error(
      `Failed to get random address for country ${countryCode}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};
