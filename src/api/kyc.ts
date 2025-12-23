import axios from 'axios';

export interface BybitApiResp<T> {
  ret_code: number;
  ret_msg: string;
  result: T;
  ext_code: string;
  ext_info: null;
  time_now: string;
}

export interface GetVerificationSdkKysInfo {
  provider: string;
  kycToken: string;
  tokenInfo: {
    jumioUrl: string;
    token: string;
    workflowRunId: string;
  };
  sdkUrl: string;
  applicant: {
    level: string;
    applicantId: string;
  };
  inHouseConfig: null;
  opened: true;
}

export type GetVerificationSdkKysInfoPayload = {
  country: string;
  doc_type: string;
  announced: boolean;
  extra_params: {
    hkg_poa_agreement: {
      agree: boolean;
    };
  };
};

export interface GetKysInfo {
  kycToken: string;
  errorNotify: string;
  amlQuestionnaire: { needQuestionnaire: boolean; templateCode: string };
  state: {
    level: string;
    type: string;
    status: string;
    rejectLabels: string[];
  }[];
  applicant?: {
    firstname: string;
    lastname: string;
    country: string;
    nationality: string;
  };
}

export type GetKysInfoPayload = {
  obtain_kyc_token: boolean;
  obtain_aml_questionnaire?: boolean;
  obtain_quotas?: boolean;
  obtain_state?: boolean;
  obtain_verification_process?: boolean;
  obtain_current: boolean;
  token_params?: {
    level: 1;
  };
};

export type KysStatusSummary = {
  completed: boolean;
  error?: string;
  status: string;
  fetchedAt: string;
  level: string;
  type: string;
  rejectLabels?: string[];
  applicant?: GetKysInfo['applicant'];
};

export const defaultGetKysInfoPayload: GetKysInfoPayload = {
  obtain_aml_questionnaire: true,
  obtain_current: true,
  obtain_kyc_token: false,
  obtain_quotas: true,
  obtain_state: true,
  obtain_verification_process: true,
};

export interface RewardInfoList {
  pagination: {
    token: number;
    pageNum: number;
    pageSize: number;
    totalCount: number;
    pageCount: number;
  };
  awardings: {
    id: number;
    effective_at: string;
    ineffective_at: string;
    remain_sec: string;
    awarding_status: string;
    award_detail: {
      id: number;
      award_type: string;
      award_value: string;
      coin: string;
      product: string;
      sub_product: string;
      inProcessLink: string;
      inProcessAppLink: string;
      award_desc: string;
      rate_limit: number;
      rate_time: number;
      symbol: string;
      award_title: string;
      award_sub_title: string;
      award_type_text: string;
      product_text: string;
      sub_product_text: string;
      award_text: string;
      duration_text: string;
      maximum_amount_text: string;
      amount_unit: string;
      business_no: string;
      autoClaim: string;
      filter_devices: any[];
      backend_app_pic_url: string;
      backend_web_pic_url: string;
      award_sub_title_app_url: string;
      award_sub_title_web_url: string;
      collection_name: string;
      vip: number;
      trading_pairs: string;
      use_way_text: string;
      use_way_title: string;
      min_transaction_text: string;
      pairs: any[];
      leverage_e4: string;
      coin_e4: string;
      execType: number;
      scalaText: string;
      award_title_tip: string;
      scalaValue: string;
      ValidSec: string;
      vip_level_text: string;
      vip_level: number;
      reward_packet_id: number;
      task_name: string;
      event_name: string;
      prize_draw_id: string;
      prize_draw_times: string;
      prize_draw_times_left: string;
      prize_draw_type: number;
      campaign_id: string;
      reward_packet_spec_code: string;
      chain: string;
      num_text: string;
    };
    use_processed: {
      current: string;
      total: string;
      value: string;
      remain: string;
      real_total: string;
    };
    created_at: string;
    can_use: boolean;
    using_status: string;
    awarding_status_text: string;
    using_status_text: string;
    status_mix_text: string;
    spec_code: string;
    last_updated_at: string;
    award_individual_id: number;
    task_claimed_notice_text: string;
    use_way_text: string;
    use_way_title: string;
    life_notice: string;
    source: string;
    task_id: string;
    if_return_task_id: boolean;
    award_individual_at: string;
    nft_name: string;
    nft_token_id: string;
    user_collection_web_url: string;
    user_collection_app_url: string;
    vip: number;
    trading_pairs: string;
    award_related_id: string;
    leverage: string;
    position_value: string;
    not_officially_use: boolean;
    task_recurring_id: string;
    awarding_at: string;
    can_transfer: boolean;
    is_transfer: boolean;
    transfer_uid: string;
    transfer_nickname: string;
    transfer_time: string;
    transfer_text: string;
    transfer_forbidden_text: string;
    transfer_corner_text: string;
    is_uta: boolean;
    open_transfer: boolean;
    transfer_spec_code: string;
    need_uta_20: boolean;
    reward_can_transfer: boolean;
  }[];
  system_time: string;
  reward_business_list: {
    reward_business_detail: {
      reward_business: string;
      reward_business_text: string;
      award_type: {
        award_type: string;
        award_type_text: string;
      }[];
    }[];
  };
  award_type_list: string[];
  status_list: string[];
  first_awardings: any[];
}

