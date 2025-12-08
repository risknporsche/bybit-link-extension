import {
  getVerificationSdkKysInfo,
  getKysInfo,
  type BybitApiResp,
  type GetVerificationSdkKysInfo,
  type GetVerificationSdkKysInfoPayload,
  type GetKysInfo,
  type GetKysInfoPayload,
} from './api/kyc.ts';

type Message =
  | {
      type: 'GET_KYC_TOKEN';
      payload?: GetVerificationSdkKysInfoPayload;
    }
  | {
      type: 'GET_KYC_INFO';
      payload?: GetKysInfoPayload;
    };

type ContentScriptResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const defaultPayload: GetVerificationSdkKysInfoPayload = {
  country: 'UY',
  doc_type: 'KYC_DOC_TYPE_ID',
  announced: true,
  extra_params: {
    hkg_poa_agreement: {
      agree: false,
    },
  },
};

const defaultKycInfoPayload: GetKysInfoPayload = {
  obtain_kyc_token: true,
  obtain_aml_questionnaire: true,
  obtain_quotas: true,
  obtain_state: true,
  obtain_verification_process: true,
  obtain_current: true,
  token_params: {
    level: 1,
  },
};

const handleGetKycLink = async (
  payload?: GetVerificationSdkKysInfoPayload,
): Promise<ContentScriptResponse<BybitApiResp<GetVerificationSdkKysInfo>>> => {
  try {
    const data = await getVerificationSdkKysInfo(payload ?? defaultPayload);
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to get KYC link';
    return { ok: false, error: message };
  }
};

const handleGetKycInfo = async (
  payload?: GetKysInfoPayload,
): Promise<ContentScriptResponse<BybitApiResp<GetKysInfo>>> => {
  try {
    const data = await getKysInfo(payload ?? defaultKycInfoPayload);
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to get KYC info';
    return { ok: false, error: message };
  }
};

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    if (!message) {
      return false;
    }

    if (message.type === 'GET_KYC_TOKEN') {
      void handleGetKycLink(message.payload).then((response) => {
        sendResponse({
          ...response,
          userId: localStorage.getItem('BYBIT_GA_UID'),
        });
      });

      // Return true to indicate an async response will be sent
      return true;
    }

    if (message.type === 'GET_KYC_INFO') {
      void handleGetKycInfo(message.payload).then((response) => {
        sendResponse({
          ...response,
          userId: localStorage.getItem('BYBIT_GA_UID'),
        });
      });

      return true;
    }

    return false;
  },
);
