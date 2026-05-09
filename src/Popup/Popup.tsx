import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BybitApiResp,
  ClaimRewardResult,
  GetVerificationSdkKysInfo,
  KysStatusSummary,
  RewardEntity,
} from '../api/kyc.ts';
import { bindToken } from '../api/backend.ts';
import { sha256 } from '../utils/crypto.ts';
import {
  storageGet,
  storageGetMany,
  storageRemove,
  storageSet,
} from '../utils/chromeStorage.ts';
import { BybitLinkCard } from './components/BybitLinkCard.tsx';
import { BybitKycInlineCard } from './components/BybitKycInlineCard.tsx';
import { BybitKycCard } from './components/BybitKycCard.tsx';
import { BybitRewardsSection } from './components/BybitRewardsSection.tsx';
import { OtherLinkCard } from './components/OtherLinkCard.tsx';
import {
  defaultKycInfoPayload,
  SUMSUB_LINK_TTL_MS,
} from '../common/constants.ts';
import { ProviderEnum } from '../common/provider.ts';
import { getExpiredTimeByProvider } from '../utils/time.ts';

const extensionVersion = chrome.runtime.getManifest().version;

type ContentScriptResponse<T> =
  | { ok: true; data: T; userId?: string }
  | { ok: false; error: string };

type FaceVerificationState = {
  awardId: number;
  faceToken?: string;
  workflowRunId?: string;
  url?: string;
  ticket?: string;
  bizId?: string;
  fetchedAt?: string;
  provider?: ProviderEnum;
};

type StoredRewardsState = {
  list: RewardEntity[];
  error: string | null;
  fetchedAt: string | null;
};

const languageOptions = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Russian' },
  { code: 'es', label: 'Spanish' },
  { code: 'et', label: 'Estonian' },
  { code: 'pt-br', label: 'Portuguese (Brazil)' },
  { code: 'zh-tw', label: 'Chinese (Traditional)' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'zh', label: 'Chinese (Simplified)' },
  { code: 'th', label: 'Thai' },
  { code: 'id', label: 'Indonesian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ms', label: 'Malay' },
  { code: 'ur', label: 'Urdu' },
  { code: 'bn', label: 'Bengali' },
  { code: 'fl', label: 'Filipino' },
  { code: 'fr', label: 'French' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'ro', label: 'Romanian' },
  { code: 'cs', label: 'Czech' },
  { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'my', label: 'Burmese' },
  { code: 'lo', label: 'Lao' },
  { code: 'km', label: 'Khmer' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'el', label: 'Greek' },
  { code: 'hy', label: 'Armenian' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'sk', label: 'Slovak' },
  { code: 'da', label: 'Danish' },
  { code: 'lv', label: 'Latvian' },
  { code: 'fa', label: 'Persian' },
  { code: 'ka', label: 'Georgian' },
  { code: 'sv', label: 'Swedish' },
  { code: 'he', label: 'Hebrew' },
  { code: 'si', label: 'Sinhala' },
  { code: 'am', label: 'Amharic' },
  { code: 'sgn-de', label: 'German Sign Language' },
  { code: 'no', label: 'Norwegian' },
  { code: 'sr', label: 'Serbian' },
  { code: 'sw', label: 'Swahili' },
  { code: 'zu', label: 'Zulu' },
  { code: 'ha', label: 'Hausa' },
  { code: 'az', label: 'Azerbaijani' },
  { code: 'uz', label: 'Uzbek' },
  { code: 'hr', label: 'Croatian' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'fi', label: 'Finnish' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'tg', label: 'Tajik' },
  { code: 'ca', label: 'Catalan' },
] as const;

const KYS_STATUS_STORAGE_KEY = 'lastKysStatus';
const REWARDS_STORAGE_KEY = 'lastRewards';
const FACE_VERIFICATION_STORAGE_KEY = 'lastRewardFaceVerification';
const BYBIT_LINK_STORAGE_KEY = 'bybitLastLink';
const BYBIT_LINK_EXPIRES_AT_STORAGE_KEY = 'bybitLastLinkExpiresAt';
const PREFERRED_LANG_STORAGE_KEY = 'preferredLang';
const MAIN_TAB_STORAGE_KEY = 'popupMainTab';
const BYBIT_TAB_STORAGE_KEY = 'popupBybitTab';
const REWARD_FACE_CACHE_KEY = 'BYBIT_REWARD_FACE_CACHE';

type RewardFaceCacheRecord = Record<
  string,
  { url?: string; zolozToken?: string }
