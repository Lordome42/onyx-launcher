// Глобальное состояние интерфейса и простая подписка на изменения.
export const state = {
  instances: [],
  accounts: { selected: null, list: [] },
  settings: {},
  versions: null,
  progress: {}, // id сборки → { stage, done, total }
  logs: {}, // id сборки → строки журнала
  running: new Set(),
};

const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function notify(what) {
  for (const fn of listeners) fn(what);
}

export function currentAccount() {
  return state.accounts.list.find((a) => a.id === state.accounts.selected) || null;
}

export async function loadInstances() {
  state.instances = await window.api.instances.list();
  state.running = new Set(state.instances.filter((i) => i.running).map((i) => i.id));
  notify('instances');
}

export async function loadAccounts() {
  state.accounts = await window.api.accounts.list();
  notify('accounts');
}

export async function loadVersions() {
  if (!state.versions) state.versions = await window.api.versions.list();
  return state.versions;
}

export function pushLog(id, line) {
  const list = (state.logs[id] ||= []);
  list.push(line);
  if (list.length > 2000) list.splice(0, list.length - 2000);
}
