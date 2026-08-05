// Única fuente de verdad del diseño: cualquier color/duración/curva nuevos
// nacen aquí y llegan al CSS vía `npm run build:tokens`, nunca a mano.

export const themes = {
  dark: {
    'bg-void': '#0A0C0F',
    'bg-stone': '#12151A',
    'bg-slab': '#1A1E25',
    line: '#262B33',
    'line-strong': '#333A44',
    ink: '#E8EDF2',
    'ink-muted': '#9AA4B2',
    'ink-faint': '#5C6672',
    'accent-aurora': '#4FD8C4',
    'accent-aurora-deep': '#2BA893',
    'accent-ember': '#FF8A3D',
    'accent-ember-deep': '#E8734A',
    danger: '#E5604F',
    'aurora-glow': 'rgba(79, 216, 196, 0.25)',
    'ember-glow': 'rgba(255, 138, 61, 0.30)',
  },
  light: {
    'bg-void': '#F2F4F6',
    'bg-stone': '#FFFFFF',
    'bg-slab': '#E9ECEF',
    line: '#D5DAE0',
    'line-strong': '#B9C0C9',
    ink: '#1A2028',
    'ink-muted': '#5A6472',
    'ink-faint': '#8B95A1',
    'accent-aurora': '#1F9C8A',
    'accent-aurora-deep': '#157A6C',
    'accent-ember': '#D97A2E',
    'accent-ember-deep': '#C05F1F',
    danger: '#C74436',
    'aurora-glow': 'rgba(31, 156, 138, 0.20)',
    'ember-glow': 'rgba(217, 122, 46, 0.25)',
  },
} as const

export const core = {
  space: { 1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '20px', 6: '24px', 7: '32px', 8: '40px', 9: '48px', 10: '64px', 11: '80px', 12: '96px' },
  radius: { xs: '2px', sm: '6px', md: '10px', full: '9999px' },
  font: {
    display: "'Chakra Petch', system-ui, sans-serif",
    body: "'Inter Variable', system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
  },
  dur: { 1: '120ms', 2: '200ms', 3: '320ms', 4: '600ms', 5: '1200ms' },
  ease: {
    out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.4, 0.44, 1)',
    carve: 'cubic-bezier(0.7, 0, 0.2, 1)',
    inout: 'cubic-bezier(0.45, 0, 0.55, 1)',
  },
  z: { nav: '40', sheet: '50', toast: '60', timer: '70' },
  shadow: {
    aurora: '0 0 20px var(--bk-aurora-glow)',
    ember: '0 0 24px var(--bk-ember-glow)',
  },
} as const
