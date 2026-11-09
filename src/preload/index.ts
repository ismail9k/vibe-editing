import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { VibeApi, WsChange, ExportProgress } from '../shared/api';

const on = <T>(channel: string, cb: (v: T) => void) => {
  const h = (_: unknown, v: T) => cb(v);
  ipcRenderer.on(channel, h);
  return () => { ipcRenderer.removeListener(channel, h); };
};

const api: VibeApi = {
  info: () => ipcRenderer.invoke('ws:info'),
  read: (rel) => ipcRenderer.invoke('ws:read', rel),
  write: (rel, text, base) => ipcRenderer.invoke('ws:write', rel, text, base),
  exists: (rels) => ipcRenderer.invoke('ws:exists', rels),
  duplicate: (a, b) => ipcRenderer.invoke('ws:duplicate', a, b),
  createProject: (name) => ipcRenderer.invoke('ws:createProject', name),
  importMedia: (project, paths) => ipcRenderer.invoke('media:import', project, paths),
  pathForFile: (file) => webUtils.getPathForFile(file),
  writeSession: (project, session) => ipcRenderer.invoke('session:write', project, session),
  exportProject: (project) => ipcRenderer.invoke('export:start', project),
  onExportProgress: (cb) => on<ExportProgress>('export:progress', cb),
  onChange: (cb) => on<WsChange>('ws:change', cb),
  initialProject: () => ipcRenderer.invoke('app:initialProject'),
  frameReady: (rgba) => ipcRenderer.invoke('headless:frame', rgba),
  headlessJob: () => ipcRenderer.invoke('headless:job'),
  headlessDone: (r) => ipcRenderer.invoke('headless:done', r),
  headlessMedia: (i) => ipcRenderer.invoke('headless:media', i),
};

contextBridge.exposeInMainWorld('vibe', api);
