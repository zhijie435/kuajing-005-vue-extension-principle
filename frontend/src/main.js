import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { createExtensionPlugin } from './plugin'
import App from './App.vue'
import Dashboard from './views/Dashboard.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Dashboard },
  ],
})

const { plugin: extPlugin, manager } = createExtensionPlugin({
  defaultStrategy: 'last_wins',
  logLevel: 1,
})

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(extPlugin)

app.mount('#app')

export { manager }
