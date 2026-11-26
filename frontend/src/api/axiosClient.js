import axios from 'axios';

export const SERVER_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
const API_BASE_URL = import.meta.env.VITE_API_URL || `${SERVER_BASE_URL}/api`;

const axiosClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

axiosClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('idol_mgmt_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('idol_mgmt_token');
      localStorage.removeItem('idol_mgmt_user');
      if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
      }
    }
    const message = error.response?.data?.message || 'Không thể kết nối tới máy chủ';
    return Promise.reject(new Error(message));
  }
);

export const resolveAssetUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${SERVER_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export default axiosClient;