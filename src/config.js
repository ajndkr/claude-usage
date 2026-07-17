// Configuration constants, read from the environment at load time.
//
// Endpoint URLs are overridable via env so tests can point them at a local mock
// server (see CLAUDE.md → Testing). Read them here, once, exactly as the
// original single-file CLI did.

import os from 'node:os';
import path from 'node:path';

export const CONFIG_DIR = path.join(os.homedir(), '.config', 'claude-usage');
export const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json'); // OAuth tokens
export const API_BASE = process.env.CLAUDE_USAGE_API_BASE || 'https://api.anthropic.com';
export const REFRESH_SECS = 60; // auto-refresh interval for the live widget

// OAuth config - matches Claude Code's public client so a claude.ai subscription
// (Pro/Max) login works without any API key.
export const OAUTH_CLIENT_ID = process.env.CLAUDE_USAGE_CLIENT_ID || '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
export const OAUTH_AUTHORIZE_URL = process.env.CLAUDE_USAGE_AUTHORIZE_URL || 'https://claude.ai/oauth/authorize';
export const OAUTH_TOKEN_URL = process.env.CLAUDE_USAGE_TOKEN_URL || 'https://console.anthropic.com/v1/oauth/token';
// user:profile is required by /api/oauth/usage; user:inference matches Claude Code.
export const OAUTH_SCOPES = 'user:profile user:inference';
// Redirect used by the manual (copy/paste) fallback flow.
export const OAUTH_MANUAL_REDIRECT = 'https://console.anthropic.com/oauth/code/callback';

// The usage endpoint aggressively rate-limits unknown clients; a claude-code/*
// User-Agent lands in the normal bucket. anthropic-beta gates the OAuth surface.
export const CLAUDE_CODE_UA = 'claude-code/1.0.60 (external, cli)';
export const OAUTH_BETA = 'oauth-2025-04-20';
