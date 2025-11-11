#!/usr/bin/env node
import { execSync } from 'node:child_process';
import process from 'node:process';

function log(level, step, payload = {}) {
  const timestamp = new Date().toISOString();
  const envSummary = {
    node: process.version,
    platform: process.platform,
    cwd: process.cwd(),
    pid: process.pid,
  };
  const message = `[diagnostic] ${timestamp} create-pr:${step} ${JSON.stringify({ ...payload, envSummary })}`;
  if (level === 'error') {
    console.error(message);
  } else {
    console.log(message);
  }
}

function normalizeError(error) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'UnknownError', message: String(error) };
}

function requireEnv(name) {
  const raw = process.env[name];
  if (raw === undefined) {
    const error = new Error(`Missing required environment variable: ${name}`);
    log('error', 'env-missing', { name, error: normalizeError(error) });
    throw error;
  }
  const value = raw.trim();
  if (value.length === 0) {
    const error = new Error(`Environment variable ${name} is empty`);
    log('error', 'env-empty', { name, error: normalizeError(error) });
    throw error;
  }
  const lowered = value.toLowerCase();
  if (['default', 'changeme', 'placeholder'].includes(lowered)) {
    const error = new Error(`Environment variable ${name} is using a placeholder value: ${value}`);
    log('error', 'env-placeholder', { name, error: normalizeError(error) });
    throw error;
  }
  log('log', 'env-present', { name });
  return value;
}

function runCommand(step, command) {
  log('log', `${step}:invoke`, { command });
  try {
    const output = execSync(command, { stdio: 'pipe', encoding: 'utf8' });
    log('log', `${step}:success`, { command, output: output.trim() });
    return output;
  } catch (error) {
    const normalized = normalizeError(error);
    log('error', `${step}:failure`, { command, error: normalized });
    throw error;
  }
}

async function request(step, method, url, token, body) {
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'dadsbot-create-pr-script',
  };
  let payloadString;
  if (body !== undefined) {
    payloadString = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  log('log', `${step}:request`, { method, url, hasBody: body !== undefined });
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: payloadString,
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch (parseError) {
      parsed = { raw: text };
    }
    const summary = typeof parsed === 'object' && parsed !== null ? parsed : { raw: parsed };
    log('log', `${step}:response`, { status: response.status, ok: response.ok, bodyPreview: JSON.stringify(summary).slice(0, 400) });
    if (!response.ok) {
      const error = new Error(`GitHub API request failed: ${method} ${url} -> ${response.status}`);
      log('error', `${step}:http-error`, { status: response.status, bodyPreview: JSON.stringify(summary).slice(0, 400), error: normalizeError(error) });
      throw error;
    }
    return parsed;
  } catch (error) {
    const normalized = normalizeError(error);
    log('error', `${step}:failure`, { error: normalized });
    throw error;
  }
}

async function main() {
  log('log', 'start', { argv: process.argv.slice(2) });
  const githubToken = requireEnv('GITHUB_TOKEN');
  const apiUrl = requireEnv('GITHUB_API_URL');
  const owner = requireEnv('GIT_REPO_OWNER');
  const repo = requireEnv('GIT_REPO_NAME');
  const base = requireEnv('PR_BASE');
  const head = requireEnv('PR_HEAD');
  const title = requireEnv('PR_TITLE');
  const body = requireEnv('PR_BODY');
  const remote = requireEnv('GIT_REMOTE_NAME');
  const draftFlag = process.env.PR_DRAFT ? process.env.PR_DRAFT.trim().toLowerCase() : undefined;
  const isDraft = draftFlag === 'true';
  log('log', 'env-validation-complete', { requiredEnvCount: 8, draftSpecified: draftFlag !== undefined });

  const repoRoot = runCommand('git-root', 'git rev-parse --show-toplevel').trim();
  log('log', 'git-root-confirmed', { repoRoot });

  const statusOutput = runCommand('git-status-check', 'git status --porcelain');
  if (statusOutput.trim().length !== 0) {
    const error = new Error('Working tree has uncommitted changes. Please commit or stash before creating a PR.');
    log('error', 'git-status-dirty', { statusOutput, error: normalizeError(error) });
    throw error;
  }

  const currentBranch = runCommand('git-current-branch', 'git rev-parse --abbrev-ref HEAD').trim();
  log('log', 'git-current-branch', { currentBranch });

  const remoteUrl = runCommand('git-remote-url', `git remote get-url ${remote}`).trim();
  log('log', 'git-remote-url-confirmed', { remote, remoteUrl });

  runCommand('git-fetch-base', `git fetch ${remote} ${base}`);

  try {
    runCommand('git-ensure-ancestor', `git merge-base --is-ancestor ${remote}/${base} HEAD`);
    log('log', 'git-ancestor-confirmed', { baseRef: `${remote}/${base}`, headRef: 'HEAD' });
  } catch (error) {
    const normalized = normalizeError(error);
    log('error', 'git-ancestor-check-failed', { message: 'HEAD is not rebased onto the remote base branch', error: normalized });
    throw error;
  }

  const baseCommit = runCommand('git-base-commit', `git rev-parse ${remote}/${base}`).trim();
  log('log', 'git-base-commit', { baseCommit });

  const headCommit = runCommand('git-head-commit', 'git rev-parse HEAD').trim();
  log('log', 'git-head-commit', { headCommit });

  const remoteHeadCheck = runCommand('git-remote-head-check', `git ls-remote --heads ${remote} ${head}`).trim();
  log('log', 'git-remote-head-check', { remoteHeadCheck });

  runCommand('git-push-head', `git push ${remote} HEAD:${head}`);

  const headQualified = `${owner}:${head}`;
  const listUrl = `${apiUrl}/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(headQualified)}&state=open`;
  const existing = await request('github-list-pr', 'GET', listUrl, githubToken);
  if (Array.isArray(existing) && existing.length > 0) {
    const pullRequest = existing[0];
    log('log', 'github-existing-pr-found', { number: pullRequest.number, url: pullRequest.html_url });
    const updateUrl = `${apiUrl}/repos/${owner}/${repo}/pulls/${pullRequest.number}`;
    await request('github-update-pr', 'PATCH', updateUrl, githubToken, {
      title,
      body,
      base,
      head,
      draft: isDraft,
    });
    log('log', 'github-update-pr-success', { number: pullRequest.number, url: pullRequest.html_url });
  } else {
    log('log', 'github-no-existing-pr', { headQualified });
    const createUrl = `${apiUrl}/repos/${owner}/${repo}/pulls`;
    const created = await request('github-create-pr', 'POST', createUrl, githubToken, {
      title,
      head,
      base,
      body,
      draft: isDraft,
    });
    if (created && typeof created === 'object' && created.number) {
      log('log', 'github-create-pr-success', { number: created.number, url: created.html_url });
    } else {
      log('log', 'github-create-pr-success', { responseType: typeof created });
    }
  }

  log('log', 'complete', { currentBranch, headRef: head, baseRef: base, draft: isDraft });
}

main().catch((error) => {
  const normalized = normalizeError(error);
  log('error', 'unhandled-failure', { error: normalized });
  process.exit(1);
});
