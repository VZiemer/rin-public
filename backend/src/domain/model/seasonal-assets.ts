import { rinAssetSetSchema, type RinAssetImage, type RinAssetCatalog } from './rin-assets.js';

/** A deterministic daily draw prevents scheduler and chat from disagreeing about the outfit. */
export function dailyAssetDraw(assistantId: string, setId: string, date: string) {
  let hash = 2166136261;
  for (const char of `${assistantId}:${setId}:${date}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

export function replaceSeasonalAssets(
  catalog: RinAssetCatalog,
  halloween: RinAssetImage,
  weekend: RinAssetImage,
  sleep: RinAssetImage,
) {
  if (
    catalog.assistantId !== 'RIN' ||
    halloween.id !== 'rin_11_halloween' ||
    weekend.id !== 'rin_10_weekend' ||
    sleep.id !== 'rin_12_sleep'
  )
    throw new Error('Unexpected seasonal image identity');
  const holidayDates =
    catalog.sets.find((set) => set.id === 'HOLYDAY_SUNNY')?.rules.dates ??
    catalog.sets.find((set) => set.id === 'WEEKEND_RANDOM')?.rules.dates;
  const replacedIds = new Set([
    'rin_holyday',
    'rin_halloween',
    'rin_pajamas',
    halloween.id,
    weekend.id,
    sleep.id,
  ]);
  const preserved = catalog.sets.flatMap((set) => {
    const images = set.images.filter((image) => !replacedIds.has(image.id));
    return images.length ? [{ ...set, images }] : [];
  });
  if (
    preserved.some((set) => ['HALLOWEEN_MORNING', 'WEEKEND_RANDOM', 'SLEEP_NIGHT'].includes(set.id))
  )
    throw new Error('Seasonal set identity conflict');
  return [
    ...preserved,
    rinAssetSetSchema.parse({
      id: 'HALLOWEEN_MORNING',
      name: 'Rin Halloween',
      useCase:
        'Visual fictício de Halloween, sorteado no bom-dia durante outubro. Não presume que hoje seja 31 de outubro nem uma experiência física real.',
      enabled: true,
      priority: 100,
      rules: { months: [10], occasions: ['morning_briefing'], chance: 0.5 },
      fallbackExpression: halloween.expression,
      images: [{ ...halloween, name: 'Rin Halloween' }],
    }),
    rinAssetSetSchema.parse({
      id: 'WEEKEND_RANDOM',
      name: 'Rin Weekend',
      useCase:
        'Visual fictício de lazer, sorteado aos sábados, domingos e feriados cadastrados. Combina com praia e descanso, sem implicar viagem ou atividade física real.',
      enabled: true,
      priority: 60,
      rules: {
        weekdays: [0, 6],
        ...(holidayDates?.length ? { dates: holidayDates } : {}),
        chance: 0.5,
      },
      fallbackExpression: weekend.expression,
      images: [{ ...weekend, name: 'Rin Weekend' }],
    }),
    rinAssetSetSchema.parse({
      id: 'SLEEP_NIGHT',
      name: 'Rin de pijama à noite',
      useCase:
        'Visual fictício de pijama e sono, entre 22h e 06h no fuso do usuário. Manter o jeito tsundere sonolento, sem inventar experiências físicas.',
      enabled: true,
      priority: 200,
      rules: { timeWindow: { start: '22:00', end: '06:00' } },
      fallbackExpression: sleep.expression,
      images: [{ ...sleep, name: 'Rin Sleep — pijama' }],
    }),
  ];
}

/** These identities are shipped with the client; selection requires no remote download. */
export function isBundledRinImage(assistantId: string, imageName: string) {
  return (
    assistantId === 'RIN' &&
    ['rin_10_weekend', 'rin_11_halloween', 'rin_12_sleep'].includes(imageName)
  );
}
