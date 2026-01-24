import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import type {
  BybitApiResp,
  GetVerificationSdkKysInfo,
  GetVerificationSdkKysInfoPayload,
  KysStatusSummary,
  ClaimRewardResult,
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

type ContentScriptResponse<T> =
  | { ok: true; data: T; userId?: string }
  | { ok: false; error: string };

type FaceVerificationState = {
  awardId: number;
  faceToken: string;
  url?: string;
  ticket?: string;
  bizId?: string;
  fetchedAt?: string;
};

type StoredRewardsState = {
  list: RewardEntity[];
  error: string | null;
  fetchedAt: string | null;
};

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

const languageOptions = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'et', label: 'Eesti' },
  { code: 'pt-br', label: 'Português Brasileiro' },
  { code: 'zh-tw', label: '繁體中文' },
  { code: 'de', label: 'Deutsch' },
  { code: 'pt', label: 'Português' },
  { code: 'hu', label: 'Magyar' },
  { code: 'zh', label: '简体中文' },
  { code: 'th', label: 'ไทย' },
  { code: 'id', label: 'Indonesia' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ar', label: 'العربية' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ms', label: 'Melayu' },
  { code: 'ur', label: 'اردو' },
  { code: 'bn', label: 'বাংলা' },
  { code: 'fl', label: 'Pilipino' },
  { code: 'fr', label: 'Français' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'uk', label: 'Українська' },
  { code: 'ro', label: 'Română' },
  { code: 'cs', label: 'Čeština' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'my', label: 'မြန်မာ' },
  { code: 'lo', label: 'ລາວ' },
  { code: 'km', label: 'ខ្មែរ' },
  { code: 'bg', label: 'Български' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'hy', label: 'Հայերեն' },
  { code: 'lt', label: 'Lietuvių' },
  { code: 'sk', label: 'Slovenský' },
  { code: 'da', label: 'Dansk' },
  { code: 'lv', label: 'Latviešu' },
  { code: 'fa', label: 'فارسی' },
  { code: 'ka', label: 'ქართული' },
  { code: 'sv', label: 'Svenska' },
  { code: 'he', label: 'עִברִית' },
  { code: 'si', label: 'සිංහල' },
  { code: 'am', label: 'አማርኛ' },
  { code: 'sgn-de', label: 'Deutsche Gebärdensprache' },
  { code: 'no', label: 'Norsk' },
  { code: 'sr', label: 'Srpski' },
  { code: 'sw', label: 'Kiswahili' },
  { code: 'zu', label: 'Zulu' },
  { code: 'ha', label: 'Hausa' },
  { code: 'az', label: 'Azərbaycan dili' },
  { code: 'uz', label: 'Oʻzbek' },
  { code: 'hr', label: 'Hrvatski' },
  { code: 'kk', label: 'Қазақ тілі' },
  { code: 'fi', label: 'Suomi' },
  { code: 'sl', label: 'Slovenščina' },
  { code: 'tg', label: 'Тоҷикӣ' },
  { code: 'ca', label: 'Català' },
] as const;