export enum ByBitAwardStatus {
  AWARDING_STATUS_UNCLAIMED = 'AWARDING_STATUS_UNCLAIMED',
  AWARDING_STATUS_CLAIMED = 'AWARDING_STATUS_CLAIMED',
  AWARDING_STATUS_FACE_REQUIRED = 'AWARDING_STATUS_FACE_REQUIRED',
  AWARDING_STATUS_UNKNOWN = 'AWARDING_STATUS_UNKNOWN',
}

export type RewardEntity = {
  awardId: number;
  specCode: string;
  awardTitle: string;
  type: string;
  status: string;
  statusText?: string;
  claimWithinSec?: number;
  expiresAt?: string;
  amountText: string;
};

type RewardFaceCacheEntry = {
  riskToken: string;
  faceToken?: string;
  ticket?: string;
  bizId?: string;
  faceUrl?: string;
  sumSubFetchedAt: string;
};

type RewardFaceCache = Record<string, RewardFaceCacheEntry>;

export type ClaimRewardResult =
  | {
      status: 'claimed';
      retCode: number;
    }
  | {
      status: 'face_required';
      faceToken: string;
      riskToken: string;
      faceUrl?: string;
      ticket?: string;
      bizId?: string;
    };

export interface Get2fa {
  secret: string;
  qrcode_src: string;
  ret_code?: number;
}

export interface FaceTokenResponse {
  biz_id: string;
  ticket: string;
  provider: string;
  token_info: {
    token: string;
    jumio_url: string;
    url: string;
  };
}

export const getVerificationSdkKysInfo = async (
  payload: GetVerificationSdkKysInfoPayload,
) => {
  return axios
    .post<BybitApiResp<GetVerificationSdkKysInfo>>(
      `/x-api/v3/private/kyc/get-verification-sdk-info`,
      payload,
      {
        withCredentials: true,
      },
    )
    .then(({ data }) => {
      if (data.ret_code === 0) {
        return data;
      }

      throw new Error(`Error get KYC info: ${JSON.stringify(data)}`);
    });
};

export const getKysInfo = async (
  payload: GetKysInfoPayload = defaultGetKysInfoPayload,
): Promise<KysStatusSummary> => {
  const kysFetchedAt = new Date().toISOString();

  const { data } = await axios.post<BybitApiResp<GetKysInfo>>(
    `/x-api/v3/private/kyc/kyc-info`,
    payload,
  );

  const retCode = data.ret_code;
  const retMsg = data.ret_msg;
  const { errorNotify, ...result } = data.result ?? {};

  if (retCode === 0 && result.amlQuestionnaire?.needQuestionnaire) {
    console.log(
      'posted amlQuestionnaire',
      result.amlQuestionnaire?.templateCode,
    );

    if (result.amlQuestionnaire?.templateCode === '1101') {
      await postAmlKycQuestionnaire(
        result.amlQuestionnaire.templateCode,
        '{"government":{"choose":false,"remark":""},"family_government":{"choose":false,"remark":""}}',
      );
    }
    if (result.amlQuestionnaire?.templateCode === '1102') {
      await postAmlKycQuestionnaire(
        result.amlQuestionnaire.templateCode,
        '{"convicted":{"choose":false,"remark":""}}',
      );
    }
    if (result.amlQuestionnaire?.templateCode === '1103') {
      await postAmlKycQuestionnaire(
        result.amlQuestionnaire.templateCode,
        '{"sanctions":{"choose":false,"remark":""}}',
      );
    }
    if (result.amlQuestionnaire?.templateCode === '1104') {
      await postAmlKycQuestionnaire(
        result.amlQuestionnaire.templateCode,
        '{"government":{"choose":false,"remark":""},"family_government":{"choose":false,"remark":""},"convicted":{"choose":false,"remark":""},"sanctions":{"choose":false,"remark":""}}',
      );
    }
  }

  const stateLvl1 =
    result.state?.find(({ level }) => {
      return level === 'LEVEL_1';
    }) ?? null;

  return {
    completed: retCode === 0 && stateLvl1?.status === 'SUCCESS',
    error: retCode === 0 ? errorNotify : (retMsg ?? 'KYC not completed'),
    status: retCode === 0 ? (stateLvl1?.status ?? '') : 'FAILED',
    fetchedAt: kysFetchedAt,
    level: stateLvl1?.level ?? '',
    type: stateLvl1?.type ?? '',
    rejectLabels: stateLvl1?.rejectLabels ?? [],
    applicant: result.applicant,
  };
};

