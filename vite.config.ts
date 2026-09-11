/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { libraryViteConfig, resolveDeploymentBase } from './scripts/lib/public-frontend-config.ts'

export { resolveDeploymentBase }

export default defineConfig(libraryViteConfig())
