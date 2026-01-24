import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { bindToken } from '../../api/backend.ts';
import { sha256 } from '../../utils/crypto.ts';
import { storageGet, storageRemove, storageSet } from '../../utils/chromeStorage.ts';

const OTHER_LINK_STORAGE_KEY = 'otherLastLink';
const OTHER_LINK_EXPIRES_AT_STORAGE_KEY = 'otherLastLinkExpiresAt';

type LanguageOption = {
  code: string;
  label: string;
};

type OtherLinkCardProps = {
  language: string;
  onLanguageChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  languageOptions: readonly LanguageOption[];
};

export const OtherLinkCard = ({
  language,
  onLanguageChange,
  languageOptions,
}: OtherLinkCardProps) => {
  const [manualToken, setManualToken] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadStoredLink = async () => {
      try {
        const storedLink = await storageGet<string | null>(OTHER_LINK_STORAGE_KEY);
        if (storedLink && typeof storedLink === 'string') {
          setLink(storedLink);
        }

        const storedExpires = await storageGet<number | string | null>(
          OTHER_LINK_EXPIRES_AT_STORAGE_KEY,
        );
        if (
          typeof storedExpires === 'number' ||
          (typeof storedExpires === 'string' && storedExpires.trim())
        ) {
          const expiresValue =
            typeof storedExpires === 'number'
              ? storedExpires
              : Number(storedExpires);
          setLinkExpiresAt(Number.isNaN(expiresValue) ? null : expiresValue);
        }
      } catch {
        // ignore storage errors
      }
    };

    void loadStoredLink();
  }, []);

  useEffect(() => {
    if (!link) return;

    try {
      const linkUrl = new URL(link);
      const currentLang = linkUrl.searchParams.get('lang');
      if (currentLang === language) {
        return;
      }

      linkUrl.searchParams.set('lang', language);
      const updated = linkUrl.toString();
      setLink(updated);
      void storageSet(OTHER_LINK_STORAGE_KEY, updated);
      if (linkExpiresAt) {
        void storageSet(OTHER_LINK_EXPIRES_AT_STORAGE_KEY, linkExpiresAt);
      }
    } catch {
      // ignore malformed url
    }
  }, [language, link, linkExpiresAt]);

  useEffect(() => {
    if (!link || !linkExpiresAt) {
      setRemainingMs(null);
      return;
    }

    const update = () => {
      const msLeft = linkExpiresAt - Date.now();
      setRemainingMs(msLeft > 0 ? msLeft : 0);
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [link, linkExpiresAt]);

  useEffect(() => {
    setCopied(false);
  }, [link]);

  const isLinkExpired = !!link && !!linkExpiresAt && Date.now() >= linkExpiresAt;
  const isGetLinkDisabled = isGenerating || !manualToken.trim();

  const formattedRemaining = useMemo(() => {
    if (!remainingMs && remainingMs !== 0) return null;
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [remainingMs]);

  const statusText = useMemo(() => {
    if (isGenerating) return 'Generating link...';
    if (linkError) return linkError;
    if (isLinkExpired) return 'Link expired — generate a new one.';
    if (link) return 'Link ready';
    if (!manualToken.trim()) return 'Paste token to generate link.';
    return 'Idle';
  }, [isGenerating, linkError, isLinkExpired, link, manualToken]);

  const primaryCta = isGenerating
    ? 'Generating...'
    : link
      ? 'Refresh link'
      : 'Generate link';

  const handleManualTokenChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setManualToken(event.target.value);
    },
    [],
  );

  const handleClearManualInputs = useCallback(() => {
    setManualToken('');
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!link || isLinkExpired) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy link', error);
      setCopied(false);
    }
  }, [isLinkExpired, link]);

  const handleOpenLink = useCallback(() => {
    if (!link || isLinkExpired) return;
    window.open(link, '_blank', 'noopener,noreferrer');
  }, [isLinkExpired, link]);

  const handleClearLink = useCallback(() => {
    void storageRemove([OTHER_LINK_STORAGE_KEY, OTHER_LINK_EXPIRES_AT_STORAGE_KEY]);
    setLink(null);
    setLinkExpiresAt(null);
  }, []);

  const handleGetLink = useCallback(async () => {
    if (!manualToken.trim()) {
      setLinkError('Paste token to generate link.');
      return;
    }

    setIsGenerating(true);
    setLinkError(null);
    setLink(null);
    setLinkExpiresAt(null);

    try {
      const token = manualToken.trim();
      const hash = await sha256(token);
      const hashResponse = await bindToken({ hash, token });
      const resolvedLink = `${import.meta.env.VITE_FRONTEND_BASE_URL}?hash=${hashResponse}&lang=${language}`;
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      await storageSet(OTHER_LINK_STORAGE_KEY, resolvedLink);
      await storageSet(OTHER_LINK_EXPIRES_AT_STORAGE_KEY, expiresAt);
      setLink(resolvedLink);
      setLinkExpiresAt(expiresAt);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate link';
      setLinkError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [language, manualToken]);

  return (
    <section
      className={`card ${link ? 'card-success' : ''} ${
        linkError ? 'card-error' : ''
      }`}
    >
      <div className="card-top">
        <div className="card-title">
          {link
            ? 'Link generated.'
            : isGenerating
              ? 'Generating link...'
              : 'Paste token to generate link'}
        </div>
        <span className="muted-text">{statusText}</span>
      </div>

      <div className="option-row">
        <div className="option-head">
          <span className="option-label">Token</span>
          <span className="muted-text">Required to generate link</span>
        </div>
        <div className="input-row">
          <input
            className="link-input"
            value={manualToken}
            onChange={handleManualTokenChange}
            placeholder="Paste token here"
          />
          <button
            className="btn ghost subtle"
            type="button"
            onClick={handleClearManualInputs}
            disabled={!manualToken}
          >
            Clear
          </button>
        </div>
      </div>

      <div className="option-row">
        <div className="option-head">
          <span className="option-label">Language for generated link</span>
          <span className="muted-text">Saved for next time</span>
        </div>
        <select
          id="language-other"
          className="text-input"
          value={language}
          onChange={onLanguageChange}
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
          value={link ?? 'Generate a link to see it here'}
        />
        <button
          className="btn ghost"
          type="button"
          onClick={handleCopyLink}
          disabled={!link || isLinkExpired}
          title={
            link
              ? isLinkExpired
                ? 'Link expired'
                : 'Copy link'
              : 'No link yet'
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {link ? (
        <div className="countdown-row">
          <span
            className={`meta-label ${isLinkExpired ? 'accent-danger' : 'accent'}`}
          >
            {isLinkExpired
              ? 'Link expired — generate a new one.'
              : formattedRemaining
                ? `Expires in ${formattedRemaining}`
                : 'Calculating expiry...'}
          </span>
        </div>
      ) : null}

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
    </section>
  );
};
