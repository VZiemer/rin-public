import type { Device } from '../../domain/model/contracts.js';

export interface DeviceOwnership {
  deviceId: string;
  ownerUserId: string;
  platform: 'android';
  pushToken: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceRepository {
  get(userId: string, id: string): Promise<Device | null>;
  list(userId: string, limit?: number): Promise<Device[]>;
  put(device: Device): Promise<void>;
  delete(userId: string, id: string): Promise<void>;
  getOwnership?(deviceId: string): Promise<DeviceOwnership | null>;
  claim?(device: Device): Promise<void>;
}
