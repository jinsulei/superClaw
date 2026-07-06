export const gatewayStatusOk = `
Service: Scheduled Task (registered)
Gateway: bind=loopback (127.0.0.1), port=18789 (env/config)
Probe target: ws://127.0.0.1:18789
CLI version: 2026.5.26
Gateway version: 2026.5.26
Runtime: running
Connectivity probe: ok
Capability: connected-no-operator-scope
Listening: 127.0.0.1:18789
Service config looks out of date or non-standard.
Service config issue: Service command does not include the gateway subcommand
`

export const gatewayStatusTokenMismatch = `
Runtime: stopped
Listening: 127.0.0.1:18789
Connectivity probe: failed
Probe target: ws://127.0.0.1:18789
  未授权：网关令牌不匹配（提供网关认证令牌）
`

export const doctorWithDeferredWarnings = `
[agents/tool-policy] tool policy removed 39 tool(s) via tools.profile (coding): agents_list, gateway, message
{"ok":false,"findings":[{"checkId":"core/doctor/security","severity":"warning","message":"WARNING: openclaw.json contains plaintext secret-bearing config fields."},{"checkId":"core/doctor/security","severity":"warning","message":"Paths: gateway.auth.token, models.providers.minimax.apiKey"},{"checkId":"core/doctor/command-owner","severity":"info","message":"No command owner is configured."}]}
`

export const doctorWithBootstrapTruncation = `
{"ok":false,"findings":[{"checkId":"core/doctor/bootstrap","severity":"error","message":"workspace-default/AGENTS.md is truncated by bootstrapMaxChars"}]}
`

export const fakeSensitivePayload = {
  token: 'fake-token-should-be-redacted',
  apiKey: 'fake-apiKey-should-be-redacted',
  secret: 'fake-secret-should-be-redacted',
  nested: {
    cookie: 'fake-cookie-should-be-redacted',
  },
}