>;

const readStoredKysStatus = async (): Promise<KysStatusSummary | null> => {
  try {
    const stored = await storageGet<KysStatusSummary>(KYS_STATUS_STORAGE_KEY);
    return stored && typeof stored === 'object' ? stored : null;
  } catch {
    return null;
  }
};

const persistKysStatus = async (status: KysStatusSummary) => {
  await storageSet(KYS_STATUS_STORAGE_KEY, status);
};

const persistRewards = async (state: StoredRewardsState) => {
  try {
    await storageSet(REWARDS_STORAGE_KEY, state);
  } catch {
    // ignore
  }
};

type StoredFaceVerification = FaceVerificationState & { fetchedAt: string };

const persistFaceVerification = async (state: FaceVerificationState | null) => {
  try {
    if (!state) {
      await storageRemove(FACE_VERIFICATION_STORAGE_KEY);
      return;
    }

    const payload: StoredFaceVerification = {
      ...state,
      fetchedAt: state.fetchedAt ?? new Date().toISOString(),
    };

    await storageSet(FACE_VERIFICATION_STORAGE_KEY, payload);
  } catch {
    // ignore persistence errors
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

const isBybitHost = (hostname: string) => {
  const allowedHosts = ['bybit.com', 'bybitglobal.com'];
  return allowedHosts.some(
    (host) => hostname === host || hostname.endsWith(`.${host}`),
  );
};

const getActiveTab = () =>
  new Promise<chrome.tabs.Tab | undefined>((resolve, reject) => {
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true,
      },
      (tabs) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }

        resolve(tabs[0]);
      },
    );
  });

const sendMessageToActiveTab = async <T,>(
  message: unknown,
): Promise<ContentScriptResponse<T>> => {
  const tab = await getActiveTab();

  if (!tab?.id) {
    throw new Error('Active tab is missing');
  }

  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tab.id!, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }

      resolve(response as ContentScriptResponse<T>);
    });
  });
};

