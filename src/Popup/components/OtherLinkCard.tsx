import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { bindToken } from '../../api/backend.ts';
import { sha256 } from '../../utils/crypto.ts';
import {
  storageGet,
  storageRemove,
  storageSet,
} from '../../utils/chromeStorage.ts';
import { getExpiredTimeByProvider } from '../../utils/time.ts';
import {
  getProviderId,
  ProviderEnum,
  type ProviderType,
} from '../../common/provider.ts';

const OTHER_LINK_STORAGE_KEY = 'otherLastLink';
const OTHER_LINK_EXPIRES_AT_STORAGE_KEY = 'otherLastLinkExpiresAt';
const OTHER_LINK_PROVIDER_STORAGE_KEY = 'otherLastLinkProvider';
const OTHER_LINK_WORKFLOW_ID_STORAGE_KEY = 'otherWorkflowRunId';
const OTHER_LINK_TOKEN_STORAGE_KEY = 'otherManualToken';

const providerOptions: readonly { value: ProviderEnum; label: string }[] = [
  { value: ProviderEnum.SUMSUB, label: 'Sumsub' },
  { value: ProviderEnum.ONFIDO, label: 'Onfido' },
];

const resolveProviderFromParam = (
  param: string | null,
): ProviderType | null => {
  if (param === null) return null;

  const numericParam = Number(param);
  if (Number.isNaN(numericParam)) return null;

  if (numericParam === getProviderId(ProviderEnum.SUMSUB)) {
    return ProviderEnum.SUMSUB;
  }

  if (numericParam === getProviderId(ProviderEnum.ONFIDO)) {
    return ProviderEnum.ONFIDO;
  }

  return null;
};

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
  const [provider, setProvider] = useState<ProviderType>(ProviderEnum.SUMSUB);
  const [manualToken, setManualToken] = useState('');
  const [workflowRunId, setWorkflowRunId] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const hasLinkExpiry =
    typeof linkExpiresAt === 'number' && !Number.isNaN(linkExpiresAt);

  useEffect(() => {
    const loadStoredLink = async () => {
      try {
        const storedLink = await storageGet<string | null>(
          OTHER_LINK_STORAGE_KEY,
        );
        if (storedLink && typeof storedLink === 'string') {
          setLink(storedLink);
        }

        let resolvedProvider: ProviderType | null = null;

        const storedProvider = await storageGet<ProviderType | string | null>(
          OTHER_LINK_PROVIDER_STORAGE_KEY,
        );

        if (typeof storedProvider === 'string' && storedProvider.trim()) {
          resolvedProvider = storedProvider as ProviderType;
        }

        if (!resolvedProvider && storedLink && typeof storedLink === 'string') {
          try {
            const parsed = new URL(storedLink);
            resolvedProvider = resolveProviderFromParam(
              parsed.searchParams.get('provider'),
            );
          } catch {
            // ignore malformed url
          }
        }

        if (resolvedProvider) {
          setProvider(resolvedProvider);
        }

        const storedToken = await storageGet<string | null>(
          OTHER_LINK_TOKEN_STORAGE_KEY,
        );
        if (typeof storedToken === 'string') {
          setManualToken(storedToken);
        }

        const storedWorkflowId = await storageGet<string | null>(
          OTHER_LINK_WORKFLOW_ID_STORAGE_KEY,
        );
        if (typeof storedWorkflowId === 'string') {
          setWorkflowRunId(storedWorkflowId);
        } else if (
          resolvedProvider === ProviderEnum.ONFIDO &&
          storedLink &&
          typeof storedLink === 'string'
        ) {
          try {
            const parsed = new URL(storedLink);
            const existingWorkflowId = parsed.searchParams.get('workflowRunId');
            if (existingWorkflowId) {
              setWorkflowRunId(existingWorkflowId);
            }
          } catch {
            // ignore malformed url
          }
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
      } finally {
        setPrefsLoaded(true);
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
      if (hasLinkExpiry) {
        void storageSet(OTHER_LINK_EXPIRES_AT_STORAGE_KEY, linkExpiresAt);
      }
    } catch {
      // ignore malformed url
    }
  }, [language, link, linkExpiresAt, hasLinkExpiry]);

  useEffect(() => {
    if (!prefsLoaded) return;
    void storageSet(OTHER_LINK_PROVIDER_STORAGE_KEY, provider);
  }, [provider, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    void storageSet(OTHER_LINK_WORKFLOW_ID_STORAGE_KEY, workflowRunId);
  }, [workflowRunId, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    void storageSet(OTHER_LINK_TOKEN_STORAGE_KEY, manualToken);
  }, [manualToken, prefsLoaded]);

  useEffect(() => {
    if (!link || !hasLinkExpiry || linkExpiresAt === null) {
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
  }, [link, linkExpiresAt, hasLinkExpiry]);

  useEffect(() => {
    if (linkExpiresAt === null) return;
    void storageSet(OTHER_LINK_EXPIRES_AT_STORAGE_KEY, linkExpiresAt);
  }, [linkExpiresAt]);

  useEffect(() => {
    setCopied(false);
  }, [link]);

  const isLinkExpired =
    !!link && hasLinkExpiry && linkExpiresAt !== null && Date.now() >= linkExpiresAt;
  const isGetLinkDisabled =
    isGenerating ||
    !manualToken.trim() ||
    (provider === ProviderEnum.ONFIDO && !workflowRunId.trim());

  const formattedRemaining = useMemo(() => {
    if (!hasLinkExpiry) return null;
    if (!remainingMs && remainingMs !== 0) return null;
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [remainingMs, hasLinkExpiry]);

  const statusText = useMemo(() => {
    if (isGenerating) return 'Generating link...';
    if (linkError) return linkError;
    if (isLinkExpired) return 'Link expired — generate a new one.';
    if (link && !hasLinkExpiry) return 'Link ready — expiry time unknown.';
    if (link) return 'Link ready';
    if (!manualToken.trim()) return '';
    return 'Idle';
  }, [isGenerating, linkError, isLinkExpired, link, manualToken, hasLinkExpiry]);

  const primaryCta = isGenerating ? 'Generating...' : 'Generate link';

  const providerLabel =
    providerOptions.find(({ value }) => value === provider)?.label ?? 'Provider';

  const activeLinkProviderLabel = useMemo(() => {
    if (!link) return providerLabel;
    try {
      const linkProvider = resolveProviderFromParam(
        new URL(link).searchParams.get('provider'),
      );
      if (!linkProvider) return '—';
      return (
        providerOptions.find(({ value }) => value === linkProvider)?.label ??
        '—'
      );
    } catch {
      return '—';
    }
  }, [link, providerLabel]);

  const handleManualTokenChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setManualToken(event.target.value);
    },
    [],
  );

  const handleProviderChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      setProvider(event.target.value as ProviderType);
    },
    [],
  );

  const handleWorkflowRunIdChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      setWorkflowRunId(event.target.value);
    },
    [],
  );

  const handleClearManualInputs = useCallback(() => {
    setManualToken('');
    setWorkflowRunId('');
    void storageRemove([
      OTHER_LINK_TOKEN_STORAGE_KEY,
      OTHER_LINK_WORKFLOW_ID_STORAGE_KEY,
    ]);
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!link) return;
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
    if (!link) return;
    window.open(link, '_blank', 'noopener,noreferrer');
  }, [link]);

  const handleClearLink = useCallback(() => {
    void storageRemove([
      OTHER_LINK_STORAGE_KEY,
      OTHER_LINK_EXPIRES_AT_STORAGE_KEY,
    ]);
    setLink(null);
    setLinkExpiresAt(null);
  }, []);

  const handleGetLink = useCallback(async () => {
    if (!manualToken.trim()) {
      setLinkError('Paste token to generate link.');
      return;
    }

    if (provider === ProviderEnum.ONFIDO && !workflowRunId.trim()) {
      setLinkError('workflowRunId is required for Onfido.');
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
      const providerId = getProviderId(provider);
      const resolvedLink =
        `${import.meta.env.VITE_FRONTEND_BASE_URL}?hash=${hashResponse}&lang=${language}` +
        (providerId !== null ? `&provider=${providerId}` : '') +
        (provider === ProviderEnum.ONFIDO && workflowRunId.trim()
          ? `&workflowRunId=${encodeURIComponent(workflowRunId.trim())}`
          : '');
      const expiresInMs = getExpiredTimeByProvider(provider);
      const expiresAt =
        typeof expiresInMs === 'number' && !Number.isNaN(expiresInMs)
          ? Date.now() + expiresInMs
          : null;

      await storageSet(OTHER_LINK_STORAGE_KEY, resolvedLink);
      if (expiresAt) {
        await storageSet(OTHER_LINK_EXPIRES_AT_STORAGE_KEY, expiresAt);
      } else {
        await storageRemove(OTHER_LINK_EXPIRES_AT_STORAGE_KEY);
      }
      setLink(resolvedLink);
      setLinkExpiresAt(expiresAt);
      setManualToken('');
      setWorkflowRunId('');
      await storageRemove([
        OTHER_LINK_TOKEN_STORAGE_KEY,
        OTHER_LINK_WORKFLOW_ID_STORAGE_KEY,
      ]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate link';
      setLinkError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [language, manualToken, provider, workflowRunId]);

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
          <span className="option-label">Provider</span>
          <span className="muted-text">Used for new links only; does not change existing link</span>
        </div>
        <select
          id="provider-other"
          className="text-input"
          value={provider}
          onChange={handleProviderChange}
        >
          {providerOptions.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {provider === ProviderEnum.ONFIDO ? (
        <div className="option-row">
          <div className="option-head">
            <span className="option-label">WorkflowRunId</span>
            <span className="muted-text">Required for Onfido</span>
          </div>
          <div className="input-row">
            <input
              className="link-input"
              value={workflowRunId}
              onChange={handleWorkflowRunIdChange}
              placeholder="Paste workflowRunId (required)"
            />
            <button
              className="btn ghost subtle"
              type="button"
              onClick={() => setWorkflowRunId('')}
              disabled={!workflowRunId}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

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
          disabled={!link}
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
              : !hasLinkExpiry
                ? 'Expiry time not provided.'
                : formattedRemaining
                  ? `Expires in ${formattedRemaining}`
                  : 'Calculating expiry...'}
          </span>
        </div>
      ) : null}

      <div className="meta-row">
        <span className="meta-label">Language: {language}</span>
        <span className="meta-label">Provider: {activeLinkProviderLabel}</span>
        {link ? (
          <span className="meta-label accent">Saved locally for quick reuse</span>
        ) : null}
      </div>

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
          disabled={!link}
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
