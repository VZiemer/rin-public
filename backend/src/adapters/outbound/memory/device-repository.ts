import type { DeviceOwnership, DeviceRepository } from '../../../application/ports/device.js';
import type { Device } from '../../../domain/model/contracts.js';

export class InMemoryDeviceRepository implements DeviceRepository {
  constructor(
    private readonly byUser = new Map<string, Map<string, Device>>(),
    private readonly ownership = new Map<string, DeviceOwnership>(),
  ) {}

  async get(userId: string, id: string) {
    return this.byUser.get(userId)?.get(id) ?? null;
  }

  async list(userId: string) {
    return [...(this.byUser.get(userId)?.values() ?? [])];
  }

  async put(device: Device) {
    await this.claim(device);
  }

  async delete(userId: string, id: string) {
    const owned = this.ownership.get(id);
    if (owned && owned.ownerUserId !== userId) return;
    this.byUser.get(userId)?.delete(id);
    this.ownership.delete(id);
  }

  async getOwnership(deviceId: string) {
    return this.ownership.get(deviceId) ?? null;
  }

  async claim(device: Device) {
    const current = this.ownership.get(device.id);
    if (current && current.ownerUserId !== device.userId) {
      this.byUser.get(current.ownerUserId)?.delete(device.id);
    }
    const userDevices = this.byUser.get(device.userId) ?? new Map<string, Device>();
    userDevices.set(device.id, device);
    this.byUser.set(device.userId, userDevices);
    this.ownership.set(device.id, {
      deviceId: device.id,
      ownerUserId: device.userId,
      platform: device.platform,
      pushToken: device.pushToken,
      enabled: device.enabled,
      createdAt: device.createdAt,
      updatedAt: device.updatedAt,
    });
  }
}
