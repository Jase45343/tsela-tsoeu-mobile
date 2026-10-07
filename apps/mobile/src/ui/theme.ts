/**
 * Design tokens. The app is used one-handed, outdoors, often in direct sun:
 * very dark ink on white, large type, 48dp+ targets, and status that is
 * always icon + word, never colour alone (NFR-008).
 *
 * One bold element per screen: the bus-yellow primary action.
 */
export const color = {
  ground: '#E8ECF1', // cool grey page behind white sheets
  sheet: '#FFFFFF',
  ink: '#0E1726', // ~17:1 on white
  inkSoft: '#3D4A5C', // ~9:1 on white, secondary text
  rule: '#C9D1DB',
  blue: '#00209F', // Lesotho flag blue: navigation, selection, links
  blueTint: '#E6E9F6',
  yellow: '#FFC20E', // school-bus yellow: the one primary action
  yellowPressed: '#E5AB00',
  paid: '#0B6B3A',
  paidTint: '#E3F2E9',
  partial: '#8A5300',
  partialTint: '#FBEFD9',
  owing: '#B3261E',
  owingTint: '#FBE4E2',
  muted: '#5B6675',
  mutedTint: '#EEF0F3',
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

export const radius = { sheet: 14, control: 10, pill: 999 } as const;

export const MIN_TOUCH = 52;
