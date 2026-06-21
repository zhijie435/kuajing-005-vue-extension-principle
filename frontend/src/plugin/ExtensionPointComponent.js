import { h, defineComponent, inject, computed, Fragment } from 'vue'
import { useExtensionManager } from './ExtensionPointManager'
import { EXTENSION_STATES } from './constants'

const EXTENSION_MANAGER_KEY = '__extension_manager__'

export const ExtensionPoint = defineComponent({
  name: 'ExtensionPoint',
  props: {
    name: {
      type: String,
      required: true,
    },
    context: {
      type: Object,
      default: () => ({}),
    },
    fallback: {
      type: [Object, String, Function],
      default: null,
    },
    multiple: {
      type: Boolean,
      default: true,
    },
    tag: {
      type: String,
      default: 'div',
    },
  },
  setup(props, { slots }) {
    const manager = inject(EXTENSION_MANAGER_KEY, null) || useExtensionManager()

    const resolvedExtensions = computed(() => {
      try {
        return manager.resolve(props.name, props.context)
      } catch {
        return []
      }
    })

    const pointConfig = computed(() => {
      return manager.getPoint(props.name)
    })

    return () => {
      const extensions = resolvedExtensions.value

      if (extensions.length === 0) {
        if (slots.fallback) {
          return slots.fallback({ pointName: props.name })
        }
        if (slots.default) {
          return slots.default({ extensions: [], pointName: props.name })
        }
        if (props.fallback) {
          return typeof props.fallback === 'function'
            ? props.fallback({ pointName: props.name })
            : props.fallback
        }
        return null
      }

      const isMultiple = pointConfig.value?.multiple ?? props.multiple

      if (!isMultiple) {
        const ext = extensions[0]
        if (ext.component) {
          return h(ext.component, { ...ext.props, ...props.context })
        }
        if (ext.render) {
          return ext.render({ ...ext.props, ...props.context })
        }
        return null
      }

      const children = extensions.map(ext => {
        if (ext.component) {
          return h(ext.component, {
            key: ext.id,
            ...ext.props,
            ...props.context,
          })
        }
        if (ext.render) {
          return h(Fragment, { key: ext.id }, [
            ext.render({ ...ext.props, ...props.context }),
          ])
        }
        return null
      }).filter(Boolean)

      if (slots.default) {
        return slots.default({ extensions, pointName: props.name })
      }

      return h(props.tag, { class: `ext-point ext-point--${props.name}` }, children)
    }
  },
})

export const ExtensionSlot = ExtensionPoint

export function provideExtensionManager(app, manager) {
  app.provide(EXTENSION_MANAGER_KEY, manager)
}

export { EXTENSION_MANAGER_KEY }
export default ExtensionPoint
