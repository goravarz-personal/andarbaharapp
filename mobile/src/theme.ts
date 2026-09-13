/**
 * One place for colour, spacing and type. The look is a card table: felt
 * green, cream cards, a little gold.
 */
export const colors = {
  felt: '#0B3D2E',
  feltDeep: '#072A1F',
  feltSoft: '#12543F',
  gold: '#E2B24A',
  goldSoft: '#F6E7C2',

  background: '#F3F1EA',
  surface: '#FFFFFF',
  surfaceMuted: '#FAF8F2',

  ink: '#1A201E',
  inkMuted: '#5F6B66',
  inkFaint: '#98A39E',

  line: '#E4E1D7',
  lineStrong: '#CFCBBD',

  win: '#1E8E5A',
  winSoft: '#E4F4EC',
  loss: '#C62831',
  lossSoft: '#FBE9EA',
  warn: '#B07D17',
  warnSoft: '#FBF1DC',

  white: '#FFFFFF',
};

/** 4pt grid. spacing(3) === 12. */
export function spacing(steps: number): number {
  return steps * 4;
}

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const font = {
  display: { fontSize: 30, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  heading: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyStrong: { fontSize: 15, fontWeight: '600' as const },
  small: { fontSize: 13, fontWeight: '400' as const },
  smallStrong: { fontSize: 13, fontWeight: '600' as const },
  caption: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.6 },
};

export const shadow = {
  card: {
    shadowColor: '#1A201E',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: '#1A201E',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
};
