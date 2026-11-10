import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { VibeApi, WsChange, ExportProgress, MatteProgressEvent, ChatUpdate, MenuCommand } from '../shared/api';

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
  createComponent: (id, opts) => ipcRenderer.invoke('ws:createComponent', id, opts),
  startProject: (name, paths) => ipcRenderer.invoke('ws:startProject', name, paths),
  pickMedia: () => ipcRenderer.invoke('media:pick'),
  importMedia: (project, paths) => ipcRenderer.invoke('media:import', project, paths),
  listMedia: (project) => ipcRenderer.invoke('media:list', project),
  pathForFile: (file) => webUtils.getPathForFile(file),
  writeSession: (project, session) => ipcRenderer.invoke('session:write', project, session),
  exportProject: (project) => ipcRenderer.invoke('export:start', project),
  onExportProgress: (cb) => on<ExportProgress>('export:progress', cb),
  onChange: (cb) => on<WsChange>('ws:change', cb),
  ensureMattes: (project) => ipcRenderer.invoke('matte:ensure', project),
  onMatteProgress: (cb) => on<MatteProgressEvent>('matte:progress', cb),
  initialProject: () => ipcRenderer.invoke('app:initialProject'),
  onOpenProject: (cb) => on<string>('app:openProject', cb),
  chatState: (project) => ipcRenderer.invoke('chat:state', project),
  chatSend: (project, text, ctx) => ipcRenderer.invoke('chat:send', project, text, ctx),
  chatStop: (project) => ipcRenderer.invoke('chat:stop', project),
  chatReset: (project) => ipcRenderer.invoke('chat:reset', project),
  onChat: (cb) => on<ChatUpdate>('chat:update', cb),
  chatPanelOpen: () => ipcRenderer.invoke('ui:chatOpen'),
  setChatPanelOpen: (open) => ipcRenderer.invoke('ui:setChatOpen', open),
  onMenu: (cb) => on<MenuCommand>('menu:command', cb),
  menuState: (state) => ipcRenderer.invoke('menu:state', state),
  frameReady: (rgba) => ipcRenderer.invoke('headless:frame', rgba),
  headlessJob: () => ipcRenderer.invoke('headless:job'),
  headlessDone: (r) => ipcRenderer.invoke('headless:done', r),
  headlessMedia: (i) => ipcRenderer.invoke('headless:media', i),
};

contextBridge.exposeInMainWorld('vibe', api);
