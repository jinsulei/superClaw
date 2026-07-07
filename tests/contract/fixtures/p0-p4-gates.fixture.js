export const fakeSecretValue = 'sk-proj-fake-secret-value-should-never-print'

export const devFixture = {
  mode: 'dev',
  git: {
    clean: true,
    packageTauriRuntimeSecretChanges: [],
  },
  gates: {
    releaseGatePassed: true,
    preflightPassed: true,
    runtimeSmokePassed: true,
  },
  openclaw: {
    gatewayReachable: true,
    tokenMismatch: false,
    bootstrapTruncated: false,
    plaintextSecretKeyPaths: [
      {
        key_path: 'gateway.auth.token',
        value: fakeSecretValue,
      },
      {
        key_path: 'models.providers.minimax.apiKey',
        value: 'minimax-fake-api-key-should-never-print',
      },
    ],
    oldPathHits: [],
    serviceConfigNonStandard: true,
    commandOwnerMissing: true,
    codingProfileTrimsTools: true,
  },
  packaging: {
    runtimeDataSecretsMayBePackaged: false,
    exeUsbSmokeAccepted: false,
  },
  regression: {
    unregisteredRegressionTests: [],
    chatJsChangedWithoutFocusedTest: false,
    scriptsDevApiChanged: false,
  },
  docs: {
    releaseChecklistMissingP0P4: true,
    runtimeManifestNeedsReview: true,
    registryDocsDrift: false,
  },
}

export const releaseFixture = {
  ...devFixture,
  mode: 'release',
  packaging: {
    runtimeDataSecretsMayBePackaged: true,
    exeUsbSmokeAccepted: false,
  },
}

export const releaseNoCandidateFixture = {
  ...devFixture,
  mode: 'release',
  packaging: {
    candidatePresent: false,
    runtimeDataSecretsMayBePackaged: false,
    exeUsbSmokeAccepted: false,
  },
}

export const cleanCandidateFixture = {
  ...devFixture,
  mode: 'release',
  packaging: {
    candidatePath: 'fixtures/clean-candidate',
    candidatePresent: true,
    candidateSecretLeaks: [],
    candidateUserStateHits: [],
    runtimeDataSecretsMayBePackaged: false,
    exeUsbSmokeAccepted: true,
  },
}

export const dirtyCandidateFixture = {
  ...devFixture,
  mode: 'release',
  packaging: {
    candidatePath: 'fixtures/dirty-candidate',
    candidatePresent: true,
    candidateSecretLeaks: [
      {
        path: 'resources/data/.openclaw/openclaw.json',
        key_path: 'gateway.auth.token',
        value: fakeSecretValue,
      },
      {
        path: 'resources/data/.openclaw/openclaw.json',
        key_path: 'models.providers.minimax.apiKey',
        value: 'minimax-fake-api-key-should-never-print',
      },
      {
        path: 'resources/data/claude-panel/relay-config.json',
        key_path: 'apiKey',
        value: 'relay-fake-api-key-should-never-print',
      },
      {
        path: 'resources/data/hermes/.env',
        key_path: '.env',
        value: 'HERMES_TOKEN=env-fake-secret-should-never-print',
      },
      {
        path: 'resources/runtime/data/secrets/key.json',
        key_path: 'runtime/data/secrets',
        value: 'runtime-fake-secret-should-never-print',
      },
    ],
    candidateUserStateHits: [
      {
        path: 'resources/data/browser-profile/Cookies',
        reason: 'browser profile',
      },
      {
        path: 'resources/data/logs/openclaw.log',
        reason: 'logs',
      },
      {
        path: 'resources/data/sessions/session.db',
        reason: 'db/sessions',
      },
    ],
    runtimeDataSecretsMayBePackaged: false,
    exeUsbSmokeAccepted: true,
  },
}
