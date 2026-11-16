import type { AgentOutput, Device } from '../../domain/model/contracts.js';
import type { DeviceRepository } from '../ports/device.js';
import type { NotificationGateway, NotificationResult } from '../ports/notification.js';

export interface DeviceSendResult extends NotificationResult {
  deviceId: string;
}
export interface DeliveryOutcome {
  sendResults: DeviceSendResult[];
  delivered: boolean;
}

/** Only devices that are enabled and hold a push token can receive a message. */
export function deliverableDevices(devices: Device[]): Device[] {
  return devices.filter((device) => device.enabled && Boolean(device.pushToken));
}

/**
 * Send a payload to every device, disabling any that report an invalid token.
 * `simulated` and `sent` both count as delivered (mirrors the console gateway).
 */
export async function deliverToDevices(
  devices: Device[],
  payload: AgentOutput,
  gateway: NotificationGateway,
  repository: Pick<DeviceRepository, 'put'>,
  now: Date,
): Promise<DeliveryOutcome> {
  const sendResults: DeviceSendResult[] = [];
  for (const device of devices) {
    const result = await gateway.send(device.pushToken, payload);
    sendResults.push({ deviceId: device.id, ...result });
    if (result.status === 'invalid_token')
      await repository.put({ ...device, enabled: false, updatedAt: now.toISOString() });
  }
  return {
    sendResults,
    delivered: sendResults.some((r) => r.status === 'sent' || r.status === 'simulated'),
  };
}
