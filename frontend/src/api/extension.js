const API_BASE = '/api'

async function request(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`)
  }
  return data
}

export const api = {
  getStats: () => request(''),

  getPoints: () => request('/points'),
  getPoint: (name) => request(`/points/${name}`),
  definePoint: (data) => request('/points', { method: 'POST', body: JSON.stringify(data) }),
  deletePoint: (name) => request(`/points/${name}`, { method: 'DELETE' }),

  getPackages: () => request('/packages'),
  getPackage: (id) => request(`/packages/${id}`),
  registerPackage: (data) => request('/packages', { method: 'POST', body: JSON.stringify(data) }),
  deletePackage: (id) => request(`/packages/${id}`, { method: 'DELETE' }),
  validatePackage: (data) => request('/packages/validate', { method: 'POST', body: JSON.stringify(data) }),
  rollbackPackage: (id) => request(`/packages/${id}/rollback`, { method: 'POST' }),

  getExtensions: (point) => request(point ? `/extensions?point=${point}` : '/extensions'),
  registerExtension: (packageId, data) => request(`/packages/${packageId}`, { method: 'POST', body: JSON.stringify(data) }),
  unregisterExtension: (extId) => request(`/extensions/${extId}`, { method: 'DELETE' }),

  checkOverrideImpact: (packageId) => request(`/packages/${packageId}/check-override`),
  getConflicts: (params) => request(`/conflicts${params ? '?' + params : ''}`),
  resolveConflict: (id, resolution) => request(`/conflicts/${id}`, { method: 'POST', body: JSON.stringify({ resolution }) }),

  getRollbacks: (packageId) => request(packageId ? `/rollbacks?package_id=${packageId}` : '/rollbacks'),
}
