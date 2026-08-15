/// <reference types="vite/client" />

import type { SpinFrameApi } from '../../shared/api'

declare global {
  interface Window {
    spinframe: SpinFrameApi
    spinframeExport: {
      ready: Promise<void>
      prepareFrame: (time: number) => Promise<void>
    }
  }
}

export {}
