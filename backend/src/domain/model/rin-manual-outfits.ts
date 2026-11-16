import {
  rinAssetSetSchema,
  type RinAssetCatalog,
  type RinAssetImage,
  type RinAssetSet,
} from './rin-assets.js';

export const rinManualOutfits = [
  { id: 'rin_00_rabbit', name: 'Bunny costume' },
  { id: 'rin_00_maid', name: 'Maid costume' },
  { id: 'rin_00_sexymaid', name: 'Sexy maid costume' },
  { id: 'rin_00_nude', name: 'Nude (no clothing)' },
] as const;

export function isManualRinImage(id: string) {
  return rinManualOutfits.some((outfit) => outfit.id === id);
}

export function manualRinOutfitSet(image: RinAssetImage): RinAssetSet {
  const outfit = rinManualOutfits.find((entry) => entry.id === image.id);
  if (!outfit) throw new Error('Unknown manual Rin outfit');
  return rinAssetSetSchema.parse({
    id: outfit.id,
    name: outfit.name,
    useCase: `${outfit.name}. Fictional appearance, available only through an explicit hypnosis or outfit request.`,
    enabled: true,
    manualOnly: true,
    priority: 0,
    rules: {},
    fallbackExpression: image.expression,
    images: [{ ...image, name: outfit.name }],
  });
}

/** Known manual identities remain protected even in old catalogs without the new flag. */
export function isManualAssetSet(catalog: RinAssetCatalog, set: RinAssetSet) {
  return (
    set.manualOnly === true ||
    (catalog.assistantId === 'RIN' && set.images.some((image) => isManualRinImage(image.id)))
  );
}
