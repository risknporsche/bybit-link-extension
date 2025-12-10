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

const KYS_STATUS_STORAGE_KEY = 'BYBIT_LAST_KYS_STATUS';
const KYS_STATUS_CACHE_TTL_MS = 2 * 60 * 1000;

const readCachedKysStatus = (): KysStatusSummary | null => {
  const cached = localStorage.getItem(KYS_STATUS_STORAGE_KEY);
  if (!cached) {
    return null;
  }

  try {
    return JSON.parse(cached) as KysStatusSummary;
  } catch (error) {
    console.warn('Failed to parse cached KYC status', error);
    return null;
  }
};

const isCachedKysStatusFresh = (cached: KysStatusSummary | null) => {
  if (!cached?.fetchedAt) {
    return false;
  }

  const fetchedAt = Date.parse(cached.fetchedAt);
  if (Number.isNaN(fetchedAt)) {
    return false;
  }

  return Date.now() - fetchedAt < KYS_STATUS_CACHE_TTL_MS;
};

const cacheKysStatus = (status: KysStatusSummary) => {
  try {
    localStorage.setItem(KYS_STATUS_STORAGE_KEY, JSON.stringify(status));
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
  const cached = readCachedKysStatus();

  if (cached && (cached.completed || isCachedKysStatusFresh(cached))) {
    return { ok: true, data: cached };
  }

  try {
    const data = await getKysInfo(payload ?? defaultGetKysInfoPayload);
    cacheKysStatus(data);
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

    cacheKysStatus(fallback);
    return { ok: true, data: fallback };
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
