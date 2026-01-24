import type { KysStatusSummary } from '../../api/kyc.ts';

type BybitKycCardProps = {
  kysStatus: KysStatusSummary | null;
  kysError: string | null;
  formattedKysCheckedAt: string;
  isCheckingStatus: boolean;
  isSupportedSite: boolean | null;
  applicantName: string;
  onCheckStatus: () => void;
};

export const BybitKycCard = ({
  kysStatus,
  kysError,
  formattedKysCheckedAt,
  isCheckingStatus,
  isSupportedSite,
  applicantName,
  onCheckStatus,
}: BybitKycCardProps) => {
  return (
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
          <span className="status-value">{kysStatus?.applicant?.country ?? '—'}</span>
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
          onClick={onCheckStatus}
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
  );
};
