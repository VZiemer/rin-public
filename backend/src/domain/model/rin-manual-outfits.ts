import {
  rinAssetSetSchema,
  type RinAssetCatalog,
  type RinAssetImage,
  type RinAssetSet,
} from './rin-assets.js';

export const rinManualOutfits = [
  { id: 'rin_00_rabbit', name: 'Fantasia de coelinha' },
  { id: 'rin_00_maid', name: 'Fantasia de maid' },
  { id: 'rin_00_sexymaid', name: 'Fantasia de maid sexy' },
  { id: 'rin_00_nude', name: 'Nude (sem roupa)' },
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
    useCase: `${outfit.name}. Visual fictício, disponível somente por pedido explícito via hipnose ou "use fantasia".`,
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
