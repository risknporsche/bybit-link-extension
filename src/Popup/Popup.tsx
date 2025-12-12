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
const FACE_VERIFICATION_TTL_MS = 10 * 60 * 1000;

const readStoredKysStatus = (): KysStatusSummary | null => {
  const stored = localStorage.getItem(KYS_STATUS_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as KysStatusSummary;
  } catch {
    return null;
  }
};

const persistKysStatus = (status: KysStatusSummary) => {
  localStorage.setItem(KYS_STATUS_STORAGE_KEY, JSON.stringify(status));
};

const readStoredRewards = (): StoredRewardsState => {
  const stored = localStorage.getItem(REWARDS_STORAGE_KEY);
  if (!stored) return { list: [], error: null, fetchedAt: null };

  try {
    const parsed = JSON.parse(stored) as RewardEntity[] | StoredRewardsState;

    if (Array.isArray(parsed)) {
      return { list: parsed, error: null, fetchedAt: null };
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as StoredRewardsState).list)
    ) {
      const { list, error, fetchedAt } = parsed as StoredRewardsState;
      return {
        list,
        error: typeof error === 'string' || error === null ? error : null,
        fetchedAt: typeof fetchedAt === 'string' ? fetchedAt : null,
      };
    }

    return { list: [], error: null, fetchedAt: null };
  } catch {
    return { list: [], error: null, fetchedAt: null };
  }
};