export const Popup = () => {
  const hasLoadedLanguage = useRef(false);
  const hasHydratedTabs = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [bybitLinkError, setBybitLinkError] = useState<string | null>(null);
  const [bybitLink, setBybitLink] = useState<string | null>(null);
  const [bybitLinkExpiresAt, setBybitLinkExpiresAt] = useState<number | null>(
    null,
  );
  const [bybitRemainingMs, setBybitRemainingMs] = useState<number | null>(null);
  const [copiedBybitLink, setCopiedBybitLink] = useState(false);

  const [mainTab, setMainTab] = useState<'bybit' | 'other'>('bybit');
  const [bybitTab, setBybitTab] = useState<'link' | 'kyc' | 'rewards'>('link');
  const [language, setLanguage] = useState<string>('en');
  const [isSupportedSite, setIsSupportedSite] = useState<boolean | null>(null);

  const [kysStatus, setKysStatus] = useState<KysStatusSummary | null>(null);
  const [kysError, setKysError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const [rewards, setRewards] = useState<RewardEntity[]>([]);
  const [hasFetchedRewards, setHasFetchedRewards] = useState<boolean>(false);
  const [rewardsError, setRewardsError] = useState<string | null>(null);
  const [rewardsFetchedAt, setRewardsFetchedAt] = useState<string | null>(null);
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);
  const [claimingRewardId, setClaimingRewardId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [faceVerification, setFaceVerification] =
    useState<FaceVerificationState | null>(null);
  const [rewardFaceCache, setRewardFaceCache] =
    useState<RewardFaceCacheRecord | null>(null);
  const [faceRemainingMs, setFaceRemainingMs] = useState<number | null>(null);
  const [copiedFaceLink, setCopiedFaceLink] = useState(false);

  const isKycCompleted = kysStatus?.completed === true;
  const hasBybitLinkExpiry =
    typeof bybitLinkExpiresAt === 'number' && !Number.isNaN(bybitLinkExpiresAt);

  const formatSeconds = useCallback((seconds?: number) => {
    if (seconds === undefined || Number.isNaN(seconds)) return 'Unknown';
    const total = Math.max(0, Math.floor(seconds));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }, []);

  useEffect(() => {
    const loadStoredState = async () => {
      try {
        const stored = await storageGetMany([
          BYBIT_LINK_STORAGE_KEY,
          PREFERRED_LANG_STORAGE_KEY,
          BYBIT_LINK_EXPIRES_AT_STORAGE_KEY,
          KYS_STATUS_STORAGE_KEY,
          REWARDS_STORAGE_KEY,
          FACE_VERIFICATION_STORAGE_KEY,
          REWARD_FACE_CACHE_KEY,
          MAIN_TAB_STORAGE_KEY,
          BYBIT_TAB_STORAGE_KEY,
        ]);

        const storedBybitLink =
          typeof stored[BYBIT_LINK_STORAGE_KEY] === 'string'
            ? (stored[BYBIT_LINK_STORAGE_KEY] as string)
            : null;
        setBybitLink(storedBybitLink);

        const storedLangRaw = stored[PREFERRED_LANG_STORAGE_KEY];
        const storedLang =
          typeof storedLangRaw === 'string' ? storedLangRaw.trim() : '';

        if (storedLang) {
          setLanguage(storedLang);
        } else if (!hasLoadedLanguage.current) {
          setLanguage('en');
        }

        const expiresRaw = stored[BYBIT_LINK_EXPIRES_AT_STORAGE_KEY];
        const expiresAt =
          typeof expiresRaw === 'number'
            ? expiresRaw
            : typeof expiresRaw === 'string'
              ? Number(expiresRaw)
              : null;
        setBybitLinkExpiresAt(
          typeof expiresAt === 'number' && !Number.isNaN(expiresAt)
            ? expiresAt
            : null,
        );

        const kysRaw = stored[KYS_STATUS_STORAGE_KEY];
        setKysStatus(
          kysRaw && typeof kysRaw === 'object'
            ? (kysRaw as KysStatusSummary)
            : null,
        );

        const rewardsRaw = stored[REWARDS_STORAGE_KEY];
        if (
          rewardsRaw &&
          typeof rewardsRaw === 'object' &&
          Array.isArray((rewardsRaw as StoredRewardsState).list)
        ) {
          const rewardsState = rewardsRaw as StoredRewardsState;
          setRewards(rewardsState.list);
          setRewardsError(
            typeof rewardsState.error === 'string' ||
              rewardsState.error === null
              ? rewardsState.error
              : null,
          );
          setRewardsFetchedAt(
            typeof rewardsState.fetchedAt === 'string'
              ? rewardsState.fetchedAt
              : null,
          );
          setHasFetchedRewards(
            rewardsState.list.length > 0 || rewardsState.fetchedAt !== null,
          );
        }

        const faceCacheRaw = stored[REWARD_FACE_CACHE_KEY];
        if (
          faceCacheRaw &&
          typeof faceCacheRaw === 'object' &&
          !Array.isArray(faceCacheRaw)
        ) {
          setRewardFaceCache(faceCacheRaw as RewardFaceCacheRecord);
        }

        const faceRaw = stored[FACE_VERIFICATION_STORAGE_KEY];
        if (faceRaw && typeof faceRaw === 'object') {
          const f = faceRaw as StoredFaceVerification;
          const hasFaceToken = typeof f.faceToken === 'string';
          const hasUrlOrTicket =
            typeof f.url === 'string' || typeof f.ticket === 'string';
          if (
            typeof f.awardId === 'number' &&
            (hasFaceToken || hasUrlOrTicket)
          ) {
            setFaceVerification(faceRaw as StoredFaceVerification);
          }
        }

        const storedMainTab = stored[MAIN_TAB_STORAGE_KEY];
        if (storedMainTab === 'bybit' || storedMainTab === 'other') {
          setMainTab(storedMainTab);
        }

        const storedBybitTab = stored[BYBIT_TAB_STORAGE_KEY];
        if (
          storedBybitTab === 'link' ||
          storedBybitTab === 'kyc' ||
          storedBybitTab === 'rewards'
        ) {
          setBybitTab(storedBybitTab);
        }
      } catch {
        // ignore storage errors
      } finally {
        hasLoadedLanguage.current = true;
        hasHydratedTabs.current = true;
      }
    };

    void loadStoredState();
  }, []);

  useEffect(() => {
    const checkActiveTab = async () => {
      try {
        const tab = await getActiveTab();
        const url = tab?.url;

        if (!url) {
          setIsSupportedSite(false);
          setBybitLinkError('Open this popup on bybit.com or bybitglobal.com.');
          return;
        }

        const hostname = new URL(url).hostname;
        const allowed = isBybitHost(hostname);
        setIsSupportedSite(allowed);

        if (!allowed) {
          setBybitLinkError('Open this popup on bybit.com or bybitglobal.com.');
        }
      } catch (err) {
        setIsSupportedSite(false);
        const message =
          err instanceof Error ? err.message : 'Failed to read active tab';
        setBybitLinkError(message);
      }
    };

    void checkActiveTab();
  }, []);

  useEffect(() => {
    if (!hasLoadedLanguage.current) return;
    void storageSet(PREFERRED_LANG_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!hasHydratedTabs.current) return;
    void storageSet(MAIN_TAB_STORAGE_KEY, mainTab);
  }, [mainTab]);

  useEffect(() => {
    if (!hasHydratedTabs.current) return;
    void storageSet(BYBIT_TAB_STORAGE_KEY, bybitTab);
  }, [bybitTab]);

  useEffect(() => {
    if (!bybitLink) {
      return;
    }

    try {
      const linkUrl = new URL(bybitLink);
      const currentLang = linkUrl.searchParams.get('lang');

      if (currentLang === language) {
        return;
      }

      linkUrl.searchParams.set('lang', language);
      const updatedLink = linkUrl.toString();
      setBybitLink(updatedLink);
      void storageSet(BYBIT_LINK_STORAGE_KEY, updatedLink);
      if (bybitLinkExpiresAt) {
        void storageSet(BYBIT_LINK_EXPIRES_AT_STORAGE_KEY, bybitLinkExpiresAt);
      }
    } catch {
      // Ignore malformed stored links
    }
  }, [language, bybitLink, bybitLinkExpiresAt]);

  useEffect(() => {
    if (!bybitLink || !hasBybitLinkExpiry || bybitLinkExpiresAt === null) {
      setBybitRemainingMs(null);
      return;
    }

    const updateRemaining = () => {
      const msLeft = bybitLinkExpiresAt - Date.now();
      setBybitRemainingMs(msLeft > 0 ? msLeft : 0);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [bybitLink, bybitLinkExpiresAt, hasBybitLinkExpiry]);

  useEffect(() => {
    if (bybitLinkExpiresAt === null) return;
    void storageSet(BYBIT_LINK_EXPIRES_AT_STORAGE_KEY, bybitLinkExpiresAt);
  }, [bybitLinkExpiresAt]);

  const handleGetBybitLink = useCallback(async () => {
    if (isSupportedSite !== true) {
      setBybitLinkError('Open this popup on bybit.com or bybitglobal.com.');
      return;
    }

    if (isKycCompleted) {
      setBybitLinkError('KYC already completed — link request disabled.');
      return;
    }

    setIsLoading(true);
    setBybitLinkError(null);
    setBybitLink(null);
    setBybitLinkExpiresAt(null);

    try {
      const response = await sendMessageToActiveTab<
        BybitApiResp<GetVerificationSdkKysInfo>
      >({
        type: 'GET_KYC_TOKEN',
        payload: defaultKycInfoPayload,
      });

      if (!response?.ok) {
        throw new Error(response?.error ?? 'No response from content script');
      }

      const userIdResponse = await sendMessageToActiveTab<string>({
        type: 'GET_USER_ID',
      });

      if (!userIdResponse?.ok || !userIdResponse.data) {
        throw new Error('Failed to fetch user id');
      }

      const userId = userIdResponse.data;

      const result = { ...response.data.result, userId };

      const hash = await sha256(userId);

      const hashResponse = await bindToken({
        hash,
        token: result.tokenInfo.token,
      });
      const resolvedLink = `${import.meta.env.VITE_FRONTEND_BASE_URL}?hash=${hashResponse}&lang=${language}`;
      const expiresInMs = SUMSUB_LINK_TTL_MS;
      const expiresAt =
        typeof expiresInMs === 'number' && !Number.isNaN(expiresInMs)
          ? Date.now() + expiresInMs
          : null;

      await storageSet(BYBIT_LINK_STORAGE_KEY, resolvedLink);
      if (expiresAt) {
        await storageSet(BYBIT_LINK_EXPIRES_AT_STORAGE_KEY, expiresAt);
      } else {
        await storageRemove(BYBIT_LINK_EXPIRES_AT_STORAGE_KEY);
      }
      setBybitLink(resolvedLink);
      setBybitLinkExpiresAt(expiresAt);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to request link';
      setBybitLinkError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isKycCompleted, isSupportedSite, language]);

  const handleCheckKysStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    setKysError(null);

    try {
      const response = await sendMessageToActiveTab<KysStatusSummary>({
        type: 'GET_KYC_INFO',
      });

      if (!response?.ok) {
        throw new Error(response?.error ?? 'No response from content script');
      }

      await persistKysStatus(response.data);
      setKysStatus(response.data);
    } catch (_err) {
      const message =
        _err instanceof Error ? _err.message : 'Failed to check KYC status';
      const normalizedMessage = message
        .toLowerCase()
        .includes('message port closed')
        ? 'The page reloaded — reopen popup and try again.'
        : message;

      const cached = await readStoredKysStatus();
      const fallbackStatus = cached
        ? {
            ...cached,
            completed: false,
            status: 'PENDING',
            fetchedAt: new Date().toISOString(),
            error: undefined,
          }
        : buildPendingKysStatus();

      await persistKysStatus(fallbackStatus);
      setKysStatus(fallbackStatus);
      setKysError(normalizedMessage);
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  const handleFetchRewards = useCallback(async () => {
    if (isSupportedSite !== true) {
      setRewardsError('Open this popup on bybit.com or bybitglobal.com.');
      const now = new Date().toISOString();
      await persistRewards({
        list: rewards,
        error: 'Open this popup on bybit.com or bybitglobal.com.',
        fetchedAt: now,
      });
      setRewardsFetchedAt(now);
      return;
    }

    setIsLoadingRewards(true);
    setRewardsError(null);

    try {
      const response = await sendMessageToActiveTab<RewardEntity[]>({
        type: 'GET_REWARD_LIST',
      });

      if (!response?.ok) {
        throw new Error(response?.error ?? 'No response from content script');
      }

      const now = new Date().toISOString();
      const emptyError =
        response.data.length === 0 ? 'Awardings list is empty' : null;

      setRewards(response.data);
      setHasFetchedRewards(true);
      setRewardsFetchedAt(now);
      setRewardsError(emptyError);

      await persistRewards({
        list: response.data,
        error: emptyError,
        fetchedAt: now,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch rewards';
      const normalizedMessage = message
        .toLowerCase()
        .includes('message port closed')
        ? 'The page reloaded — reopen popup and press Refresh again.'
        : message;
      setRewardsError(normalizedMessage);
      const now = new Date().toISOString();
      setRewardsFetchedAt(now);
      await persistRewards({
        list: rewards,
        error: normalizedMessage,
        fetchedAt: now,
      });
    } finally {
      setIsLoadingRewards(false);
    }
  }, [isSupportedSite, rewards]);

  const handleClaimReward = useCallback(
    async (reward: RewardEntity) => {
      if (isSupportedSite !== true) {
        setClaimError('Open this popup on bybit.com or bybitglobal.com.');
        return;
      }

      setClaimError(null);
      setClaimingRewardId(reward.awardId);
      setFaceVerification(null);
      await persistFaceVerification(null);

      try {
        const response = await sendMessageToActiveTab<ClaimRewardResult>({
          type: 'CLAIM_REWARD',
          payload: { awardId: reward.awardId, specCode: reward.specCode },
        });

        if (!response?.ok) {
          throw new Error(response?.error ?? 'Failed to claim reward');
        }

        const userId = response.userId ?? '';
        if (!userId) {
          throw new Error('User id is missing');
        }

        const result = response.data;
        if (result.status === 'face_required') {
          const fetchedAt = new Date().toISOString();
          let faceState: FaceVerificationState = {
            awardId: reward.awardId,
            ticket: result.ticket,
            bizId: result.bizId,
            fetchedAt,
          };
          if (
            ![ProviderEnum.SUMSUB, ProviderEnum.ONFIDO].includes(result.provider)
          ) {
            faceState = {
              ...faceState,
              url: result.url,
            };
          } else {
            const faceToken = result.faceToken;
            if (!faceToken) {
              throw new Error('No faceToken');
            }
            const hash = await sha256(userId);
            const hashResponse = await bindToken({
              hash,
              token: faceToken,
            });

            if (result.provider === ProviderEnum.SUMSUB) {
              const resolvedFaceLink = `${import.meta.env.VITE_FRONTEND_BASE_URL}?hash=${hashResponse}&lang=${language}`;
              faceState = {
                ...faceState,
                faceToken: result.faceToken,
                url: resolvedFaceLink,
              };
            } else {
              const workflowRunId = result.workflowRunId;
              if (!workflowRunId) {
                throw new Error('No workflowRunId');
              }
              const resolvedFaceLink = `${import.meta.env.VITE_FRONTEND_BASE_URL}?hash=${hashResponse}&lang=${language}&workflowRunId=${workflowRunId}&provider=1`;
              faceState = {
                ...faceState,
                faceToken: result.faceToken,
                workflowRunId: result.workflowRunId,
                url: resolvedFaceLink,
              };
            }
          }

          await persistFaceVerification(faceState);
          setFaceVerification(faceState);
          setBybitTab('rewards');
          const cache = await storageGet<RewardFaceCacheRecord>(
            REWARD_FACE_CACHE_KEY,
          );
          if (cache && typeof cache === 'object' && !Array.isArray(cache)) {
            setRewardFaceCache(cache);
          }
        } else {
          await persistFaceVerification(null);
          setFaceVerification(null);
          void handleFetchRewards();
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to claim reward';
        setClaimError(message);
      } finally {
        setClaimingRewardId(null);
      }
    },
    [handleFetchRewards, isSupportedSite, language],
  );

  const isBybitGetLinkDisabled =
    isLoading || isSupportedSite !== true || isKycCompleted;
  const isBybitLinkExpired =
    !!bybitLink && !!bybitLinkExpiresAt && Date.now() >= bybitLinkExpiresAt;

  const bybitStatusText = useMemo(() => {
    if (isSupportedSite === null) {
      return 'Checking active tab...';
    }
    if (!isSupportedSite) {
      return 'Open this popup on bybit.com or bybitglobal.com.';
    }
    if (isKycCompleted) {
      return 'KYC approved — link request disabled.';
    }
    if (isLoading) {
      return 'Requesting link...';
    }
    if (isBybitLinkExpired) {
      return 'Link expired — request a new one.';
    }
    if (bybitLinkError) {
      return bybitLinkError;
    }
    if (bybitLink && !hasBybitLinkExpiry) {
      return 'Link ready — expiry time unknown.';
    }
    if (bybitLink) {
      return 'Link ready';
    }
    return 'Idle';
  }, [
    isLoading,
    bybitLinkError,
    bybitLink,
    isSupportedSite,
    isBybitLinkExpired,
    isKycCompleted,
    hasBybitLinkExpiry,
  ]);

  useEffect(() => {
    setCopiedBybitLink(false);
  }, [bybitLink]);

  useEffect(() => {
    setCopiedFaceLink(false);
  }, [faceRemainingMs, faceVerification]);

  useEffect(() => {
    if (!faceVerification?.provider) {
      setFaceRemainingMs(null);
      return;
    }
    const expiresInMs = getExpiredTimeByProvider(faceVerification.provider);

    const expiresAt =
      typeof expiresInMs === 'number' && !Number.isNaN(expiresInMs)
        ? Date.now() + expiresInMs
        : null;

    const updateRemaining = () => {
      if (!expiresAt) {
        setFaceRemainingMs(null);
        return;
      }
      const msLeft = expiresAt - Date.now();
      const clamped = msLeft > 0 ? msLeft : 0;
      setFaceRemainingMs(clamped);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [faceVerification?.fetchedAt, faceVerification?.provider]);

  const isFaceVerificationExpired =
    faceRemainingMs !== null && faceRemainingMs <= 0;

  const resolvedFaceVerification = useMemo((): FaceVerificationState | null => {
    if (!faceVerification) return null;
    const urlFromState = faceVerification.url ?? null;
    if (urlFromState) return faceVerification;
    const cache = rewardFaceCache ?? null;
    const reward = rewards.find((r) => r.awardId === faceVerification.awardId);
    if (!cache || !reward) return faceVerification;
    const cacheKey = `${reward.awardId}:${reward.specCode}`;
    const entry = cache[cacheKey];
    const urlFromCache = entry?.url ?? null;
    if (!urlFromCache) return faceVerification;
    return { ...faceVerification, url: urlFromCache };
  }, [faceVerification, rewardFaceCache, rewards]);

  useEffect(() => {
    if (!faceVerification?.url || isFaceVerificationExpired) {
      return;
    }

    try {
      const faceUrl = new URL(faceVerification.url);
      const currentLang = faceUrl.searchParams.get('lang');

      if (currentLang === language) {
        return;
      }

      faceUrl.searchParams.set('lang', language);
      const updatedUrl = faceUrl.toString();
      const updatedState: FaceVerificationState = {
        ...faceVerification,
        url: updatedUrl,
      };
      setFaceVerification(updatedState);
      void persistFaceVerification(updatedState);
    } catch {
      // ignore malformed url
    }
  }, [faceVerification, isFaceVerificationExpired, language]);

  const handleLanguageChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextLanguage = event.target.value.trim();
      setLanguage(nextLanguage || 'en');
    },
    [],
  );

  const handleCopyBybitLink = useCallback(async () => {
    if (!bybitLink) return;

    try {
      await navigator.clipboard.writeText(bybitLink);
      setCopiedBybitLink(true);
      setTimeout(() => setCopiedBybitLink(false), 1500);
    } catch (err) {
      console.error('Failed to copy link', err);
      setCopiedBybitLink(false);
    }
  }, [bybitLink, isBybitLinkExpired]);

  const handleOpenBybitLink = useCallback(() => {
    if (!bybitLink) return;
    window.open(bybitLink, '_blank', 'noopener,noreferrer');
  }, [bybitLink]);

  const handleCopyFaceLink = useCallback(async () => {
    if (!resolvedFaceVerification?.url) return;
    const value = resolvedFaceVerification.url;
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedFaceLink(true);
      setTimeout(() => setCopiedFaceLink(false), 1500);
    } catch (err) {
      console.error('Failed to copy face link', err);
      setCopiedFaceLink(false);
    }
  }, [resolvedFaceVerification?.url]);

  const handleOpenFaceLink = useCallback(() => {
    if (!resolvedFaceVerification?.url) return;
    window.open(resolvedFaceVerification.url, '_blank', 'noopener,noreferrer');
  }, [resolvedFaceVerification?.url]);

  const formattedRewardsFetchedAt = useMemo(() => {
    if (!rewardsFetchedAt) return 'Not checked yet';
    const date = new Date(rewardsFetchedAt);
    if (Number.isNaN(date.getTime())) return 'Not checked yet';
    return `Checked at ${date.toLocaleTimeString()}`;
  }, [rewardsFetchedAt]);

  const handleClearBybitLink = useCallback(() => {
    void storageRemove([
      BYBIT_LINK_STORAGE_KEY,
      BYBIT_LINK_EXPIRES_AT_STORAGE_KEY,
    ]);
    setBybitLink(null);
    setBybitLinkExpiresAt(null);
  }, []);

  const primaryBybitCta = isLoading
    ? 'Requesting...'
    : bybitLink
      ? 'Refresh link'
      : 'Get link';

  const formattedBybitRemaining = useMemo(() => {
    if (!hasBybitLinkExpiry) return null;
    if (!bybitRemainingMs && bybitRemainingMs !== 0) return null;
    const totalSeconds = Math.max(0, Math.floor(bybitRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [bybitRemainingMs, hasBybitLinkExpiry]);

  const faceFormattedRemaining = useMemo(() => {
    if (!faceRemainingMs && faceRemainingMs !== 0) return null;
    const totalSeconds = Math.max(0, Math.floor(faceRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [faceRemainingMs]);

  const formattedKysCheckedAt = useMemo(() => {
    if (!kysStatus?.fetchedAt) return 'Not checked yet';
    const date = new Date(kysStatus.fetchedAt);
    if (Number.isNaN(date.getTime())) {
      return 'Not checked yet';
    }
    return `Checked at ${date.toLocaleTimeString()}`;
  }, [kysStatus]);

  const applicantName = useMemo(() => {
    if (!kysStatus?.applicant) return '—';
    const { firstname, lastname } = kysStatus.applicant;
    const fullName = `${firstname ?? ''} ${lastname ?? ''}`.trim();
    return fullName || '—';
  }, [kysStatus]);

  const inlineKycPill = useMemo(() => {
    const label = kysStatus
      ? kysStatus.completed
        ? 'KYC approved'
        : kysStatus.status || 'Not passed'
      : 'Not checked';
    const pillClass = kysStatus?.completed ? 'pill-ok' : 'pill-warning';
    return { label, pillClass };
  }, [kysStatus]);

  const unclaimedRewards = useMemo(
    () => rewards.filter((reward) => reward.statusText === 'Claim'),
    [rewards],
  );

  return (
    <div className="popup-shell">
      <header className="header">
        <div>
          <p className="eyebrow">KYC Helper</p>
          {mainTab === 'bybit' && (
            <p className="subtitle">Works on bybit.com / bybitglobal.com</p>
          )}
        </div>
        <div className="header-actions">
          <div>
            <a
              className="text-link text-link-compact"
              href="https://t.me/risknporsche"
              target="_blank"
              rel="noreferrer"
            >
              @risknporsche
            </a>
            <span className="pill-version">v{extensionVersion}</span>
          </div>
          {mainTab === 'bybit' && (
            <span
              className={`pill ${isSupportedSite === false ? 'pill-danger' : 'pill-ok'}`}
            >
              {isSupportedSite === false ? 'Unsupported tab' : 'Ready'}
            </span>
          )}
        </div>
      </header>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${mainTab === 'bybit' ? 'active' : ''}`}
          onClick={() => setMainTab('bybit')}
        >
          Bybit
        </button>
        <button
          type="button"
          className={`tab ${mainTab === 'other' ? 'active' : ''}`}
          onClick={() => setMainTab('other')}
        >
          Other
        </button>
      </div>

      {mainTab === 'bybit' ? (
        <>
          <div className="tabs sub-tabs">
            <button
              type="button"
              className={`tab ${bybitTab === 'link' ? 'active' : ''}`}
              onClick={() => setBybitTab('link')}
            >
              Link
            </button>
            <button
              type="button"
              className={`tab ${bybitTab === 'kyc' ? 'active' : ''}`}
              onClick={() => setBybitTab('kyc')}
            >
              KYC
            </button>
            <button
              type="button"
              className={`tab ${bybitTab === 'rewards' ? 'active' : ''}`}
              onClick={() => setBybitTab('rewards')}
            >
              Rewards
            </button>
          </div>

          {bybitTab === 'link' ? (
            <>
              <BybitLinkCard
                bybitLink={bybitLink}
                bybitLinkError={bybitLinkError}
                bybitStatusText={bybitStatusText}
                language={language}
                languageOptions={languageOptions}
                onLanguageChange={handleLanguageChange}
                onGetLink={handleGetBybitLink}
                onOpenLink={handleOpenBybitLink}
                onCopyLink={handleCopyBybitLink}
                onClearLink={handleClearBybitLink}
                isGetLinkDisabled={isBybitGetLinkDisabled}
                isLinkExpired={isBybitLinkExpired}
                formattedRemaining={formattedBybitRemaining}
                hasExpiry={hasBybitLinkExpiry}
                primaryCta={primaryBybitCta}
                isSupportedSite={isSupportedSite}
                isLoading={isLoading}
                copied={copiedBybitLink}
              />

              <BybitKycInlineCard
                formattedKysCheckedAt={formattedKysCheckedAt}
                inlineKycPill={inlineKycPill}
                onCheckStatus={handleCheckKysStatus}
                isSupportedSite={isSupportedSite}
                isCheckingStatus={isCheckingStatus}
                kysError={kysError}
              />
            </>
          ) : null}
        </>
      ) : null}

      {mainTab === 'other' ? (
        <OtherLinkCard
          language={language}
          onLanguageChange={handleLanguageChange}
          languageOptions={languageOptions}
        />
      ) : null}

      {mainTab === 'bybit' && bybitTab === 'kyc' ? (
        <BybitKycCard
          kysStatus={kysStatus}
          kysError={kysError}
          formattedKysCheckedAt={formattedKysCheckedAt}
          isCheckingStatus={isCheckingStatus}
          isSupportedSite={isSupportedSite}
          applicantName={applicantName}
          onCheckStatus={handleCheckKysStatus}
        />
      ) : null}

      {mainTab === 'bybit' && bybitTab === 'rewards' ? (
        <BybitRewardsSection
          rewards={rewards}
          unclaimedRewards={unclaimedRewards}
          rewardsError={rewardsError}
          hasFetchedRewards={hasFetchedRewards}
          formattedRewardsFetchedAt={formattedRewardsFetchedAt}
          isLoadingRewards={isLoadingRewards}
          isSupportedSite={isSupportedSite}
          onFetchRewards={handleFetchRewards}
          claimError={claimError}
          faceVerification={resolvedFaceVerification}
          isFaceVerificationExpired={isFaceVerificationExpired}
          faceFormattedRemaining={faceFormattedRemaining}
          language={language}
          languageOptions={languageOptions}
          onLanguageChange={handleLanguageChange}
          onCopyFaceLink={handleCopyFaceLink}
          copiedFaceLink={copiedFaceLink}
          onOpenFaceLink={handleOpenFaceLink}
          onClaimReward={handleClaimReward}
          isLoadingRewardsOrClaiming={(awardId) =>
            isSupportedSite !== true ||
            isLoadingRewards ||
            claimingRewardId === awardId
          }
          formatSeconds={formatSeconds}
        />
      ) : null}
    </div>
  );
};
