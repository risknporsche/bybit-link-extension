import axios from 'axios';
import type { BybitApiResp } from './kyc.ts';

export interface GetProfileInfo {
  id: number;
  // Rest don't need
}

export const getUserProfile = async () => {
  const response = await axios.get<BybitApiResp<GetProfileInfo>>(
    `/x-api/v2/private/user/profile`,
  );

  if (!response.data.result?.id) {
    throw new Error('Failed to fetch user profile');
  }

  return {
    id: response.data.result.id,
  };
};