const KYS_STATUS_STORAGE_KEY = 'lastKysStatus';
const REWARDS_STORAGE_KEY = 'lastRewards';
const FACE_VERIFICATION_STORAGE_KEY = 'lastRewardFaceVerification';
const BYBIT_LINK_STORAGE_KEY = 'bybitLastLink';
const BYBIT_LINK_EXPIRES_AT_STORAGE_KEY = 'bybitLastLinkExpiresAt';
const PREFERRED_LANG_STORAGE_KEY = 'preferredLang';
const FACE_VERIFICATION_TTL_MS = 10 * 60 * 1000;

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
  const [isLoading, setIsLoading] = useState(false);
  const [bybitLinkError, setBybitLinkError] = useState<string | null>(null);
  const [bybitLink, setBybitLink] = useState<string | null>(null);
  const [bybitLinkExpiresAt, setBybitLinkExpiresAt] = useState<number | null>(null);
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
  const [faceRemainingMs, setFaceRemainingMs] = useState<number | null>(null);
  const [copiedFaceLink, setCopiedFaceLink] = useState(false);

  const isKycCompleted = kysStatus?.completed === true;

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
        ]);

        const storedBybitLink =
          typeof stored[BYBIT_LINK_STORAGE_KEY] === 'string'
            ? (stored[BYBIT_LINK_STORAGE_KEY] as string)
            : null;
        setBybitLink(storedBybitLink);

        const storedLang =
          typeof stored[PREFERRED_LANG_STORAGE_KEY] === 'string'
            ? (stored[PREFERRED_LANG_STORAGE_KEY] as string).trim()
            : '';
        setLanguage(storedLang || 'en');

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
            typeof rewardsState.error === 'string' || rewardsState.error === null
              ? rewardsState.error
              : null,
          );
          setRewardsFetchedAt(
            typeof rewardsState.fetchedAt === 'string' ? rewardsState.fetchedAt : null,
          );
          setHasFetchedRewards(
            rewardsState.list.length > 0 || rewardsState.fetchedAt !== null,
          );
        }

        const faceRaw = stored[FACE_VERIFICATION_STORAGE_KEY];
        if (
          faceRaw &&
          typeof faceRaw === 'object' &&
          typeof (faceRaw as StoredFaceVerification).faceToken === 'string'
        ) {
          setFaceVerification(faceRaw as StoredFaceVerification);
        }
      } catch {
        // ignore storage errors
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
    void storageSet(PREFERRED_LANG_STORAGE_KEY, language);
  }, [language]);

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
    if (!bybitLink || !bybitLinkExpiresAt) {
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
  }, [bybitLink, bybitLinkExpiresAt]);

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
        payload: defaultPayload,
      });

      if (!response?.ok) {
        throw new Error(response?.error ?? 'No response from content script');
      }

      const userId = response.userId ?? '';
      if (!userId) {
        throw new Error('User id is missing');
      }

      const result = { ...response.data.result, userId };

      const hash = await sha256(userId);

      const hashResponse = await bindToken({ hash, token: result.kycToken });
      const resolvedLink = `${import.meta.env.VITE_FRONTEND_BASE_URL}?hash=${hashResponse}&lang=${language}`;
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      await storageSet(BYBIT_LINK_STORAGE_KEY, resolvedLink);
      await storageSet(BYBIT_LINK_EXPIRES_AT_STORAGE_KEY, expiresAt);
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
      const normalizedMessage = message.toLowerCase().includes('message port closed')
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
      void persistRewards({
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

      void persistRewards({
        list: response.data,
        error: emptyError,
        fetchedAt: now,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fetch rewards';
      const normalizedMessage = message.toLowerCase().includes('message port closed')
        ? 'The page reloaded — reopen popup and press Refresh again.'
        : message;
      setRewardsError(normalizedMessage);
      const now = new Date().toISOString();
      setRewardsFetchedAt(now);
      void persistRewards({
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
      void persistFaceVerification(null);

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
          const hash = await sha256(userId);
          const hashResponse = await bindToken({ hash, token: result.faceToken });
          const resolvedFaceLink = `${import.meta.env.VITE_FRONTEND_BASE_URL}?hash=${hashResponse}&lang=${language}`;

          const faceState: FaceVerificationState = {
            awardId: reward.awardId,
            faceToken: result.faceToken,
            url: resolvedFaceLink,
            ticket: result.ticket,
            bizId: result.bizId,
            fetchedAt,
          };

          void persistFaceVerification(faceState);
          setFaceVerification(faceState);
          setBybitTab('rewards');
        } else {
          void persistFaceVerification(null);
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
  ]);

  useEffect(() => {
    setCopiedBybitLink(false);
  }, [bybitLink]);

  useEffect(() => {
    setCopiedFaceLink(false);
  }, [faceRemainingMs, faceVerification]);

  useEffect(() => {
    if (!faceVerification?.fetchedAt) {
      setFaceRemainingMs(null);
      return;
    }

    const fetchedAtTs = new Date(faceVerification.fetchedAt).getTime();
    if (Number.isNaN(fetchedAtTs)) {
      setFaceRemainingMs(null);
      return;
    }

    const expiresAt = fetchedAtTs + FACE_VERIFICATION_TTL_MS;

    const updateRemaining = () => {
      const msLeft = expiresAt - Date.now();
      const clamped = msLeft > 0 ? msLeft : 0;
      setFaceRemainingMs(clamped);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [faceVerification?.fetchedAt]);

  const isFaceVerificationExpired =
    faceRemainingMs !== null && faceRemainingMs <= 0;

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
    if (!bybitLink || isBybitLinkExpired) return;

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
    if (!bybitLink || isBybitLinkExpired) return;
    window.open(bybitLink, '_blank', 'noopener,noreferrer');
  }, [bybitLink, isBybitLinkExpired]);

  const handleCopyFaceLink = useCallback(async () => {
    if (!faceVerification) return;
    const isExpired = isFaceVerificationExpired;
    const value = faceVerification.url;
    if (!value || isExpired) return;

    try {
      await navigator.clipboard.writeText(value);
      setCopiedFaceLink(true);
      setTimeout(() => setCopiedFaceLink(false), 1500);
    } catch (err) {
      console.error('Failed to copy face link', err);
      setCopiedFaceLink(false);
    }
  }, [faceVerification]);

  const handleOpenFaceLink = useCallback(() => {
    const isExpired = isFaceVerificationExpired;
    if (!faceVerification?.url || isExpired) return;
    window.open(faceVerification.url, '_blank', 'noopener,noreferrer');
  }, [isFaceVerificationExpired, faceVerification]);

  const formattedRewardsFetchedAt = useMemo(() => {
    if (!rewardsFetchedAt) return 'Not checked yet';
    const date = new Date(rewardsFetchedAt);
    if (Number.isNaN(date.getTime())) return 'Not checked yet';
    return `Checked at ${date.toLocaleTimeString()}`;
  }, [rewardsFetchedAt]);

  const handleClearBybitLink = useCallback(() => {
    void storageRemove([BYBIT_LINK_STORAGE_KEY, BYBIT_LINK_EXPIRES_AT_STORAGE_KEY]);
    setBybitLink(null);
    setBybitLinkExpiresAt(null);
  }, []);

  const primaryBybitCta = isLoading
    ? 'Requesting...'
    : bybitLink
      ? 'Refresh link'
      : 'Get token';

  const formattedBybitRemaining = useMemo(() => {
    if (!bybitRemainingMs && bybitRemainingMs !== 0) return null;
    const totalSeconds = Math.max(0, Math.floor(bybitRemainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [bybitRemainingMs]);

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
    () =>
      rewards.filter((reward) => reward.statusText === "Claim"),
    [rewards],
  );

  return (
    <div className="popup-shell">
      <header className="header">
        <div>
          <p className="eyebrow">Bybit KYC Helper</p>
          <p className="subtitle">Works on bybit.com / bybitglobal.com</p>
        </div>
        <span
          className={`pill ${isSupportedSite === false ? 'pill-danger' : 'pill-ok'}`}
        >
          {isSupportedSite === false ? 'Unsupported tab' : 'Ready'}
        </span>
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
          faceVerification={faceVerification}
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

      <div className="actions secondary-row footer-row">
        <a
          className="text-link"
          href="https://t.me/risknporsche"
          target="_blank"
          rel="noreferrer"
        >
          @risknporsche
        </a>
      </div>
    </div>
  );
};
