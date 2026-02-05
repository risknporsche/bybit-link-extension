type InlinePill = { label: string; pillClass: string };

type BybitKycInlineCardProps = {
  formattedKysCheckedAt: string;
  inlineKycPill: InlinePill;
  onCheckStatus: () => void;
  isSupportedSite: boolean | null;
  isCheckingStatus: boolean;
  kysError: string | null;
};

export const BybitKycInlineCard = ({
  formattedKysCheckedAt,
  inlineKycPill,
  onCheckStatus,
  isSupportedSite,
  isCheckingStatus,
  kysError,
}: BybitKycInlineCardProps) => {
  return (
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
          onClick={onCheckStatus}
          disabled={isSupportedSite !== true || isCheckingStatus}
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
  );
};
