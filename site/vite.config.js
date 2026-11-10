import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base './' so the built page works from any folder, such as GitHub Pages under /vibe-editing/.
export default defineConfig({ base: './', plugins: [vue()] })
