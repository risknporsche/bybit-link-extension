import type { ChangeEvent } from 'react';
import type { RewardEntity } from '../../api/kyc.ts';

type LanguageOption = { code: string; label: string };
type FaceVerificationState = {
  awardId: number;
  faceToken?: string;
  url?: string;
  ticket?: string;
  bizId?: string;
  fetchedAt?: string;
  provider?: string;
};

type BybitRewardsSectionProps = {
  rewards: RewardEntity[];
  unclaimedRewards: RewardEntity[];
  rewardsError: string | null;
  hasFetchedRewards: boolean;
  formattedRewardsFetchedAt: string;
  isLoadingRewards: boolean;
  isSupportedSite: boolean | null;
  onFetchRewards: () => void;
  claimError: string | null;
  faceVerification: FaceVerificationState | null;
  isFaceVerificationExpired: boolean;
  faceFormattedRemaining: string | null;
  language: string;
  languageOptions: readonly LanguageOption[];
  onLanguageChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  onCopyFaceLink: () => void;
  copiedFaceLink: boolean;
  onOpenFaceLink: () => void;
  onClaimReward: (reward: RewardEntity) => void;
  isLoadingRewardsOrClaiming: (awardId: number) => boolean;
  formatSeconds: (value?: number) => string;
};

export const BybitRewardsSection = ({
  rewards,
  unclaimedRewards,
  rewardsError,
  hasFetchedRewards,
  formattedRewardsFetchedAt,
  isLoadingRewards,
  isSupportedSite,
  onFetchRewards,
  claimError,
  faceVerification,
  isFaceVerificationExpired,
  faceFormattedRemaining,
  language,
  languageOptions,
  onLanguageChange,
  onCopyFaceLink,
  copiedFaceLink,
  onOpenFaceLink,
  onClaimReward,
  isLoadingRewardsOrClaiming,
  formatSeconds,
}: BybitRewardsSectionProps) => {
  return (
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
                ? ``
                : hasFetchedRewards
                  ? 'Awardings list is empty'
                  : 'No rewards fetched yet'}
          </span>
          <span className="muted-text">{formattedRewardsFetchedAt}</span>
        </div>

        <div className="reward-summary">
          <span
            className={`pill ${unclaimedRewards ? 'pill-ok' : 'pill-warning'}`}
          >
            Found {unclaimedRewards.length} unclaimed reward(s)
          </span>
          <button
            className="btn secondary"
            type="button"
            onClick={onFetchRewards}
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
            <div className="card-title reward-title">
              Face verification required
            </div>
          </div>

          <p className="muted-text">
            Complete face verification to finish claiming award.
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
              value={faceVerification.url ?? 'Face link is not available yet'}
            />
            <button
              className="btn ghost"
              type="button"
              onClick={onCopyFaceLink}
              disabled={!faceVerification.url}
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
                  : 'Expiry time not provided.'}
            </span>
          </div>

          {faceVerification.url ? (
            <div className="actions reward-actions">
              <button
                className="btn secondary compact"
                type="button"
                onClick={onOpenFaceLink}
                disabled={isFaceVerificationExpired}
              >
                Open link
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {unclaimedRewards.map((reward) => (
        <section
          className="card reward-card"
          key={`${reward.awardId}-${reward.specCode}`}
        >
          <div className="card-top">
            <div className="card-title reward-title">
              {reward.awardTitle || reward.amountText}
            </div>
            <span className="pill pill-warning">
              {reward.statusText || reward.status}
            </span>
          </div>

          <div className="reward-body">
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
              onClick={() => onClaimReward(reward)}
              disabled={isLoadingRewardsOrClaiming(reward.awardId)}
            >
              {isLoadingRewardsOrClaiming(reward.awardId)
                ? 'Claiming...'
                : faceVerification?.awardId === reward.awardId
                  ? 'Verified? Claim'
                  : 'Claim'}
            </button>
          </div>
        </section>
      ))}
    </>
  );
};
