import type {
  RinAssetCatalog,
  RinAssetImage,
  RinAssetMood,
  RinAssetOccasion,
} from '../../domain/model/rin-assets.js';
import type { Device } from '../../domain/model/contracts.js';

export interface RinAssetCatalogRepository {
  get(assistantId: string): Promise<RinAssetCatalog | null>;
  /** Atomically replace the pointer and reserve an immutable version. */
  publish(catalog: RinAssetCatalog, expectedVersion: string | null): Promise<void>;
}
export interface RinAssetStorage {
  verify(assistantId: string, image: RinAssetImage): Promise<void>;
  download(assistantId: string, image: RinAssetImage): Promise<{ url: string; expiresAt: string }>;
}
export interface AssetDeviceSource {
  /** All enabled devices, paginated by the adapter; catalogs are shared across users. */
  listEnabled(): AsyncIterable<Device>;
}
export interface AssetSelectionDelivery {
  scope: string;
  refreshedAt: string;
}
export interface AssetSelectionRepository {
  get(assistantId: string, device: Device): Promise<AssetSelectionDelivery | null>;
  put(assistantId: string, device: Device, delivery: AssetSelectionDelivery): Promise<void>;
}
export interface AssetEnvironment {
  mood?: RinAssetMood | undefined;
  occasion?: RinAssetOccasion | undefined;
  weather?: unknown;
  timezone?: string;
}
export interface AssetEnvironmentSource {
  get(userId: string, now: Date, assistantId?: string): Promise<AssetEnvironment>;
}
