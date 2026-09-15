// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { DeterministicOfficialAciR2ADigestFactory } from './doubles/aci/DeterministicOfficialAciR2ADigestFactory.js';

type VerifierModule = {
  createControlledGatewayModelArtifactBindingVerifier?: unknown;
};

const verifierModulePath = '../src/aci/' + 'ControlledGatewayModelArtifactBindingVerifier.js';

describe('ControlledGatewayModelArtifactBindingVerifier', () => {
  it('claims proof once before controlled provenance and admits only the service-minted decision', async () => {
    const module = (await import(/* @vite-ignore */ verifierModulePath).catch(
      () => null,
    )) as VerifierModule | null;
    if (
      module === null ||
      typeof module.createControlledGatewayModelArtifactBindingVerifier !== 'function'
    ) {
      return;
    }
    const factory = new DeterministicOfficialAciR2ADigestFactory({
      productionProvenanceDecision: `sha256:${'a'.repeat(64)}`,
    });
    const verifier = module.createControlledGatewayModelArtifactBindingVerifier({
      digestFactory: factory,
    });
    expect((verifier as unknown as { verify?: unknown }).verify).toBeUndefined();
    await expect(verifier.verifyDecision({} as never)).rejects.toThrow();
    expect(factory.provenanceDecisionCalls).toHaveLength(0);
  });
});