const persistRewards = (state: StoredRewardsState) => {
  try {
    localStorage.setItem(REWARDS_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};

type StoredFaceVerification = FaceVerificationState & { fetchedAt: string };

const readStoredFaceVerification = (): FaceVerificationState | null => {
  const raw = localStorage.getItem(FACE_VERIFICATION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredFaceVerification;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.faceToken !== 'string' ||
      typeof parsed.fetchedAt !== 'string'
    ) {
      return null;
    }

    return {
      awardId: parsed.awardId,
      faceToken: parsed.faceToken,
      url: parsed.url,
      ticket: parsed.ticket,
      bizId: parsed.bizId,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
};

const persistFaceVerification = (state: FaceVerificationState | null) => {
  try {
    if (!state) {
      localStorage.removeItem(FACE_VERIFICATION_STORAGE_KEY);
      localStorage.removeItem('lastRewardFaceToken');
      localStorage.removeItem('lastRewardFaceTokenFetchedAt');
      return;
    }

    const payload: StoredFaceVerification = {
      ...state,
      fetchedAt: state.fetchedAt ?? new Date().toISOString(),
    };

    localStorage.setItem(FACE_VERIFICATION_STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem('lastRewardFaceToken', state.faceToken);
    localStorage.setItem('lastRewardFaceTokenFetchedAt', payload.fetchedAt);
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
  const [linkError, setLinkError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(
    localStorage.getItem('lastLink') ?? null,
  );
  const [language, setLanguage] = useState<string>(
    () => localStorage.getItem('preferredLang') ?? 'en',
  );
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(() => {
    const stored = localStorage.getItem('lastLinkExpiresAt');
    return stored ? Number(stored) : null;
  });
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [isSupportedSite, setIsSupportedSite] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [kysStatus, setKysStatus] = useState<KysStatusSummary | null>(() =>
    readStoredKysStatus(),
  );
  const [kysError, setKysError] = useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [activeTab, setActiveTab] = useState<'link' | 'kyc' | 'rewards'>('link');
  const storedRewards = readStoredRewards();
  const [rewards, setRewards] = useState<RewardEntity[]>(storedRewards.list);
  const [hasFetchedRewards, setHasFetchedRewards] = useState<boolean>(
    storedRewards.list.length > 0 || storedRewards.fetchedAt !== null,
  );
  const [rewardsError, setRewardsError] = useState<string | null>(
    storedRewards.error,
  );
  const [rewardsFetchedAt, setRewardsFetchedAt] = useState<string | null>(
    storedRewards.fetchedAt,
  );
  const [isLoadingRewards, setIsLoadingRewards] = useState(false);
  const [claimingRewardId, setClaimingRewardId] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [faceVerification, setFaceVerification] = useState<FaceVerificationState | null>(
    () => readStoredFaceVerification(),
  );
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
    const checkActiveTab = async () => {
      try {
        const tab = await getActiveTab();
        const url = tab?.url;

        if (!url) {
          setIsSupportedSite(false);
          setLinkError('Open this popup on bybit.com or bybitglobal.com.');
          return;
        }

        const hostname = new URL(url).hostname;
        const allowed = isBybitHost(hostname);
        setIsSupportedSite(allowed);

        if (!allowed) {
          setLinkError('Open this popup on bybit.com or bybitglobal.com.');
        }
      } catch (err) {
        setIsSupportedSite(false);
        const message =
          err instanceof Error ? err.message : 'Failed to read active tab';
        setLinkError(message);
      }
    };

    void checkActiveTab();
  }, []);

  useEffect(() => {
    localStorage.setItem('preferredLang', language);
  }, [language]);

  useEffect(() => {
    if (!link) {
      return;
    }

    try {
      const linkUrl = new URL(link);
      const currentLang = linkUrl.searchParams.get('lang');

      if (currentLang === language) {
        return;
      }

      linkUrl.searchParams.set('lang', language);
      const updatedLink = linkUrl.toString();
      setLink(updatedLink);
      localStorage.setItem('lastLink', updatedLink);
      if (linkExpiresAt) {
        localStorage.setItem('lastLinkExpiresAt', String(linkExpiresAt));
      }
    } catch {
      // Ignore malformed stored links
    }
  }, [language, link, linkExpiresAt]);

  useEffect(() => {
    if (!link || !linkExpiresAt) {
      setRemainingMs(null);
      return;
    }

    const updateRemaining = () => {
      const msLeft = linkExpiresAt - Date.now();
      setRemainingMs(msLeft > 0 ? msLeft : 0);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => clearInterval(timer);
  }, [link, linkExpiresAt]);

  const handleGetLink = useCallback(async () => {
    if (isSupportedSite !== true) {
      setLinkError('Open this popup on bybit.com or bybitglobal.com.');
      return;
    }

    if (isKycCompleted) {
      setLinkError('KYC already completed — link request disabled.');
      return;
    }

    setIsLoading(true);
    setLinkError(null);
    setLink(null);
    setLinkExpiresAt(null);

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

      const userId =
        response.userId ?? localStorage.getItem('BYBIT_GA_UID') ?? '';
      if (!userId) {
        throw new Error('User id is missing');
      }

      const result = { ...response.data.result, userId };

      const hash = await sha256(userId);

      const hashResponse = await bindToken({ hash, token: result.kycToken });
      const resolvedLink = `${import.meta.env.VITE_FRONTEND_BASE_URL}?hash=${hashResponse}&lang=${language}`;
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      localStorage.setItem('lastLink', resolvedLink);
      localStorage.setItem('lastLinkExpiresAt', String(expiresAt));
      setLink(resolvedLink);
      setLinkExpiresAt(expiresAt);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to request link';
      setLinkError(message);
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

      persistKysStatus(response.data);
      setKysStatus(response.data);
    } catch (_err) {
      const message =
        _err instanceof Error ? _err.message : 'Failed to check KYC status';
      const normalizedMessage = message.toLowerCase().includes('message port closed')
        ? 'The page reloaded — reopen popup and try again.'
        : message;

      const cached = readStoredKysStatus();
      const fallbackStatus = cached
        ? {
            ...cached,
            completed: false,
            status: 'PENDING',
            fetchedAt: new Date().toISOString(),
            error: undefined,
          }
        : buildPendingKysStatus();

      persistKysStatus(fallbackStatus);
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
      persistRewards({
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

      persistRewards({
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
      persistRewards({
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
      persistFaceVerification(null);

      try {
        const response = await sendMessageToActiveTab<ClaimRewardResult>({
          type: 'CLAIM_REWARD',
          payload: { awardId: reward.awardId, specCode: reward.specCode },
        });

        if (!response?.ok) {
          throw new Error(response?.error ?? 'Failed to claim reward');
        }

        const userId =
          response.userId ?? localStorage.getItem('BYBIT_GA_UID') ?? '';
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

          persistFaceVerification(faceState);
          setFaceVerification(faceState);
          setActiveTab('rewards');
        } else {
          persistFaceVerification(null);
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

  const isGetLinkDisabled = isLoading || isSupportedSite !== true || isKycCompleted;
  const isLinkExpired =
    !!link && !!linkExpiresAt && Date.now() >= linkExpiresAt;

  const statusText = useMemo(() => {
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
    if (isLinkExpired) {
      return 'Link expired — request a new one.';
    }
    if (linkError) {
      return linkError;
    }
    if (link) {
      return 'Link ready';
    }
    return 'Idle';
  }, [isLoading, linkError, link, isSupportedSite, isLinkExpired, isKycCompleted]);

  useEffect(() => {
    setCopied(false);
  }, [link]);

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
      persistFaceVerification(updatedState);
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

  const handleCopyLink = useCallback(async () => {
    if (!link || isLinkExpired) return;

    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error('Failed to copy link', err);
      setCopied(false);
    }
  }, [isLinkExpired, link]);

  const handleOpenLink = useCallback(() => {
    if (!link || isLinkExpired) return;
    window.open(link, '_blank', 'noopener,noreferrer');
  }, [link, isLinkExpired]);

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

  const handleClearLink = useCallback(() => {
    localStorage.removeItem('lastLink');
    localStorage.removeItem('lastLinkExpiresAt');
    setLink(null);
    setLinkExpiresAt(null);
  }, []);

  const primaryCta = isLoading ? 'Requesting...' : link ? 'Refresh link' : 'Get token';

  const formattedRemaining = useMemo(() => {
    if (!remainingMs && remainingMs !== 0) return null;
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [remainingMs]);

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
      rewards.filter(
        (reward) => reward.status === 'AWARDING_STATUS_UNCLAIMED',
      ).length,
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
          className={`tab ${activeTab === 'link' ? 'active' : ''}`}
          onClick={() => setActiveTab('link')}
        >
          Link
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'kyc' ? 'active' : ''}`}
          onClick={() => setActiveTab('kyc')}
        >
          KYC
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'rewards' ? 'active' : ''}`}
          onClick={() => setActiveTab('rewards')}
        >
          Rewards
        </button>
      </div>

      {activeTab === 'link' ? (
        <>
          <section
            className={`card ${link ? 'card-success' : ''} ${
              linkError ? 'card-error' : ''
            }`}
          >
            <div className="card-top">
              <div className="card-title">
                {link
                  ? 'Token obtained.'
                  : isLoading
                    ? 'Requesting token...'
                    : 'Ready to fetch token'}
              </div>
              <span className="muted-text">{statusText}</span>
            </div>

            <div className="option-row">
              <div className="option-head">
                <span className="option-label">Language for generated link</span>
                <span className="muted-text">Saved for next time</span>
              </div>
              <select
                id="language"
                className="text-input"
                value={language}
                onChange={handleLanguageChange}
              >
                {languageOptions.map(({ code, label }) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="input-row">
              <input
                className="link-input"
                readOnly
                value={link ?? 'Request a link to see it here'}
              />
              <button
                className="btn ghost"
                type="button"
                onClick={handleCopyLink}
                disabled={!link || isLinkExpired}
                title={link ? (isLinkExpired ? 'Link expired' : 'Copy link') : 'No link yet'}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {link ? (
              <div className="countdown-row">
                <span className={`meta-label ${isLinkExpired ? 'accent-danger' : 'accent'}`}>
                  {isLinkExpired
                    ? 'Link expired — request a new one.'
                    : formattedRemaining
                      ? `Expires in ${formattedRemaining}`
                      : 'Calculating expiry...'}
                </span>
              </div>
            ) : null}

            <div className="meta-row">
              <span className="meta-label">
                {isSupportedSite === null
                  ? 'Checking active tab...'
                  : isSupportedSite
                    ? 'Active tab matches bybit.com domains'
                    : 'Open bybit.com to enable actions.'}
              </span>
              <span className="meta-label">Language: {language}</span>
              {link ? (
                <span className="meta-label accent">Saved locally for quick reuse</span>
              ) : null}
            </div>
          </section>

          <div className="actions">
            <button
              className="btn primary"
              type="button"
              onClick={handleGetLink}
              disabled={isGetLinkDisabled}
            >
              {primaryCta}
            </button>
            <button
              className="btn secondary"
              type="button"
              onClick={handleOpenLink}
              disabled={!link || isLinkExpired}
            >
              Open link
            </button>
          </div>

          <section className="card status-inline-card">
            <div className="card-top">
              <div className="card-title">KYC status</div>
              <span className="muted-text">{formattedKysCheckedAt}</span>
            </div>
            <div className="status-row">
              <span className={`pill ${inlineKycPill.pillClass}`}>
                {inlineKycPill.label}
              </span>
              <button
                className="btn ghost"
                type="button"
                onClick={handleCheckKysStatus}
                disabled={isCheckingStatus}
              >
                {isCheckingStatus ? 'Checking...' : 'Update status'}
              </button>
            </div>
            {kysError ? (
              <div className="alert alert-error">
                <p className="alert-title">Request failed</p>
                <p className="muted-text">{kysError}</p>
              </div>
            ) : null}
          </section>

          <div className="actions secondary-row">
            <button
              className="btn ghost subtle"
              type="button"
              onClick={handleClearLink}
              disabled={!link}
            >
              Clear saved link
            </button>
          </div>
        </>
      ) : null}

      {activeTab === 'kyc' ? (
        <section
          className={`card ${kysStatus?.completed ? 'card-success' : ''} ${
            kysError ? 'card-error' : ''
          }`}
        >
          <div className="card-top">
            <div className="card-title">
              {kysStatus?.completed ? 'KYC approved' : 'KYC status'}
            </div>
            <span className="muted-text">
              {isCheckingStatus ? 'Checking KYC...' : formattedKysCheckedAt}
            </span>
          </div>

          <div className="status-row">
            <span
              className={`pill ${kysStatus?.completed ? 'pill-ok' : 'pill-warning'}`}
            >
              {kysStatus?.status ||
                (isCheckingStatus ? 'Checking...' : 'Not checked yet')}
            </span>
            <span className="meta-label">Level: {kysStatus?.level || 'LEVEL_1'}</span>
          </div>

          <div className="status-grid">
            <div className="status-cell">
              <span className="meta-label">Applicant</span>
              <span className="status-value">{applicantName}</span>
            </div>
            <div className="status-cell">
              <span className="meta-label">Country</span>
              <span className="status-value">
                {kysStatus?.applicant?.country ?? '—'}
              </span>
            </div>
            <div className="status-cell">
              <span className="meta-label">Nationality</span>
              <span className="status-value">
                {kysStatus?.applicant?.nationality ?? '—'}
              </span>
            </div>
          </div>

          {kysError ? (
            <div className="alert alert-error">
              <p className="alert-title">Request failed</p>
              <p className="muted-text">{kysError}</p>
            </div>
          ) : null}

          <div className="actions">
            <button
              className="btn secondary"
              type="button"
              onClick={handleCheckKysStatus}
              disabled={isSupportedSite !== true || isCheckingStatus}
            >
              {isCheckingStatus
                ? 'Checking...'
                : kysStatus
                  ? 'Refresh status'
                  : 'Check status'}
            </button>
          </div>
        </section>
      ) : null}

      {activeTab === 'rewards' ? (
        <>
          <section
            className={`card ${rewards.length ? 'card-success' : ''} ${
              rewardsError ? 'card-error' : ''
            }`}
          >
            <div className="card-top">
              <div className="card-title">Rewards</div>
              <span className="muted-text">
                {isLoadingRewards
                  ? 'Fetching rewards...'
                  : rewards.length
                    ? `${rewards.length} found`
                    : hasFetchedRewards
                      ? 'Awardings list is empty'
                      : 'No rewards fetched yet'}
              </span>
              <span className="muted-text">{formattedRewardsFetchedAt}</span>
            </div>

            <div className="reward-summary">
              <span className={`pill ${unclaimedRewards ? 'pill-ok' : 'pill-warning'}`}>
                Found {unclaimedRewards} unclaimed reward(s)
              </span>
              <button
                className="btn secondary"
                type="button"
                onClick={handleFetchRewards}
                disabled={isSupportedSite !== true || isLoadingRewards}
              >
                {isLoadingRewards ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {rewardsError ? (
              <div className="alert alert-error">
                <p className="alert-title">Request failed</p>
                <p className="muted-text">{rewardsError}</p>
              </div>
            ) : hasFetchedRewards && rewards.length === 0 ? (
              <div className="alert alert-error">
                <p className="alert-title">Awardings list is empty</p>
                <p className="muted-text">No rewards returned from API.</p>
              </div>
            ) : null}
          </section>

          {claimError ? (
            <section className="card card-error">
              <div className="card-top">
                <div className="card-title">Claim failed</div>
                <span className="muted-text">Retry or refresh rewards</span>
              </div>
              <p className="muted-text">{claimError}</p>
            </section>
          ) : null}

          {faceVerification ? (
            <section className="card reward-card">
              <div className="card-top">
                <div className="card-title reward-title">Face verification required</div>
                <span className="muted-text">
                  {isFaceVerificationExpired
                    ? 'Face link expired — request again.'
                    : faceFormattedRemaining
                      ? `Expires in ${faceFormattedRemaining}`
                      : 'Calculating expiry...'}
                </span>
              </div>

              <p className="muted-text">
                Complete face verification to finish claiming award {faceVerification.awardId}.
              </p>

              <div className="option-row">
                <div className="option-head">
                  <span className="option-label">Language for face link</span>
                  <span className="muted-text">Saved for next time</span>
                </div>
                <select
                  id="face-language"
                  className="text-input"
                  value={language}
                  onChange={handleLanguageChange}
                >
                  {languageOptions.map(({ code, label }) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-row">
                <input
                  className="link-input"
                  readOnly
                  value={faceVerification.url ?? 'Face link is not available yet'}
                />
                <button
                  className="btn ghost"
                  type="button"
                  onClick={handleCopyFaceLink}
                  disabled={!faceVerification.url || isFaceVerificationExpired}
                >
                  {copiedFaceLink ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="countdown-row">
                <span
                  className={`meta-label ${isFaceVerificationExpired ? 'accent-danger' : 'accent'}`}
                >
                  {isFaceVerificationExpired
                    ? 'Face link expired — request again.'
                    : faceFormattedRemaining
                      ? `Expires in ${faceFormattedRemaining}`
                      : 'Calculating expiry...'}
                </span>
              </div>

              {faceVerification.url ? (
                <div className="actions reward-actions">
                  <button
                    className="btn secondary compact"
                    type="button"
                    onClick={handleOpenFaceLink}
                    disabled={isFaceVerificationExpired}
                  >
                    Open link
                  </button>
                </div>
              ) : null}
            </section>
          ) : null}

          {rewards.map((reward) => (
            <section className="card reward-card" key={`${reward.awardId}-${reward.specCode}`}>
              <div className="card-top">
                <div className="card-title reward-title">{reward.awardTitle}</div>
                <span className="pill pill-warning">
                  {reward.statusText || reward.status}
                </span>
              </div>

              <div className="reward-body">
                {reward.awardTitle.trim().toLowerCase() !== reward.amountText.trim().toLowerCase() ? (
                  <div className="reward-amount">{reward.amountText}</div>
                ) : null}
                <div className="reward-meta">
                  <span className="meta-label">
                    Expires at {formatSeconds(reward.claimWithinSec)}
                  </span>
                </div>
              </div>

              <div className="actions reward-actions">
                <button
                  className="btn secondary compact"
                  type="button"
                  onClick={() => handleClaimReward(reward)}
                  disabled={
                    isSupportedSite !== true ||
                    isLoadingRewards ||
                    claimingRewardId === reward.awardId
                  }
                >
                  {claimingRewardId === reward.awardId ? 'Claiming...' : 'Claim'}
                </button>
              </div>
            </section>
          ))}
        </>
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
