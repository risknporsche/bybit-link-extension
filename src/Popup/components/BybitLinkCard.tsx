import type { ChangeEvent } from 'react';

type LanguageOption = {
  code: string;
  label: string;
};

type BybitLinkCardProps = {
  bybitLink: string | null;
  bybitLinkError: string | null;
  bybitStatusText: string;
  language: string;
  languageOptions: readonly LanguageOption[];
  onLanguageChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onGetLink: () => void;
  onOpenLink: () => void;
  onCopyLink: () => void;
  onClearLink: () => void;
  isGetLinkDisabled: boolean;
  isLinkExpired: boolean;
  formattedRemaining: string | null;
  primaryCta: string;
  isSupportedSite: boolean | null;
  isLoading: boolean;
  copied: boolean;
};

export const BybitLinkCard = ({
  bybitLink,
  bybitLinkError,
  bybitStatusText,
  language,
  languageOptions,
  onLanguageChange,
  onGetLink,
  onOpenLink,
  onCopyLink,
  onClearLink,
  isGetLinkDisabled,
  isLinkExpired,
  formattedRemaining,
  primaryCta,
  isSupportedSite,
  isLoading,
  copied,
}: BybitLinkCardProps) => {
  return (
    <>
      <section
        className={`card ${bybitLink ? 'card-success' : ''} ${
          bybitLinkError ? 'card-error' : ''
        }`}
      >
        <div className="card-top">
          <div className="card-title">
            {bybitLink
              ? 'Link generated.'
              : isLoading
                ? 'Requesting token...'
                : 'Ready to fetch token'}
          </div>
          <span className="muted-text">{bybitStatusText}</span>
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
            value={bybitLink ?? 'Request a link to see it here'}
          />
          <button
            className="btn ghost"
            type="button"
            onClick={onCopyLink}
            disabled={!bybitLink || isLinkExpired}
            title={
              bybitLink
                ? isLinkExpired
                  ? 'Link expired'
                  : 'Copy link'
                : 'No link yet'
            }
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {bybitLink ? (
          <div className="countdown-row">
            <span
              className={`meta-label ${isLinkExpired ? 'accent-danger' : 'accent'}`}
            >
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
          {bybitLink ? (
            <span className="meta-label accent">Saved locally for quick reuse</span>
          ) : null}
        </div>
      </section>

      <div className="actions">
        <button
          className="btn primary"
          type="button"
          onClick={onGetLink}
          disabled={isGetLinkDisabled}
        >
          {primaryCta}
        </button>
        <button
          className="btn secondary"
          type="button"
          onClick={onOpenLink}
          disabled={!bybitLink || isLinkExpired}
        >
          Open link
        </button>
      </div>

      <div className="actions secondary-row">
        <button
          className="btn ghost subtle"
          type="button"
          onClick={onClearLink}
          disabled={!bybitLink}
        >
          Clear saved link
        </button>
      </div>
    </>
  );
};
