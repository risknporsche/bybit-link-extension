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
    rejectLabels: [];
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

export const getVerificationSdkKysInfo = async (payload: GetVerificationSdkKysInfoPayload) => {
  return axios
    .post<
      BybitApiResp<GetVerificationSdkKysInfo>
    >(`/x-api/v3/private/kyc/get-verification-sdk-info`, payload, {
      withCredentials: true,
    })
    .then(({ data }) => {
      if (data.ret_code === 0) {
        return data;
      }

      throw new Error(`Error get KYC info: ${JSON.stringify(data)}`);
    });
};

export const getKysInfo = async (payload: GetKysInfoPayload) => {
  return axios
    .post<BybitApiResp<GetKysInfo>>(`/x-api/v3/private/kyc/kyc-info`, payload)
    .then(({ data }) => {
      if (data.ret_code === 0) {
        return data;
      }

      throw new Error(`Error get KYC info: ${JSON.stringify(data)}`);
    });
}