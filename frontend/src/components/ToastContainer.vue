<template>
  <Teleport to="body">
    <div class="toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="t in toast.state.toasts"
          :key="t.id"
          class="toast-item"
          :class="'toast-' + t.type"
          @click="t.dismissible && toast.remove(t.id)"
        >
          <span class="toast-icon">{{ iconMap[t.type] }}</span>
          <span class="toast-message">{{ t.message }}</span>
          <button v-if="t.dismissible" class="toast-close" @click.stop="toast.remove(t.id)">&times;</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { toast } from './toast'

const iconMap = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 420px;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0,0,0,.12);
  font-size: 14px;
  line-height: 1.5;
  cursor: pointer;
  pointer-events: auto;
  animation: slideIn .25s ease-out;
  border: 1px solid transparent;
}

.toast-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
}

.toast-message {
  flex: 1;
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 0 2px;
  opacity: .5;
  line-height: 1;
  color: inherit;
}

.toast-close:hover { opacity: 1; }

.toast-success {
  background: #f0fdf4;
  color: #166534;
  border-color: #bbf7d0;
}
.toast-success .toast-icon { background: #22c55e; }

.toast-error {
  background: #fef2f2;
  color: #991b1b;
  border-color: #fecaca;
}
.toast-error .toast-icon { background: #ef4444; }

.toast-warning {
  background: #fffbeb;
  color: #92400e;
  border-color: #fde68a;
}
.toast-warning .toast-icon { background: #f59e0b; }

.toast-info {
  background: #eff6ff;
  color: #1e40af;
  border-color: #bfdbfe;
}
.toast-info .toast-icon { background: #3b82f6; }

.toast-enter-active { animation: slideIn .25s ease-out; }
.toast-leave-active { animation: slideOut .2s ease-in; }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes slideOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
</style>
