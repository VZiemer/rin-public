import { z } from 'zod';
import type { DeviceRepository } from '../ports/device.js';
import type { Clock } from '../ports/runtime.js';
import type { Device } from '../../domain/model/contracts.js';
import { AppError } from '../../domain/errors/app-error.js';
const inputSchema = z
  .object({
    platform: z.literal('android'),
    pushToken: z.string().trim().min(1).max(4096),
    enabled: z.boolean().default(true),
  })
  .strict();
export function publicDevice(v: Device) {
  return {
    id: v.id,
    platform: v.platform,
    enabled: v.enabled,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  };
}
export class Devices {
  constructor(
    private repo: DeviceRepository,
    private clock: Clock,
  ) {}
  async put(userId: string, id: string, input: unknown) {
    z.string()
      .regex(/^[\w-]{1,128}$/)
      .parse(id);
    if (input && typeof input === 'object' && 'ownerUserId' in input) {
      throw new AppError('unauthorized', 401);
    }
    const v = inputSchema.parse(input);
    const old = (await this.repo.get(userId, id)) ?? null;
    const now = this.clock.now().toISOString();
    const device = { ...v, id, userId, createdAt: old?.createdAt ?? now, updatedAt: now };
    if (this.repo.claim) await this.repo.claim(device);
    else await this.repo.put(device);
    return publicDevice(device);
  }
  async get(userId: string, id: string) {
    if (this.repo.getOwnership) {
      const ownership = await this.repo.getOwnership(id);
      if (!ownership || ownership.ownerUserId !== userId) throw new AppError('device_not_found', 404);
    }
    const v = await this.repo.get(userId, id);
    if (!v) throw new AppError('device_not_found', 404);
    return publicDevice(v);
  }
  async delete(userId: string, id: string) {
    if (this.repo.getOwnership) {
      const ownership = await this.repo.getOwnership(id);
      if (!ownership || ownership.ownerUserId !== userId) throw new AppError('device_not_found', 404);
    }
    await this.repo.delete(userId, id);
  }
}
