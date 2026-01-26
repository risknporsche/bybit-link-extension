import { ProviderEnum, type ProviderType } from '../common/provider.ts';
import { ONFIDO_LINK_TTL_MS, SUMSUB_LINK_TTL_MS } from '../common/constants.ts';

export const getExpiredTimeByProvider = (
  provider?: ProviderType | null,
): number | null => {
  if (!provider) return null;

  switch (provider) {
    case ProviderEnum.SUMSUB:
      return SUMSUB_LINK_TTL_MS;
    case ProviderEnum.ONFIDO:
      return ONFIDO_LINK_TTL_MS;
    default:
      return null;
  }
};