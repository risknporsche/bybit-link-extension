import type { GetVerificationSdkKysInfoPayload } from '../api/kyc.ts';

export const SUMSUB_LINK_TTL_MS = 10 * 60 * 1000;
export const ONFIDO_LINK_TTL_MS = 120 * 60 * 1000;

export const defaultKycInfoPayload: GetVerificationSdkKysInfoPayload = {
  country: 'UY',
  doc_type: 'KYC_DOC_TYPE_ID',
  announced: true,
  extra_params: {
    hkg_poa_agreement: {
      agree: false,
    },
  },
};