export const postAmlKycQuestionnaire = (templateCode: any, content: string) => {
  return axios
    .post<BybitApiResp<any>>(`/x-api/v3/private/kyc/submit-questionnaire`, {
      biz_from: 'kyc_web',
      template_code: templateCode,
      content: content,
    })
    .then(({ data }) => {
      if (data.ret_code === 0 || data.ret_code === 1032) {
        return data;
      }

      throw new Error(
        `Error post AML Kyc Questionnaire: ${JSON.stringify(data)}`,
      );
    });
};

export const getRewardList = async (): Promise<RewardEntity[]> => {
  const rewardInfoList = await axios
    .post<BybitApiResp<RewardInfoList>>(
      `/x-api/segw/awar/v1/awarding/search-together`,
      {
        pagination: {
          pageNum: 1,
          pageSize: 30,
        },
        filter: {
          awardType: 'AWARD_TYPE_UNKNOWN',
          newOrderWay: true,
          rewardBusinessLine: 'REWARD_BUSINESS_LINE_DEFAULT',
          rewardStatus: 'REWARD_STATUS_DEFAULT',
          getFirstAwardings: false,
          simpleField: true,
          allow_amount_multiple: true,
          return_reward_packet: true,
          return_transfer_award: true,
        },
      },
    )
    .then(({ data }) => {
      if (data.ret_code === 0) {
        return data.result;
      }

      throw new Error(`Error get reward list: ${JSON.stringify(data)}`);
    });

  return rewardInfoList.awardings.map((reward) => {
    const amountText =
      reward.award_detail.award_text ||
      `${reward.award_detail.award_value} ${reward.award_detail.coin}`.trim();

    return {
      awardId: reward.award_detail.id,
      specCode: reward.spec_code,
      awardTitle: reward.award_detail.award_title,
      type: reward.award_detail.award_type,
      status:
        reward.awarding_status || ByBitAwardStatus.AWARDING_STATUS_UNKNOWN,
      statusText: reward.awarding_status_text,
      claimWithinSec: Number.parseInt(reward.remain_sec, 10),
      expiresAt: reward.ineffective_at,
      amountText,
    };
  });
};

export const apiClaimReward = (
  awardID: number,
  spec_code: string,
  args = {},
) => {
  return axios
    .post<BybitApiResp<{ risk_token: string }>>(
      `/x-api/segw/awar/v1/awarding`,
      {
        awardID: awardID,
        spec_code: spec_code,
        is_reward_hub: true,
        ...args,
      },
    )
    .then(({ data }) => {
      if (data.ret_code === 0 || data.ret_code === 409015) {
        return data;
      }

      throw new Error(`Error claim awarding: ${JSON.stringify(data)}`);
    });
};

export const verifyRiskCode = (
  component_list: Record<string, string>,
  risk_token: string,
  args = {},
) => {
  return axios
    .post<BybitApiResp<Get2fa>>(`/x-api/user/public/risk/verify`, {
      risk_token,
      component_list,
      ...args,
    })
    .then(({ data }) => {
      if (data.ret_code === 0) {
        return data;
      }

      throw new Error(`Error verify risk code: ${JSON.stringify(data)}`);
    });
};

export const getSumSubFaceToken = (risk_token: string) => {
  return axios
    .post<BybitApiResp<FaceTokenResponse>>(
      `/x-api/user/public/risk/face/token`,
      {
        risk_token,
      },
    )
    .then(({ data }) => {
      if (data.ret_code === 0) {
        return data;
      }

      throw new Error(`Error get sum sub face token: ${JSON.stringify(data)}`);
    });
};

