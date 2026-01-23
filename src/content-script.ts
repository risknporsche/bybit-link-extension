import {
  getVerificationSdkKysInfo,
  getKysInfo,
  postAmlKycQuestionnaire,
  type BybitApiResp,
  type GetVerificationSdkKysInfo,
  type GetVerificationSdkKysInfoPayload,
  type GetKysInfoPayload,
  type KysStatusSummary,
  defaultGetKysInfoPayload,
  getRewardList,
  claimReward,
  type ClaimRewardResult,
  type RewardEntity,
} from './api/kyc.ts';
import { storageGet, storageSet } from './utils/chromeStorage.ts';

type Message =
  | {
      type: 'GET_KYC_TOKEN';
      payload?: GetVerificationSdkKysInfoPayload;
    }
  | {
      type: 'GET_KYC_INFO';
      payload?: GetKysInfoPayload;
    }
  | {
      type: 'GET_REWARD_LIST';
    }
  | {
      type: 'CLAIM_REWARD';
      payload: {
        awardId: number;
        specCode: string;
      };
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

const KYS_STATUS_STORAGE_KEY = 'lastKysStatus';

const readCachedKysStatus = async (): Promise<KysStatusSummary | null> => {
  try {
    const cached = await storageGet<KysStatusSummary>(KYS_STATUS_STORAGE_KEY);
    return cached && typeof cached === 'object' ? cached : null;
  } catch (error) {
    console.warn('Failed to read cached KYC status', error);
    return null;
  }
};

const cacheKysStatus = async (status: KysStatusSummary) => {
  try {
    await storageSet(KYS_STATUS_STORAGE_KEY, status);
  } catch (error) {
    console.warn('Unable to cache KYC status', error);
  }
};

const buildPendingKysStatus = (): KysStatusSummary => ({
  completed: false,
  error: undefined,
  status: 'PENDING',
  fetchedAt: new Date().toISOString(),
  level: 'LEVEL_1',
  type: '',
  rejectLabels: [],
});

const handleGetKycLink = async (
  payload?: GetVerificationSdkKysInfoPayload,
): Promise<ContentScriptResponse<BybitApiResp<GetVerificationSdkKysInfo>>> => {
  try {
    await postAmlKycQuestionnaire(1, 'UY');

    await getKysInfo({
      obtain_aml_questionnaire: true,
      obtain_current: true,
      obtain_kyc_token: false,
      obtain_quotas: true,
      obtain_state: true,
      obtain_verification_process: true,
    });

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
): Promise<ContentScriptResponse<KysStatusSummary>> => {
  const cached = await readCachedKysStatus();

  try {
    const data = await getKysInfo(payload ?? defaultGetKysInfoPayload);
    await cacheKysStatus(data);
    return { ok: true, data };
  } catch (error) {
    const fallback = cached
      ? {
          ...cached,
          completed: false,
          status: 'PENDING',
          fetchedAt: new Date().toISOString(),
          error: undefined,
        }
      : buildPendingKysStatus();

    await cacheKysStatus(fallback);
    return { ok: true, data: fallback };
  }
};

const handleGetRewardList = async (): Promise<
  ContentScriptResponse<RewardEntity[]>
> => {
  try {
    const data = await getRewardList();
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to get reward list';
    return { ok: false, error: message };
  }
};

const handleClaimReward = async (
  awardId: number,
  specCode: string,
): Promise<ContentScriptResponse<ClaimRewardResult>> => {
  try {
    const data = await claimReward(awardId, specCode);
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to claim reward';
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

    if (message.type === 'GET_REWARD_LIST') {
      void handleGetRewardList().then((response) => {
        sendResponse({
          ...response,
          userId: localStorage.getItem('BYBIT_GA_UID'),
        });
      });

      return true;
    }

    if (message.type === 'CLAIM_REWARD') {
      void handleClaimReward(
        message.payload.awardId,
        message.payload.specCode,
      ).then((response) => {
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
