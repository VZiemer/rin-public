import type { AssetOnboarding, AssetUsageDecision } from '../../domain/model/asset-onboarding.js';
import type { RinAssetImage } from '../../domain/model/rin-assets.js';

export interface AssetOnboardingRepository {
  get(userId: string, imageName: string): Promise<AssetOnboarding | null>;
  listOpen(userId: string): Promise<AssetOnboarding[]>;
  /** Compare-and-swap; null creates and permanently reserves the image identity. */
  save(record: AssetOnboarding, expectedRevision: number | null): Promise<boolean>;
}
export interface UploadedAssetSource {
  inspect(objectKey: string): Promise<RinAssetImage>;
}
export interface AssetUsageAnalyzer {
  analyze(record: AssetOnboarding, answer: string): Promise<AssetUsageDecision>;
}