const REWARD_FACE_CACHE_KEY = 'BYBIT_REWARD_FACE_CACHE';

const getRewardFaceCache = (): RewardFaceCache => {
  if (typeof localStorage === 'undefined') {
    return {};
  }

  const raw = localStorage.getItem(REWARD_FACE_CACHE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as RewardFaceCache;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const persistRewardFaceCache = (cache: RewardFaceCache) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(REWARD_FACE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // ignore persistence errors
  }
};

const removeRewardFaceCache = () => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(REWARD_FACE_CACHE_KEY);
  } catch {
    // ignore persistence errors
  }
};

const buildRewardCacheKey = (awardId: number, specCode: string) =>
  `${awardId}:${specCode}`;

const ensureFaceToken = async (
  cacheKey: string,
  cache: RewardFaceCache,
): Promise<RewardFaceCacheEntry> => {
  const entry = cache[cacheKey];
  if (!entry?.riskToken) {
    throw new Error('Missing risk token');
  }

  if (entry.faceToken) {
    return entry;
  }

  const faceTokenResponse = await getSumSubFaceToken(entry.riskToken);
  const tokenInfo = faceTokenResponse.result?.token_info;
  const faceToken = tokenInfo?.token;

  if (!faceToken) {
    throw new Error(
      `Cannot fetch face token: ${JSON.stringify(faceTokenResponse)}`,
    );
  }

  cache[cacheKey] = {
    ...entry,
    faceToken,
    faceUrl: tokenInfo?.url ?? tokenInfo?.jumio_url,
    ticket: faceTokenResponse.result?.ticket ?? entry.ticket,
    bizId: faceTokenResponse.result?.biz_id ?? entry.bizId,
    sumSubFetchedAt: new Date().toISOString(),
  };

  persistRewardFaceCache(cache);
  return cache[cacheKey];
};

export const claimReward = async (
  awardId: number,
  spec_code: string,
): Promise<ClaimRewardResult> => {
  const cache = getRewardFaceCache();
  const cacheKey = buildRewardCacheKey(awardId, spec_code);
  const cachedEntry = cache[cacheKey];

  if (cachedEntry?.riskToken && cachedEntry.ticket && cachedEntry.bizId) {
    const ensuredEntry = await ensureFaceToken(cacheKey, cache);

    const verifyResponse = await verifyRiskCode(
      {
        kyc_verify: 'kyc_verify',
      },
      ensuredEntry.riskToken,
      {
        biz_id: ensuredEntry.bizId,
        ticket: ensuredEntry.ticket,
      },
    );

    let claimResponse;
    if (verifyResponse.result.ret_code === 0) {
      claimResponse = await apiClaimReward(awardId, spec_code, {
        face_token: ensuredEntry.faceToken,
      });
    }

    removeRewardFaceCache();

    if (!claimResponse || verifyResponse.result.ret_code !== 0) {
      throw new Error(
        `Verify Failed: ${JSON.stringify(verifyResponse.result)}`,
      );
    }

    return {
      status: 'claimed',
      retCode: claimResponse.ret_code,
    };
  }

  const response = await apiClaimReward(awardId, spec_code);

  if (response.ret_code === 409015) {
    const isGenerateNewLink = window.confirm(
      'Do you want to generate a new face verification link?',
    );
    if (!isGenerateNewLink) {
      throw new Error('Face verification is required to claim this reward.');
    }
    const riskToken = response.result.risk_token;
    const faceTokenResponse = await getSumSubFaceToken(riskToken);
    const tokenInfo = faceTokenResponse.result?.token_info;
    const faceToken = tokenInfo?.token;

    if (!faceToken) {
      throw new Error(
        `Cannot fetch face token: ${JSON.stringify(faceTokenResponse)}`,
      );
    }

    cache[cacheKey] = {
      riskToken,
      faceToken,
      ticket: faceTokenResponse.result?.ticket,
      bizId: faceTokenResponse.result?.biz_id,
      faceUrl: tokenInfo?.url ?? tokenInfo?.jumio_url,
      sumSubFetchedAt: new Date().toISOString(),
    };

    persistRewardFaceCache(cache);

    return {
      status: 'face_required',
      faceToken,
      riskToken,
      faceUrl: cache[cacheKey].faceUrl,
      ticket: cache[cacheKey].ticket,
      bizId: cache[cacheKey].bizId,
    };
  }

  delete cache[cacheKey];
  persistRewardFaceCache(cache);

  return {
    status: 'claimed',
    retCode: response.ret_code,
  };
};
