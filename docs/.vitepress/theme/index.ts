import DefaultTheme from 'vitepress/theme'
import FlowDiagram from './FlowDiagram.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Global component available in any .md page (e.g. the Architecture guide).
    app.component('FlowDiagram', FlowDiagram)
  },
}
