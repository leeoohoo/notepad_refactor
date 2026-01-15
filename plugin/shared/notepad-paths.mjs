import fs from 'fs';
import os from 'os';
import path from 'path';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveHostApp(env) {
  const hostApp = normalizeString(env?.MODEL_CLI_HOST_APP);
  return hostApp || 'chatos';
}

function resolveHomeDir(env) {
  const homeEnv = normalizeString(env?.HOME) || normalizeString(env?.USERPROFILE);
  if (homeEnv) return homeEnv;
  try {
    return os.homedir();
  } catch {
    return '';
  }
}

function resolveSessionRoot(env) {
  return normalizeString(env?.MODEL_CLI_SESSION_ROOT);
}

function tryEnsureWritableDir(dirPath) {
  const target = normalizeString(dirPath);
  if (!target) return false;
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch {
    return false;
  }
  try {
    fs.accessSync(target, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveUiAppDataDir({ pluginId, env } = {}) {
  const id = normalizeString(pluginId);
  if (!id) throw new Error('pluginId is required');
  const resolvedEnv = env && typeof env === 'object' ? env : process.env;
  const hostApp = resolveHostApp(resolvedEnv);
  const home = resolveHomeDir(resolvedEnv);
  const sessionRoot = resolveSessionRoot(resolvedEnv);

  const candidates = [];
  if (home) candidates.push(path.join(home, '.deepseek_cli', hostApp, 'ui_apps', 'data', id));
  if (sessionRoot) candidates.push(path.join(path.resolve(sessionRoot), '.deepseek_cli', hostApp, 'ui_apps', 'data', id));
  candidates.push(path.join(path.resolve(process.cwd()), '.deepseek_cli', hostApp, 'ui_apps', 'data', id));

  for (const candidate of candidates) {
    if (tryEnsureWritableDir(candidate)) return candidate;
  }
  return candidates[0];
}

