import { randomBytes, createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, customFetch } from 'jose';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = ['openid', 'profile', 'email', 'offline_access', 'resource.invoke', 'chatgpt.tokens.use.direct'];
const random = () => randomBytes(32).toString('base64url');
const issue = message => new Error(message);

export function makeAuthorization({ hostId, callback, clientId, session, now = Date.now() }) {
  const pending = { state: random(), nonce: random(), verifier: random(), callback, clientId, session, expires: now + 600000 };
  const url = new URL(`${ISSUER}/api/accounts/authorize`);
  const params = { client_id: clientId || 'dynamic_agent_client', ext_agent_host_id: hostId, response_type: 'code', redirect_uri: callback,
    scope: SCOPES.join(' '), resource: RESOURCE, state: pending.state, nonce: pending.nonce,
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(pending.verifier).digest('base64url') };
  if (!clientId) params.agent_name_hint = '知金台';
  url.search = new URLSearchParams(params).toString();
  return { url: url.href, pending };
}

export function validateCallback(params, pending, session, now = Date.now()) {
  if (!pending || pending.expires < now || params.get('state') !== pending.state || session !== pending.session) throw issue('登录请求已过期或不匹配，请重新开始。');
  if (params.has('error')) throw issue('你尚未完成授权，可以重新登录并选择允许使用 ChatGPT 套餐。');
  const clientId = params.get('client_id') || pending.clientId;
  if (!clientId || clientId === 'dynamic_agent_client' || (pending.clientId && clientId !== pending.clientId)) throw issue('本次登录未返回正确的应用注册信息，请重新开始。');
  const code = params.get('code'); if (!code || code.length > 8192) throw issue('未收到有效的登录结果。');
  return { code, clientId };
}

export class ChatGPTAuth {
  constructor({ store, hostId, callback, fetchImpl = fetch, now = Date.now }) {
    Object.assign(this, { store, hostId, callback, fetchImpl, now });
    this.jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`), { timeoutDuration: 20000, [customFetch]: async (url, options) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { return await this.fetchImpl(url, options); } catch (error) { if (attempt === 1) throw error; }
      }
    } });
  }
  async init() { this.account = await this.store.load(); }
  begin(session) {
    const { url, pending } = makeAuthorization({ hostId: this.hostId, callback: this.callback, clientId: this.account?.client_id || this.unconfirmedClientId, session, now: this.now() });
    this.pending = pending; return url;
  }
  async token(form) {
    const response = await this.fetchImpl(`${ISSUER}/api/accounts/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form), signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw issue('ChatGPT 登录暂未完成，请重新登录；若提示套餐未开放，请在 ChatGPT 中检查权限。');
    return response.json();
  }
  async complete(params, session) {
    const pending = this.pending;
    // Consume only a matching transaction. An unrelated request cannot cancel login.
    const { code, clientId } = validateCallback(params, pending, session, this.now()); this.pending = null;
    this.unconfirmedClientId = clientId;
    this.stage = 'exchange';
    const tokens = await this.token({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: pending.verifier, redirect_uri: pending.callback, resource: RESOURCE });
    this.stage = 'identity';
    const { payload } = await jwtVerify(tokens.id_token, this.jwks, { issuer: ISSUER, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'], clockTolerance: 5, algorithms: ['RS256', 'ES256'] });
    if (payload.nonce !== pending.nonce || !payload.sub || (this.account && payload.sub !== this.account.subject)) throw issue('登录身份校验未通过，请重新开始。');
    this.stage = 'permission';
    const scopes = String(tokens.scope || '').split(/\s+/).filter(Boolean);
    if (!scopes.includes('chatgpt.tokens.use.direct') || !scopes.includes('resource.invoke')) throw issue('账号已登录，但未授权使用 ChatGPT 套餐。请重新登录并在官方页面启用套餐使用权限。');
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) throw issue('登录凭据不完整，请重新登录。');
    const account = { client_id: clientId, subject: payload.sub, email: payload.email || '', issuer: payload.iss,
      access_token: tokens.access_token, refresh_token: tokens.refresh_token, id_token: tokens.id_token, scopes,
      expires_at: this.now() + tokens.expires_in * 1000, welcomeSeen: this.account?.welcomeSeen || false };
    this.stage = 'save';
    await this.store.save(account); this.account = account; this.models = null; this.unconfirmedClientId = null; this.stage = 'connected';
  }
  async accessToken() {
    if (!this.account?.access_token) throw issue('请先点击 Continue with ChatGPT，连接你的 Plus 账号。');
    if (this.account.expires_at > this.now() + 60000) return this.account.access_token;
    if (!this.refreshing) this.refreshing = this.refresh().finally(() => { this.refreshing = null; });
    await this.refreshing; return this.account.access_token;
  }
  async refresh() {
    const previous = this.account;
    try {
      const tokens = await this.token({ grant_type: 'refresh_token', client_id: previous.client_id, refresh_token: previous.refresh_token, resource: RESOURCE });
      const scopes = tokens.scope ? String(tokens.scope).split(/\s+/) : previous.scopes;
      if (!tokens.access_token || !Number.isFinite(tokens.expires_in) || !scopes.includes('chatgpt.tokens.use.direct')) throw issue('登录授权已失效，请重新登录。');
      const next = { ...previous, ...tokens, scopes, expires_at: this.now() + tokens.expires_in * 1000 };
      next.refresh_token = tokens.refresh_token || previous.refresh_token;
      await this.store.save(next); this.account = next;
    } catch { throw issue('ChatGPT 登录已过期或无法续期，请重新登录。'); }
  }
  async listModels() {
    if (this.models && this.modelsAt + 300000 > this.now()) return this.models;
    const token = await this.accessToken();
    const response = await this.fetchImpl(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw issue('暂时无法读取这个 ChatGPT 账号可用的模型，请稍后重试或重新登录。');
    const data = await response.json();
    this.models = (data.models || []).filter(m => m.visibility === 'list' && typeof m.slug === 'string').map(m => ({ slug: m.slug, display_name: String(m.display_name || m.slug) }));
    if (!this.models.length) throw issue('这个账号暂未返回可用模型，请在 ChatGPT 中检查 Plus 套餐与应用授权。');
    this.modelsAt = this.now(); return this.models;
  }
  async signOut() {
    const previous = this.account; let revoked = !previous?.refresh_token;
    if (previous?.refresh_token) {
      try {
        const discovery = await (await this.fetchImpl(`${ISSUER}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) })).json();
        const endpoint = new URL(discovery.revocation_endpoint);
        if (endpoint.origin !== ISSUER) throw Error('invalid endpoint');
        const response = await this.fetchImpl(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: previous.refresh_token, token_type_hint: 'refresh_token', client_id: previous.client_id }), signal: AbortSignal.timeout(10000) });
        revoked = response.status === 200;
      } catch { /* UI explains unconfirmed remote revocation. */ }
    }
    this.account = previous ? { client_id: previous.client_id, subject: previous.subject, email: previous.email, welcomeSeen: previous.welcomeSeen } : null;
    await this.store.save(this.account); this.models = null; this.pending = null;
    return revoked;
  }
}
