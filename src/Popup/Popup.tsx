import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import type {
  BybitApiResp,
  GetVerificationSdkKysInfo,
  GetVerificationSdkKysInfoPayload,
} from '../api/kyc.ts';
import { bindToken } from '../api/backend.ts';
import { sha256 } from '../utils/crypto.ts';

type ContentScriptResponse =
  | {
      ok: true;
      data: BybitApiResp<GetVerificationSdkKysInfo>
      userId: string
    }
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

const sendMessageToActiveTab = async (
  message: unknown,
): Promise<ContentScriptResponse> => {
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

      resolve(response as ContentScriptResponse);
    });
  });
};

export const Popup = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    const checkActiveTab = async () => {
      try {
        const tab = await getActiveTab();
        const url = tab?.url;

        if (!url) {
          setIsSupportedSite(false);
          setError('Open this popup on bybit.com or bybitglobal.com.');
          return;
        }

        const hostname = new URL(url).hostname;
        const allowed = isBybitHost(hostname);
        setIsSupportedSite(allowed);

        if (!allowed) {
          setError('Open this popup on bybit.com or bybitglobal.com.');
        }
      } catch (err) {
        setIsSupportedSite(false);
        const message =
          err instanceof Error ? err.message : 'Failed to read active tab';
        setError(message);
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
      setError('Open this popup on bybit.com or bybitglobal.com.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setLink(null);
    setLinkExpiresAt(null);

    try {
      const response = await sendMessageToActiveTab({
        type: 'GET_KYC_TOKEN',
        payload: defaultPayload,
      });

      if (!response?.ok) {
        throw new Error(response?.error ?? 'No response from content script');
      }

      const result = { ...response.data.result, userId: response.userId };

      const hash = await sha256(result.userId);

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
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [isSupportedSite, language]);

  const isGetLinkDisabled = isLoading || isSupportedSite !== true;
  const isLinkExpired =
    !!link && !!linkExpiresAt && Date.now() >= linkExpiresAt;

  const statusText = useMemo(() => {
    if (isSupportedSite === null) {
      return 'Checking active tab...';
    }
    if (isSupportedSite === false) {
      return 'Open this popup on bybit.com or bybitglobal.com.';
    }
    if (isLoading) {
      return 'Requesting link...';
    }
    if (isLinkExpired) {
      return 'Link expired — request a new one.';
    }
    if (error) {
      return error;
    }
    if (link) {
      return 'Link ready';
    }
    return 'Idle';
  }, [isLoading, error, link, isSupportedSite, isLinkExpired]);

  useEffect(() => {
    setCopied(false);
  }, [link]);

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
  }, [link]);

  const handleOpenLink = useCallback(() => {
    if (!link || isLinkExpired) return;
    window.open(link, '_blank', 'noopener,noreferrer');
  }, [link, isLinkExpired]);

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

      <section
        className={`card ${link ? 'card-success' : ''} ${
          error ? 'card-error' : ''
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
          Get link
        </button>
      </div>

      <div className="actions secondary-row">
        <button
          className="btn ghost subtle"
          type="button"
          onClick={handleClearLink}
          disabled={!link}
        >
          Clear saved link
        </button>
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
