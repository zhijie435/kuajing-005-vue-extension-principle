import { reactive } from 'vue'

const state = reactive({
  toasts: [],
})

let nextId = 0

const TOAST_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info',
}

function addToast(type, message, options = {}) {
  const id = ++nextId
  const toast = {
    id,
    type,
    message,
    duration: options.duration ?? (type === 'error' ? 6000 : 4000),
    dismissible: options.dismissible !== false,
    createdAt: Date.now(),
  }
  state.toasts.push(toast)
  if (toast.duration > 0) {
    setTimeout(() => removeToast(id), toast.duration)
  }
  return id
}

function removeToast(id) {
  const idx = state.toasts.findIndex(t => t.id === id)
  if (idx !== -1) state.toasts.splice(idx, 1)
}

function clearAll() {
  state.toasts.splice(0, state.toasts.length)
}

export const toast = {
  success: (msg, opts) => addToast(TOAST_TYPES.SUCCESS, msg, opts),
  error: (msg, opts) => addToast(TOAST_TYPES.ERROR, msg, opts),
  warning: (msg, opts) => addToast(TOAST_TYPES.WARNING, msg, opts),
  info: (msg, opts) => addToast(TOAST_TYPES.INFO, msg, opts),
  remove: removeToast,
  clear: clearAll,
  state,
}

export { TOAST_TYPES }
