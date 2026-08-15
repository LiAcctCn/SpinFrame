import { create } from 'zustand'
import type { AssetKind, MediaAsset, VideoProject } from '@shared/project'
import { parseLrc, totalDuration } from '@shared/project'

export type InspectorSection = AssetKind | 'transition' | 'player' | 'export'

interface EditorState {
  project?: VideoProject
  loading: boolean
  error?: string
  playhead: number
  playing: boolean
  focusPicking: boolean
  inspector: InspectorSection
  loadProject: () => Promise<void>
  openProject: () => Promise<void>
  saveProjectAs: () => Promise<void>
  updateProject: (recipe: (project: VideoProject) => VideoProject) => void
  updateProjectImmediate: (project: VideoProject) => void
  importAsset: (kind: AssetKind, path?: string) => Promise<MediaAsset | undefined>
  removeAsset: (kind: AssetKind) => void
  setPlayhead: (time: number) => void
  setPlaying: (playing: boolean) => void
  setFocusPicking: (active: boolean) => void
  setInspector: (section: InspectorSection) => void
  setError: (error?: string) => void
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave(project: VideoProject): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    void window.spinframe.saveProject(project).catch((error) => {
      useEditorStore.setState({ error: error instanceof Error ? error.message : String(error) })
    })
  }, 280)
}

export const useEditorStore = create<EditorState>((set, get) => ({
  loading: true,
  playhead: 0,
  playing: false,
  focusPicking: false,
  inspector: 'transitionVideo',

  loadProject: async () => {
    set({ loading: true, error: undefined })
    try {
      const project = await window.spinframe.getProject()
      set({ project, loading: false, playhead: 0 })
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) })
    }
  },

  openProject: async () => {
    try {
      const result = await window.spinframe.openProject()
      if (result?.project) set({ project: result.project, playhead: 0, playing: false, error: undefined })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  saveProjectAs: async () => {
    try {
      const result = await window.spinframe.saveProjectAs()
      if (result?.project) set({ project: result.project, error: undefined })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  updateProject: (recipe) => {
    const project = get().project
    if (!project) return
    const next = recipe(structuredClone(project))
    next.updatedAt = new Date().toISOString()
    set({ project: next })
    scheduleSave(next)
  },

  updateProjectImmediate: (project) => {
    set({ project })
    scheduleSave(project)
  },

  importAsset: async (kind, path) => {
    try {
      const result = await window.spinframe.importAsset(kind, path)
      if (!result) return undefined
      const project = get().project
      if (!project) return undefined
      const next = structuredClone(project)
      if (kind === 'lyrics') {
        next.lyrics = { asset: result.asset, lines: parseLrc(result.text ?? '') }
      } else {
        next[kind] = result.asset
      }
      next.updatedAt = new Date().toISOString()
      set({ project: next, inspector: kind, error: undefined })
      scheduleSave(next)
      return result.asset
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      return undefined
    }
  },

  removeAsset: (kind) => {
    const project = get().project
    if (!project) return
    const next = structuredClone(project)
    if (kind === 'lyrics') delete next.lyrics
    else delete next[kind]
    if (kind === 'music') delete next.musicAnalysis
    set({ project: next })
    scheduleSave(next)
  },

  setPlayhead: (time) => {
    const project = get().project
    set({ playhead: project ? Math.min(Math.max(0, time), totalDuration(project)) : Math.max(0, time) })
  },
  setPlaying: (playing) => set({ playing }),
  setFocusPicking: (focusPicking) => set({ focusPicking, playing: focusPicking ? false : get().playing }),
  setInspector: (inspector) => set({ inspector }),
  setError: (error) => set({ error })
}))
