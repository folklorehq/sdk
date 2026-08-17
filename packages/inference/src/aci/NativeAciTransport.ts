// SPDX-License-Identifier: Apache-2.0
import type {
  ForwardAdmissionCapability,
  MutuallyAttestedChannel,
  OfficialAciTransportPort,
} from '../ports.js';
import { consumeForwardAdmissionCapability } from './forward-admission-capability.js';

export class NativeAciTransport implements OfficialAciTransportPort {
  async send(input: {
    readonly capability: ForwardAdmissionCapability;
    readonly signal?: AbortSignal;
  }) {
    const data = consumeForwardAdmissionCapability(input.capability);
    try {
      if (input.signal?.aborted) throw new Error('native_send_cancelled');
      const operation = data.leaseStore.writeOnce({
        lease: data.lease,
        confirmation: data.confirmation,
        trustedTime: data.trustedTime,
        channel: data.channel,
        requestWire: data.requestWire,
        signal: input.signal,
      });
      return await this.awaitSignal(operation, input.signal);
    } catch {
      await this.abort(data, 'send_failed');
      throw new Error('native_send_failed');
    } finally {
      data.requestWire.bytes.fill(0);
      data.lease.privateRequestWire.bytes.fill(0);
      await this.close(data.channel);
    }
  }

  private async abort(
    data: ReturnType<typeof consumeForwardAdmissionCapability>,
    reason: string,
  ): Promise<void> {
    try {
      await data.leaseStore.abort({
        context: {
          orgId: data.lease.orgId,
          deploymentId: data.lease.deploymentId,
          bootEpoch: data.lease.bootEpoch,
          checkpointDigest: data.lease.trustedTimeCheckpointDigest,
        },
        reservationId: data.lease.reservationId,
        leaseId: data.lease.leaseId,
        reason,
      });
    } catch {
      return;
    }
  }

  private async close(channel: MutuallyAttestedChannel): Promise<void> {
    try {
      await channel.close();
    } catch {
      return;
    }
  }

  private async awaitSignal<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal === undefined) return operation;
    if (signal.aborted) throw new Error('native_send_cancelled');
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new Error('native_send_cancelled'));
      const cleanup = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      operation.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        },
      );
    });
  }
}
