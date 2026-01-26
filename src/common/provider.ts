export enum ProviderEnum {
  SUMSUB = 'PROVIDER_SUMSUB',
  ONFIDO = 'PROVIDER_ONFIDO',
  AAI = 'PROVIDER_AAI',
  ZOLOZ = 'PROVIDER_ZOLOZ',
}

export type ProviderType = ProviderEnum | string


export const getProviderId = (provider?: ProviderType) => {
  if (!provider) return null;

  switch (provider) {
    case ProviderEnum.SUMSUB:
      return 0;
    case ProviderEnum.ONFIDO:
      return 1;
    default:
      return null;
  }
}