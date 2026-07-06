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
