import type { NotificationGateway } from '../ports/notification.js';
import type { DeviceRepository } from '../ports/device.js';
import type { Clock } from '../ports/runtime.js';
import { agentOutputSchema } from '../../domain/model/validation.js';
import { AppError } from '../../domain/errors/app-error.js';
import type { RinVisualAssets } from '../assets/selection.js';
export class SendNotification {
  constructor(
    private devices: DeviceRepository,
    private gateway: NotificationGateway,
    private clock: Clock,
    private visualAssets?: RinVisualAssets,
  ) {}
  async execute(userId: string, deviceId: string, input: unknown) {
    const parsed = agentOutputSchema.parse(input);
    const payload = this.visualAssets ? await this.visualAssets.apply(parsed, userId) : parsed;
    if (this.devices.getOwnership) {
      const ownership = await this.devices.getOwnership(deviceId);
      if (!ownership || ownership.ownerUserId !== userId || !ownership.enabled) {
        throw new AppError('device_unavailable', 404);
      }
    }
    const device = await this.devices.get(userId, deviceId);
    if (!device || !device.enabled) throw new AppError('device_unavailable', 404);
    const result = await this.gateway.send(device.pushToken, payload);
    if (result.status === 'invalid_token')
      await this.devices.put({
        ...device,
        enabled: false,
        updatedAt: this.clock.now().toISOString(),
      });
    return result;
  }
}
