import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
});

api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.error || error.message || '请求失败';
    return Promise.reject(new Error(message));
  }
);

export default api;

export const usersApi = {
  list: (params) => api.get('/users', { params }),
  get: (id) => api.get(`/users/${id}`)
};

export const vehiclesApi = {
  list: (params) => api.get('/vehicles', { params }),
  get: (id) => api.get(`/vehicles/${id}`),
  updateStatus: (id, status) => api.post(`/vehicles/${id}/status`, { status }),
  addMaintenance: (id, data) => api.post(`/vehicles/${id}/maintenance`, data),
  checkAvailability: (id, params) => api.get(`/vehicles/${id}/availability`, { params })
};

export const frequenciesApi = {
  list: (params) => api.get('/frequencies', { params }),
  checkAvailability: (id, params) => api.get(`/frequencies/${id}/availability`, { params }),
  getOccupancy: (params) => api.get('/frequencies/occupancy', { params })
};

export const plansApi = {
  list: (params) => api.get('/plans', { params }),
  get: (id) => api.get(`/plans/${id}`),
  create: (data) => api.post('/plans', data),
  createTemporary: (data) => api.post('/plans/temporary', data),
  update: (id, data) => api.put(`/plans/${id}`, data),
  cancel: (id) => api.post(`/plans/${id}/cancel`),
  start: (id, data) => api.post(`/plans/${id}/start`, data),
  end: (id) => api.post(`/plans/${id}/end`),
  addReview: (id, data) => api.post(`/plans/${id}/review`, data),
  getConflicts: (id) => api.get(`/plans/${id}/conflicts`)
};

export const dispatchesApi = {
  list: () => api.get('/dispatches'),
  get: (planId) => api.get(`/dispatches/${planId}`),
  create: (data) => api.post('/dispatches', data),
  cancel: (planId) => api.delete(`/dispatches/${planId}`)
};

export const signalsApi = {
  list: (params) => api.get('/signals', { params }),
  get: (id) => api.get(`/signals/${id}`),
  create: (data) => api.post('/signals', data),
  remove: (id) => api.delete(`/signals/${id}`)
};

export const frequencySwitchApi = {
  list: (params) => api.get('/frequency-switches', { params }),
  get: (id) => api.get(`/frequency-switches/${id}`),
  create: (data) => api.post('/frequency-switches', data)
};

export const dashboardApi = {
  getSummary: () => api.get('/dashboard/summary'),
  getTimeline: (params) => api.get('/dashboard/timeline', { params })
};
