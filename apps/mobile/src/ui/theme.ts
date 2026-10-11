/**
 * Tsela-Tšoeu design tokens: earth browns from the brand, mountain road at dusk.
 * The app is used one-handed, outdoors, often in direct sun: dark ink on white
 * (18:1), 52dp+ targets, and status that is always icon + word, never colour
 * alone (NFR-008). Every pairing here is at least 4.5:1.
 *
 * One bold element per screen: the copper primary action.
 */
export const color = {
  ground: '#F4EFEA', // warm stone page behind white sheets
  sheet: '#FFFFFF',
  ink: '#1F120C', // 18:1 on white
  inkSoft: '#4D3B31', // 10:1 on white, secondary text
  rule: '#D9CDC3',
  brand: '#7A3B1E', // road brown: navigation, selection, links (8.5:1 on white)
  brandTint: '#F3E4DA',
  action: '#8E4524', // copper: the one primary action, white text (6.9:1)
  actionPressed: '#6F3418',
  onAction: '#FFFFFF',
  night: '#24140D', // welcome and splash background
  sand: '#F1E4D6', // text on night (14:1)
  sandSoft: '#B9A89B', // secondary text on night (7.7:1)
  copper: '#D07D4F', // accent on night (5.7:1)
  paid: '#0B6B3A',
  paidTint: '#E3F2E9',
  partial: '#8A5300',
  partialTint: '#FBEFD9',
  owing: '#B3261E',
  owingTint: '#FBE4E2',
  muted: '#5E5148',
  mutedTint: '#EFEAE6',
} as const;

export const font = {
  regular: 'AtkinsonHyperlegible_400Regular',
  bold: 'AtkinsonHyperlegible_700Bold',
} as const;

/** Type scale (sp). Base 17 for outdoor reading. */
export const type = {
  figure: 36,
  title: 26,
  heading: 20,
  body: 17,
  label: 15,
  small: 14,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sheet: 14, control: 12, pill: 999 } as const;

export const MIN_TOUCH = 52;
