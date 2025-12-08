import axios from 'axios';

export interface BindTokenPayload {
  hash: string;
  token: string;
}

export interface BindTokenResponse {
  hash: string;
}

export const bindToken = async (payload: BindTokenPayload) => {
  return axios
    .post<BindTokenResponse>(
      `${import.meta.env.VITE_API_BASE_URL}/bind`,
      payload,
    )
    .then(({ data }) => {
      const { hash } = data;
      return hash
    });
};
