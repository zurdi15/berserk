# berserk Phase 3: Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The real berserk frontend foundation: token pipeline (TS → CSS), the Bk* primitive library with the Norse-futurist design language, pure-CSS animation system, i18n (ES/EN), typed API client with auth store and router guards, login/bootstrap screens, app shell with bottom navigation, and installable PWA — everything Phase 4's views will be built from.

**Architecture:** Replaces the Phase-1 placeholder wholesale. `src/tokens/index.ts` is the single source of truth, compiled to `src/styles/tokens.css` by a build script and enforced by a `guard:tokens` script (no raw hex/easings/px in components). Primitives live in `src/lib/`, are self-contained SFCs styled exclusively through tokens + Tailwind utilities, and animations are pure CSS (entry-only, transform/opacity, one `prefers-reduced-motion` guard). Auth/session state in a Pinia store over a typed `fetch` wrapper that maps backend error slugs through i18n.

**Tech Stack:** Vue 3.5 + TypeScript, Vite 7, Tailwind 4 (`@tailwindcss/vite`), Pinia, vue-router, vue-i18n, vite-plugin-pwa, @fontsource (Chakra Petch, Inter, JetBrains Mono), vitest + @vue/test-utils + happy-dom. This work happens in an isolated worktree on branch `feat/phase-3-frontend`; the backend on `main` (Phase 1 auth API) is the only API dependency.

## Design direction (binding)

Sharpened from the approved spec — these exact values go into the tokens and MUST NOT be re-invented downstream:

- **Palette (dark-first)**: void `#0A0C0F` (page bg, cold blue-black), stone `#12151A` (surface), slab `#1A1E25` (raised surface), line `#262B33` / line-strong `#333A44` (1px edges), ink `#E8EDF2`, ink-muted `#9AA4B2`, ink-faint `#5C6672`. Accents: **aurora `#4FD8C4`** (teal — deliberately NOT acid green; interactive elements + data), aurora-deep `#2BA893` (pressed/borders), **ember `#FF8A3D`** with ember-deep `#E8734A` (reserved EXCLUSIVELY for achievements: PRs, streak), danger `#E5604F`. Light theme redefines: bg `#F2F4F6`, surface `#FFFFFF`, raised `#E9ECEF`, lines `#D5DAE0`/`#B9C0C9`, ink `#1A2028`/muted `#5A6472`/faint `#8B95A1`, aurora `#1F9C8A`, aurora-deep `#157A6C`, ember `#D97A2E`, ember-deep `#C05F1F`, danger `#C74436`.
- **Surfaces**: "carved slabs" — low radius, 1px `line` border, NO soft drop shadows; glow shadows exist only for aurora/ember emphasis (`--bk-shadow-aurora`, `--bk-shadow-ember`).
- **Type**: display **Chakra Petch** (600/700; headings, big numbers), body/UI **Inter** (400/500/600), data **JetBrains Mono** (400/600 + `tabular-nums`; every weight/rep/time value). All self-hosted via @fontsource — no CDN.
- **Signature element**: the carved rune — `BkRune` renders SVG strokes that draw themselves (stroke-dashoffset) on entry. Ember flash is Phase 4 (PR celebration); the primitive and its carve animation land here.
- **Texture**: one subtle noise layer on the page background only (inline SVG feTurbulence data-URI at ~3% opacity), nothing else textured.
- **Motion**: durations 120/200/320/600/1200 ms, easings `--bk-ease-out cubic-bezier(0.2, 0.8, 0.2, 1)`, `--bk-ease-spring cubic-bezier(0.34, 1.4, 0.44, 1)`, `--bk-ease-carve cubic-bezier(0.7, 0, 0.2, 1)`. Entry animations only; transform/opacity only; single reduced-motion guard in `animations.css`.

## Global Constraints

- All work under `frontend/` in the `feat/phase-3-frontend` worktree. Never touch `backend/`.
- Tokens: `src/tokens/index.ts` is the only place a raw color/duration/easing may exist. `npm run build:tokens` regenerates `src/styles/tokens.css` (committed, never hand-edited — header comment says so). `npm run guard:tokens` fails on raw hex, raw `cubic-bezier(`, or `text-[..px]`-style arbitrary values inside `src/` (excluding `src/tokens/` and generated `tokens.css`).
- CSS variable prefix `--bk-*`. Dark is the default theme on `:root`; light = `html.bk-light` redefining variables. Never Tailwind `dark:` variants.
- Animations: pure CSS, entries only, transform/opacity only, one `prefers-reduced-motion` guard.
- i18n: every user-facing string through vue-i18n (ES + EN from day one); backend error slugs map to `errors.<slug>` keys with a generic fallback.
- API: same-origin `/api/v1` (Vite dev proxy → :8000). The client NEVER stores tokens (HttpOnly cookie session); 401 handling redirects to login.
- Weights: kg canonical from the API; lb conversion is display-only via the units util.
- Tests: `npm run test` (vitest) for stores/utils/composables; `npm run build` = `vue-tsc --noEmit && vite build` must stay green every task. Identifiers in English; comments Spanish "why" only. Conventional commits.
- Commands run from `frontend/` inside the worktree.

## File Structure

```
frontend/
├── package.json / vite.config.ts / tsconfig.json / index.html
├── scripts/build-tokens.mjs · scripts/guard-tokens.sh
└── src/
    ├── tokens/index.ts          # única fuente de verdad
    ├── styles/{tokens.css (gen), base.css, animations.css}
    ├── lib/                     # Bk* primitives + __tests__
    ├── api/{client.ts, auth.ts}
    ├── stores/{auth.ts, toast.ts}
    ├── composables/{useLocale.ts}
    ├── utils/{units.ts}
    ├── i18n/{index.ts, es.ts, en.ts}
    ├── router/index.ts
    ├── views/{LoginView.vue, BootstrapView.vue, ShellView.vue, PlaceholderView.vue}
    ├── App.vue · main.ts
    └── pwa/ (icons)
```

---

### Task 1: Toolchain reset (real app scaffold)

**Files:**
- Modify: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.ts`, `frontend/src/App.vue`
- Create: `frontend/vitest.config.ts`, `frontend/src/vite-env.d.ts` (keep), folder skeleton per File Structure (empty `.gitkeep`-free — folders appear as files land)
- Delete: nothing (placeholder App.vue content replaced)

**Interfaces:**
- Produces: installable deps (`pinia`, `vue-router@4`, `vue-i18n@11`, `@tailwindcss/vite` + `tailwindcss@4`, `vite-plugin-pwa`, `@fontsource/chakra-petch`, `@fontsource-variable/inter`, `@fontsource/jetbrains-mono`, dev: `vitest`, `@vue/test-utils`, `happy-dom`); scripts `dev/build/preview/test/build:tokens/guard:tokens` (last two are stubs until Task 2 — `echo` placeholders are FORBIDDEN; wire them as real script files in Task 2 and leave them OUT of package.json in this task); `@` alias → `src/`.

- [ ] **Step 1: Rewrite the build config files**

`frontend/package.json`:

```json
{
  "name": "berserk-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@fontsource-variable/inter": "^5.2.5",
    "@fontsource/chakra-petch": "^5.2.5",
    "@fontsource/jetbrains-mono": "^5.2.5",
    "pinia": "^3.0.2",
    "vue": "^3.5.13",
    "vue-i18n": "^11.1.3",
    "vue-router": "^4.5.1"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.7",
    "@vitejs/plugin-vue": "^6.0.0",
    "@vue/test-utils": "^2.4.6",
    "happy-dom": "^17.4.6",
    "tailwindcss": "^4.1.7",
    "typescript": "~5.8.3",
    "vite": "^7.0.0",
    "vite-plugin-pwa": "^1.0.0",
    "vitest": "^3.1.3",
    "vue-tsc": "^3.0.0"
  }
}
```

`frontend/vite.config.ts`:

```typescript
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
```

`frontend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "types": ["vite/client"],
    "skipLibCheck": true,
    "noEmit": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*.ts", "src/**/*.vue", "scripts/**/*.mjs"]
}
```

`frontend/vitest.config.ts`:

```typescript
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'happy-dom',
  },
})
```

`frontend/index.html`:

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0A0C0F" />
    <title>berserk</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`frontend/src/main.ts` (minimal for this task; router/i18n/pinia wiring grows in later tasks):

```typescript
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

`frontend/src/App.vue` (transitional — replaced in Task 7 by the router shell):

```vue
<template>
  <main>berserk</main>
</template>
```

- [ ] **Step 2: Install and verify build + empty test run**

```bash
cd frontend
npm install --no-audit --no-fund
npm run build
npm run test -- --passWithNoTests
```

Expected: build green; vitest exits 0 with no tests.

- [ ] **Step 3: Commit (with lockfile)**

```bash
git add frontend/
git commit -m "feat: real frontend toolchain (tailwind4, pinia, router, i18n, pwa deps)"
```

---

### Task 2: Token pipeline (TS → CSS) + guard

**Files:**
- Create: `frontend/src/tokens/index.ts`
- Create: `frontend/scripts/build-tokens.mjs`
- Create: `frontend/scripts/guard-tokens.sh` (mode 0755)
- Create: `frontend/src/styles/tokens.css` (generated output, committed)
- Modify: `frontend/package.json` (add `build:tokens`, `guard:tokens` scripts; chain guard into `build`)
- Test: `frontend/src/tokens/__tests__/tokens.spec.ts`

**Interfaces:**
- Produces: `tokens.themes.dark` / `tokens.themes.light` (flat `Record<string, string>` of color tokens), `tokens.core` (space/radius/font/dur/ease/z/shadow), CSS variables `--bk-<group>-<name>` for every token; scripts `npm run build:tokens` (regenerates tokens.css deterministically) and `npm run guard:tokens` (fails on raw values in src/). `build` script becomes `npm run guard:tokens && vue-tsc --noEmit && vite build`.

- [ ] **Step 1: Write the failing test**

`frontend/src/tokens/__tests__/tokens.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { core, themes } from '../index'

const css = readFileSync(
  fileURLToPath(new URL('../../styles/tokens.css', import.meta.url)),
  'utf-8',
)

describe('token pipeline', () => {
  it('light theme redefines exactly the dark color keys', () => {
    expect(Object.keys(themes.light).sort()).toEqual(Object.keys(themes.dark).sort())
  })

  it('accent split is respected: aurora is teal, ember is reserved', () => {
    expect(themes.dark['accent-aurora']).toBe('#4FD8C4')
    expect(themes.dark['accent-ember']).toBe('#FF8A3D')
  })

  it('generated css contains every dark token as --bk-* on :root', () => {
    for (const key of Object.keys(themes.dark)) {
      expect(css).toContain(`--bk-${key}:`)
    }
    expect(css).toMatch(/^:root \{/m)
    expect(css).toMatch(/^html\.bk-light \{/m)
  })

  it('generated css contains core tokens (spacing, durations, easings)', () => {
    expect(css).toContain('--bk-space-4:')
    expect(css).toContain('--bk-dur-3: 320ms')
    expect(css).toContain('--bk-ease-spring: cubic-bezier(0.34, 1.4, 0.44, 1)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test`
Expected: FAIL — cannot resolve `../index` / missing tokens.css.

- [ ] **Step 3: Implement the tokens source**

`frontend/src/tokens/index.ts`:

```typescript
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
  },
  z: { nav: '40', sheet: '50', toast: '60', timer: '70' },
  shadow: {
    aurora: '0 0 20px var(--bk-aurora-glow)',
    ember: '0 0 24px var(--bk-ember-glow)',
  },
} as const
```

`frontend/scripts/build-tokens.mjs`:

```javascript
// Genera src/styles/tokens.css desde src/tokens/index.ts. Determinista:
// mismo input, mismo output byte a byte (el diff de git delata drift).
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { themes, core } = await import(resolve(here, '../src/tokens/index.ts'))

const colorVars = (theme) =>
  Object.entries(theme)
    .map(([key, value]) => `  --bk-${key}: ${value};`)
    .join('\n')

const coreVars = Object.entries(core)
  .flatMap(([group, values]) =>
    Object.entries(values).map(([key, value]) => `  --bk-${group}-${key}: ${value};`),
  )
  .join('\n')

const css = `/* GENERADO por scripts/build-tokens.mjs — no editar a mano. */
:root {
${colorVars(themes.dark)}
${coreVars}
}

html.bk-light {
${colorVars(themes.light)}
}
`

const out = resolve(here, '../src/styles/tokens.css')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, css)
console.log(`tokens.css: ${css.split('\n').length} lines`)
```

`frontend/scripts/guard-tokens.sh`:

```bash
#!/usr/bin/env bash
# Rompe el build si aparecen valores crudos fuera de la fuente de tokens:
# el design system solo es real si nadie puede saltárselo en silencio.
set -euo pipefail
cd "$(dirname "$0")/.."

fail=0
check() {
  local pattern="$1" msg="$2"
  local hits
  hits=$(grep -rnE "$pattern" src \
    --include='*.vue' --include='*.ts' --include='*.css' \
    --exclude-dir=tokens --exclude-dir=__tests__ \
    | grep -v 'src/styles/tokens.css' || true)
  if [ -n "$hits" ]; then
    echo "✗ $msg:" >&2
    echo "$hits" >&2
    fail=1
  fi
}

check '#[0-9a-fA-F]{3,8}\b' "hex crudo (usa tokens)"
check 'cubic-bezier\(' "easing crudo (usa var(--bk-ease-*))"
check '\[[0-9]+px\]' "tamaño arbitrario de Tailwind (usa la escala)"

exit $fail
```

Update `frontend/package.json` scripts (`build-tokens.mjs` imports a `.ts` file, so it runs through `vite-node` — add `vite-node: "^3.1.3"` to devDependencies):

```json
  "scripts": {
    "dev": "vite",
    "build": "npm run guard:tokens && vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "build:tokens": "vite-node scripts/build-tokens.mjs",
    "guard:tokens": "bash scripts/guard-tokens.sh"
  }
```

- [ ] **Step 4: Generate, chmod, verify**

```bash
cd frontend
npm install --no-audit --no-fund   # picks up vite-node
chmod +x scripts/guard-tokens.sh
npm run build:tokens
npm run test
npm run build
```

Expected: tokens.css generated; 4 token tests pass; build (guard + typecheck + vite) green — the placeholder `App.vue` has no styles so the guard passes.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: token pipeline with generated css and guard"
```

---

### Task 3: Base styles, Tailwind theme bridge and animation system

**Files:**
- Create: `frontend/src/styles/base.css`
- Create: `frontend/src/styles/animations.css`
- Modify: `frontend/src/main.ts` (font + css imports)
- Test: `frontend/src/styles/__tests__/styles.spec.ts`

**Interfaces:**
- Produces: Tailwind semantic utilities bridged from tokens (`bg-void/stone/slab`, `text-ink/-muted/-faint`, `border-line/-strong`, `text-aurora`, `bg-aurora`, `text-ember`, `font-display/body/mono`, `rounded-xs/sm/md`); global classes `.bk-slab` (carved surface); Vue transition names `bk-fade`, `bk-rise`, `bk-pop`; stagger via inline `--bk-stagger-i`; keyframes `bk-rise`, `bk-fade`, `bk-pop`, `bk-carve`, `bk-shimmer`; ONE `prefers-reduced-motion` guard.

- [ ] **Step 1: Write the failing test**

`frontend/src/styles/__tests__/styles.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (rel: string) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')

describe('animation system', () => {
  const css = read('../animations.css')

  it('has exactly one reduced-motion guard', () => {
    expect(css.match(/prefers-reduced-motion/g)?.length).toBe(1)
  })

  it('animates only transform and opacity', () => {
    // dentro de keyframes solo se permiten transform/opacity/stroke-dashoffset
    const banned = /(width|height|margin|top|left|font-size)\s*:/
    for (const block of css.split('@keyframes').slice(1)) {
      expect(block.split('}')[0]).not.toMatch(banned)
    }
  })

  it('defines the signature carve keyframe and entry transitions', () => {
    expect(css).toContain('@keyframes bk-carve')
    expect(css).toContain('.bk-rise-enter-active')
    expect(css).toContain('.bk-fade-enter-active')
  })

  it('uses token variables, never raw easings', () => {
    expect(css).not.toMatch(/cubic-bezier\(/)
    expect(css).toContain('var(--bk-ease-')
  })
})

describe('base styles', () => {
  const css = read('../base.css')

  it('bridges tokens into tailwind theme', () => {
    expect(css).toContain('@theme inline')
    expect(css).toContain('--color-aurora: var(--bk-accent-aurora)')
    expect(css).toContain('--font-display: var(--bk-font-display)')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm run test`
Expected: FAIL — missing css files.

- [ ] **Step 3: Implement**

`frontend/src/styles/base.css`:

```css
@import 'tailwindcss';
@import './tokens.css';

/* puente tokens → utilidades semánticas de Tailwind: los componentes usan
   bg-stone / text-ink / border-line, nunca colores propios */
@theme inline {
  --color-void: var(--bk-bg-void);
  --color-stone: var(--bk-bg-stone);
  --color-slab: var(--bk-bg-slab);
  --color-line: var(--bk-line);
  --color-line-strong: var(--bk-line-strong);
  --color-ink: var(--bk-ink);
  --color-ink-muted: var(--bk-ink-muted);
  --color-ink-faint: var(--bk-ink-faint);
  --color-aurora: var(--bk-accent-aurora);
  --color-aurora-deep: var(--bk-accent-aurora-deep);
  --color-ember: var(--bk-accent-ember);
  --color-ember-deep: var(--bk-accent-ember-deep);
  --color-danger: var(--bk-danger);
  --font-display: var(--bk-font-display);
  --font-body: var(--bk-font-body);
  --font-mono: var(--bk-font-mono);
  --radius-xs: var(--bk-radius-xs);
  --radius-sm: var(--bk-radius-sm);
  --radius-md: var(--bk-radius-md);
}

html {
  background: var(--bk-bg-void);
  color-scheme: dark;
}

html.bk-light {
  color-scheme: light;
}

body {
  font-family: var(--bk-font-body);
  color: var(--bk-ink);
  background: var(--bk-bg-void);
  min-height: 100dvh;
  -webkit-font-smoothing: antialiased;
}

/* niebla: una sola capa de ruido sutil sobre el vacío, nada más texturizado */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.035;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* losa tallada: borde fino y brillo interior superior, sin sombras blandas */
.bk-slab {
  background: var(--bk-bg-stone);
  border: 1px solid var(--bk-line);
  border-radius: var(--bk-radius-sm);
  box-shadow: inset 0 1px 0 var(--bk-line);
}

:focus-visible {
  outline: 2px solid var(--bk-accent-aurora);
  outline-offset: 2px;
}

::selection {
  background: var(--bk-accent-aurora-deep);
  color: var(--bk-ink);
}

.bk-metric {
  font-family: var(--bk-font-mono);
  font-variant-numeric: tabular-nums;
}
```

`frontend/src/styles/animations.css`:

```css
/* Sistema de animación: solo entradas, solo transform/opacity (y el trazo de
   la runa). Un único guard de reduced-motion cubre todo el sistema. */

@keyframes bk-rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes bk-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes bk-pop {
  0% { opacity: 0; transform: scale(0.85); }
  70% { transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes bk-carve {
  from { stroke-dashoffset: var(--bk-carve-length, 200); opacity: 0.4; }
  to { stroke-dashoffset: 0; opacity: 1; }
}

@keyframes bk-shimmer {
  from { transform: translateX(-100%); }
  to { transform: translateX(100%); }
}

/* transiciones de Vue: <Transition name="bk-rise"> etc. — solo entrada */
.bk-fade-enter-active { animation: bk-fade var(--bk-dur-2) var(--bk-ease-out); }
.bk-rise-enter-active { animation: bk-rise var(--bk-dur-3) var(--bk-ease-out); }
.bk-pop-enter-active { animation: bk-pop var(--bk-dur-3) var(--bk-ease-spring); }

/* stagger: el contenedor asigna --bk-stagger-i por hijo */
.bk-stagger > * {
  animation: bk-rise var(--bk-dur-3) var(--bk-ease-out) backwards;
  animation-delay: calc(var(--bk-stagger-i, 0) * 40ms);
}

.bk-carve-stroke {
  stroke-dasharray: var(--bk-carve-length, 200);
  animation: bk-carve var(--bk-dur-5) var(--bk-ease-carve) backwards;
}

.bk-shimmer {
  position: relative;
  overflow: hidden;
}
.bk-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, var(--bk-line), transparent);
  animation: bk-shimmer var(--bk-dur-5) var(--bk-ease-out) infinite;
}

.bk-press {
  transition: transform var(--bk-dur-1) var(--bk-ease-out);
}
.bk-press:active {
  transform: scale(0.96);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

`frontend/src/main.ts`:

```typescript
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/base.css'
import './styles/animations.css'

import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
```

- [ ] **Step 4: Regenerate tokens (no drift), run tests and build**

```bash
cd frontend
npm run build:tokens && git diff --exit-code src/styles/tokens.css
npm run test
npm run build
```

Expected: tokens.css unchanged; 9 tests pass; build green (guard sees no raw values — the noise data-URI contains no hex colors: `%3Crect` is unfilled black, allowed).

Note for the implementer: the guard's hex pattern WILL match nothing in these files (verify — `#app` selectors and `%23n` URL-encoding are not hex colors but the regex `#[0-9a-fA-F]{3,8}\b` could false-positive on css IDs like `#app` only if followed by 3+ hex chars; `#app` has two hex letters then `p` — safe). If the guard false-positives on anything, fix the PATTERN in guard-tokens.sh (tighten, e.g. require a boundary before `#`), never weaken the rule set — and note it in your report.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: base styles, tailwind token bridge and css animation system"
```

---

### Task 4: Primitives round 1 (BkButton, BkCard, BkField, BkToast + toast store)

**Files:**
- Create: `frontend/src/lib/BkButton.vue`, `frontend/src/lib/BkCard.vue`, `frontend/src/lib/BkField.vue`, `frontend/src/lib/BkToast.vue`
- Create: `frontend/src/stores/toast.ts`
- Test: `frontend/src/lib/__tests__/primitives1.spec.ts`, `frontend/src/stores/__tests__/toast.spec.ts`

**Interfaces:**
- Produces:
  - `BkButton` props `{variant?: 'primary'|'ghost'|'danger'|'ember', size?: 'sm'|'md'|'lg', loading?: boolean, block?: boolean, type?: 'button'|'submit'}`, default slot, native click.
  - `BkCard` props `{title?: string}`, slots default + `header`.
  - `BkField` props `{label: string, modelValue: string, type?: string, error?: string, hint?: string, mono?: boolean, autocomplete?: string}`, emits `update:modelValue`.
  - `useToastStore()` (Pinia): `toasts: {id, kind: 'info'|'error'|'ember', message}[]`, `push(kind, message)` auto-expiring after 4000ms, `dismiss(id)`.
  - `BkToast` — teleported viewport rendering the store; mount once in App.
- All styling via semantic utilities/tokens; buttons use `.bk-press`; toasts enter with `bk-rise`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/stores/__tests__/toast.spec.ts`:

```typescript
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useToastStore } from '../toast'

describe('toast store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('pushes and auto-expires after 4s', () => {
    const store = useToastStore()
    store.push('info', 'hola')
    expect(store.toasts).toHaveLength(1)
    vi.advanceTimersByTime(4100)
    expect(store.toasts).toHaveLength(0)
  })

  it('dismisses manually and keeps others', () => {
    const store = useToastStore()
    store.push('error', 'uno')
    store.push('ember', 'dos')
    store.dismiss(store.toasts[0].id)
    expect(store.toasts.map((t) => t.message)).toEqual(['dos'])
  })
})
```

`frontend/src/lib/__tests__/primitives1.spec.ts`:

```typescript
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BkButton from '../BkButton.vue'
import BkField from '../BkField.vue'

describe('BkButton', () => {
  it('renders slot and emits click', async () => {
    const wrapper = mount(BkButton, { slots: { default: 'Entrar' } })
    expect(wrapper.text()).toBe('Entrar')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
  })

  it('blocks interaction while loading', () => {
    const wrapper = mount(BkButton, { props: { loading: true } })
    expect(wrapper.attributes('disabled')).toBeDefined()
    expect(wrapper.attributes('aria-busy')).toBe('true')
  })
})

describe('BkField', () => {
  it('binds v-model and shows error', async () => {
    const wrapper = mount(BkField, {
      props: { label: 'Usuario', modelValue: '', error: 'errors.invalid_credentials' },
    })
    await wrapper.find('input').setValue('thor')
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['thor'])
    expect(wrapper.text()).toContain('errors.invalid_credentials')
    expect(wrapper.find('input').attributes('aria-invalid')).toBe('true')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL — missing modules.

- [ ] **Step 3: Implement**

`frontend/src/stores/toast.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastKind = 'info' | 'error' | 'ember'

export interface Toast {
  id: number
  kind: ToastKind
  message: string
}

let nextId = 1

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function push(kind: ToastKind, message: string) {
    const id = nextId++
    toasts.value.push({ id, kind, message })
    setTimeout(() => dismiss(id), 4000)
  }

  return { toasts, push, dismiss }
})
```

`frontend/src/lib/BkButton.vue`:

```vue
<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'danger' | 'ember'
    size?: 'sm' | 'md' | 'lg'
    loading?: boolean
    block?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', size: 'md', loading: false, block: false, type: 'button' },
)
</script>

<template>
  <button
    :type="type"
    :disabled="loading || undefined"
    :aria-busy="loading ? 'true' : undefined"
    class="bk-press inline-flex items-center justify-center gap-2 font-display font-semibold uppercase tracking-wide rounded-sm border transition-colors disabled:opacity-50"
    :class="[
      block && 'w-full',
      size === 'sm' && 'px-3 py-1.5 text-sm',
      size === 'md' && 'px-5 py-2.5',
      size === 'lg' && 'px-6 py-3.5 text-lg',
      variant === 'primary' && 'bg-aurora-deep border-aurora text-ink hover:bg-aurora hover:text-void',
      variant === 'ghost' && 'bg-transparent border-line text-ink-muted hover:border-line-strong hover:text-ink',
      variant === 'danger' && 'bg-transparent border-danger text-danger hover:bg-danger hover:text-void',
      variant === 'ember' && 'bg-ember-deep border-ember text-void hover:bg-ember',
    ]"
  >
    <span v-if="loading" class="bk-shimmer inline-block w-4 h-4 rounded-full border-2 border-line-strong" aria-hidden="true" />
    <slot />
  </button>
</template>
```

`frontend/src/lib/BkCard.vue`:

```vue
<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <section class="bk-slab p-4">
    <header v-if="title || $slots.header" class="mb-3 flex items-center justify-between">
      <h2 v-if="title" class="font-display font-semibold text-ink uppercase tracking-wider text-sm">
        {{ title }}
      </h2>
      <slot name="header" />
    </header>
    <slot />
  </section>
</template>
```

`frontend/src/lib/BkField.vue`:

```vue
<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string
    modelValue: string
    type?: string
    error?: string
    hint?: string
    mono?: boolean
    autocomplete?: string
  }>(),
  { type: 'text' },
)
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="block">
    <span class="block mb-1 text-sm text-ink-muted">{{ label }}</span>
    <input
      :value="modelValue"
      :type="type"
      :autocomplete="autocomplete"
      :aria-invalid="error ? 'true' : undefined"
      class="w-full rounded-sm border bg-stone px-3 py-2.5 text-ink placeholder:text-ink-faint focus:border-aurora"
      :class="[error ? 'border-danger' : 'border-line', mono && 'bk-metric']"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <span v-if="error" class="block mt-1 text-sm text-danger">{{ error }}</span>
    <span v-else-if="hint" class="block mt-1 text-sm text-ink-faint">{{ hint }}</span>
  </label>
</template>
```

`frontend/src/lib/BkToast.vue`:

```vue
<script setup lang="ts">
import { useToastStore } from '@/stores/toast'

const store = useToastStore()
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-x-0 bottom-20 z-(--bk-z-toast) flex flex-col items-center gap-2 px-4 pointer-events-none">
      <TransitionGroup name="bk-rise">
        <output
          v-for="toast in store.toasts"
          :key="toast.id"
          class="bk-slab pointer-events-auto px-4 py-2.5 text-sm max-w-md w-fit"
          :class="{
            'border-danger text-danger': toast.kind === 'error',
            'border-ember text-ember': toast.kind === 'ember',
          }"
          @click="store.dismiss(toast.id)"
        >
          {{ toast.message }}
        </output>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 4: Run tests, build**

Run: `cd frontend && npm run test && npm run build`
Expected: all tests pass; guard+typecheck+build green.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: core primitives (button, card, field, toast)"
```

---

### Task 5: Primitives round 2 (BkSheet, BkStepper, BkRing, BkRune, BkEmpty)

**Files:**
- Create: `frontend/src/lib/BkSheet.vue`, `frontend/src/lib/BkStepper.vue`, `frontend/src/lib/BkRing.vue`, `frontend/src/lib/BkRune.vue`, `frontend/src/lib/BkEmpty.vue`
- Create: `frontend/src/lib/runes.ts`
- Test: `frontend/src/lib/__tests__/primitives2.spec.ts`

**Interfaces:**
- Produces:
  - `RUNES: Record<RuneName, string>` in `runes.ts` — SVG path data on a 32×32 grid for: `berserk` (logo), the 7 muscle groups (`chest,back,biceps,triceps,shoulders,legs,core`), `streak`, `pr`. Type `RuneName` exported.
  - `BkRune` props `{name: RuneName, size?: number, carve?: boolean, tone?: 'ink'|'aurora'|'ember'}` — renders the path with `stroke="currentColor"`, `fill="none"`, and when `carve` applies `.bk-carve-stroke` with `--bk-carve-length` set from the path's `getTotalLength()` fallback 200.
  - `BkStepper` props `{modelValue: number, step?: number, min?: number, max?: number, suffix?: string}`, emits `update:modelValue`; large touch targets; hold-to-repeat.
  - `BkRing` props `{value: number (0..1), size?: number, stroke?: number}` — SVG progress ring using currentColor; exposes computed dashoffset.
  - `BkSheet` props `{open: boolean, title?: string}`, emits `close`; teleported backdrop (bk-fade) + bottom panel (bk-rise), Escape closes, safe-area padded.
  - `BkEmpty` props `{rune?: RuneName, message: string}` + action slot.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/__tests__/primitives2.spec.ts`:

```typescript
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import BkRing from '../BkRing.vue'
import BkRune from '../BkRune.vue'
import BkStepper from '../BkStepper.vue'
import { RUNES } from '../runes'

describe('runes catalog', () => {
  it('has the logo, the 7 muscle groups and the achievement runes', () => {
    expect(Object.keys(RUNES).sort()).toEqual(
      ['back', 'berserk', 'biceps', 'chest', 'core', 'legs', 'pr', 'shoulders', 'streak'].sort(),
    )
    for (const d of Object.values(RUNES)) {
      expect(d).toMatch(/^M[\d\s.]/) // path data válido que empieza con moveto
    }
  })
})

describe('BkRune', () => {
  it('renders the named path with carve animation class', () => {
    const wrapper = mount(BkRune, { props: { name: 'chest', carve: true } })
    expect(wrapper.find('path').attributes('d')).toBe(RUNES.chest)
    expect(wrapper.find('path').classes()).toContain('bk-carve-stroke')
  })
})

describe('BkStepper', () => {
  it('increments and clamps to bounds', async () => {
    const wrapper = mount(BkStepper, {
      props: { modelValue: 99, step: 1, max: 100, min: 0 },
    })
    const [minus, plus] = wrapper.findAll('button')
    await plus.trigger('pointerdown')
    await plus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([100])
    await wrapper.setProps({ modelValue: 100 })
    await plus.trigger('pointerdown')
    await plus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([100]) // clamped
    await minus.trigger('pointerdown')
    await minus.trigger('pointerup')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([99])
  })
})

describe('BkRing', () => {
  it('computes dashoffset from value', () => {
    const wrapper = mount(BkRing, { props: { value: 0.25, size: 48, stroke: 4 } })
    const circle = wrapper.findAll('circle')[1]
    const radius = (48 - 4) / 2
    const circumference = 2 * Math.PI * radius
    expect(Number(circle.attributes('stroke-dashoffset'))).toBeCloseTo(circumference * 0.75, 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL — missing modules.

- [ ] **Step 3: Implement**

`frontend/src/lib/runes.ts`:

```typescript
// Runas geométricas propias sobre rejilla 32×32 (marcas de la casa, no
// futhark canónico): trazos rectos para que el "tallado" (dashoffset) luzca.
export const RUNES = {
  berserk: 'M16 3 L16 29 M16 8 L26 14 M16 8 L6 14 M16 20 L26 26 M16 20 L6 26',
  chest: 'M10 4 L10 28 M10 6 L24 14 M10 22 L24 14',
  back: 'M22 4 L22 28 M22 6 L8 14 M22 22 L8 14',
  biceps: 'M12 28 L12 4 L24 12 L12 18',
  triceps: 'M20 28 L20 4 L8 12 L20 18',
  shoulders: 'M6 28 L16 4 L26 28 M11 16 L21 16',
  legs: 'M16 4 L16 28 M16 16 L7 28 M16 16 L25 28',
  core: 'M16 4 L26 16 L16 28 L6 16 Z',
  streak: 'M18 3 L10 17 L16 17 L14 29 L23 13 L17 13 Z',
  pr: 'M16 4 L16 22 M8 10 L16 4 L24 10 M10 28 L22 28',
} as const

export type RuneName = keyof typeof RUNES
```

`frontend/src/lib/BkRune.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { RUNES, type RuneName } from './runes'

const props = withDefaults(
  defineProps<{ name: RuneName; size?: number; carve?: boolean; tone?: 'ink' | 'aurora' | 'ember' }>(),
  { size: 32, carve: false, tone: 'ink' },
)

const path = ref<SVGPathElement | null>(null)
const carveLength = ref(200)

onMounted(() => {
  // longitud real del trazo para que el tallado dure lo mismo en toda runa
  if (props.carve && path.value?.getTotalLength) {
    carveLength.value = Math.ceil(path.value.getTotalLength())
  }
})
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    aria-hidden="true"
    :class="{ 'text-aurora': tone === 'aurora', 'text-ember': tone === 'ember' }"
  >
    <path
      ref="path"
      :d="RUNES[name]"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="square"
      :class="carve && 'bk-carve-stroke'"
      :style="carve ? { '--bk-carve-length': String(carveLength) } : undefined"
    />
  </svg>
</template>
```

`frontend/src/lib/BkStepper.vue`:

```vue
<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

const props = withDefaults(
  defineProps<{ modelValue: number; step?: number; min?: number; max?: number; suffix?: string }>(),
  { step: 1, min: 0, max: 999 },
)
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

let timer: ReturnType<typeof setInterval> | null = null
let current = 0

function apply(direction: 1 | -1) {
  current = Math.min(props.max, Math.max(props.min, current + direction * props.step))
  emit('update:modelValue', Number(current.toFixed(2)))
}

function press(direction: 1 | -1) {
  current = props.modelValue
  apply(direction)
  // mantener pulsado repite: en el gym se suben 20 kg sin veinte taps
  timer = setInterval(() => apply(direction), 140)
}

function release() {
  if (timer) clearInterval(timer)
  timer = null
}

onBeforeUnmount(release)
</script>

<template>
  <div class="flex items-center gap-3">
    <button
      type="button"
      class="bk-press bk-slab w-12 h-12 text-xl text-ink-muted hover:text-ink"
      aria-label="-"
      @pointerdown="press(-1)"
      @pointerup="release"
      @pointerleave="release"
    >
      −
    </button>
    <span class="bk-metric text-2xl text-ink min-w-16 text-center">
      {{ modelValue }}<span v-if="suffix" class="text-sm text-ink-faint ml-1">{{ suffix }}</span>
    </span>
    <button
      type="button"
      class="bk-press bk-slab w-12 h-12 text-xl text-aurora"
      aria-label="+"
      @pointerdown="press(1)"
      @pointerup="release"
      @pointerleave="release"
    >
      +
    </button>
  </div>
</template>
```

`frontend/src/lib/BkRing.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ value: number; size?: number; stroke?: number }>(),
  { size: 48, stroke: 4 },
)

const radius = computed(() => (props.size - props.stroke) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
const offset = computed(() => circumference.value * (1 - Math.min(1, Math.max(0, props.value))))
</script>

<template>
  <svg :width="size" :height="size" :viewBox="`0 0 ${size} ${size}`" fill="none" aria-hidden="true">
    <circle
      :cx="size / 2" :cy="size / 2" :r="radius"
      stroke="var(--bk-line)" :stroke-width="stroke"
    />
    <circle
      :cx="size / 2" :cy="size / 2" :r="radius"
      stroke="currentColor" :stroke-width="stroke" stroke-linecap="round"
      :stroke-dasharray="circumference" :stroke-dashoffset="offset"
      :transform="`rotate(-90 ${size / 2} ${size / 2})`"
      style="transition: stroke-dashoffset var(--bk-dur-2) var(--bk-ease-out)"
    />
  </svg>
</template>
```

`frontend/src/lib/BkSheet.vue`:

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'

defineProps<{ open: boolean; title?: string }>()
const emit = defineEmits<{ close: [] }>()

function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="bk-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-(--bk-z-sheet) bg-void/70"
        @click="emit('close')"
      />
    </Transition>
    <Transition name="bk-rise">
      <div
        v-if="open"
        role="dialog"
        aria-modal="true"
        class="fixed inset-x-0 bottom-0 z-(--bk-z-sheet) bk-slab rounded-t-md border-b-0 p-4 pb-[env(safe-area-inset-bottom)] max-h-[85dvh] overflow-y-auto"
      >
        <div class="mx-auto mb-3 h-1 w-10 rounded-xs bg-line-strong" aria-hidden="true" />
        <h2 v-if="title" class="font-display font-semibold uppercase tracking-wider text-sm mb-3">
          {{ title }}
        </h2>
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>
```

`frontend/src/lib/BkEmpty.vue`:

```vue
<script setup lang="ts">
import BkRune from './BkRune.vue'
import type { RuneName } from './runes'

withDefaults(defineProps<{ rune?: RuneName; message: string }>(), { rune: 'berserk' })
</script>

<template>
  <div class="flex flex-col items-center gap-4 py-10 text-center">
    <BkRune :name="rune" :size="48" carve class="text-ink-faint" />
    <p class="text-ink-muted max-w-xs">{{ message }}</p>
    <slot />
  </div>
</template>
```

Note: `pb-[env(safe-area-inset-bottom)]` is an arbitrary value but NOT a px literal, so the guard's `\[[0-9]+px\]` pattern allows it — that is intentional.

- [ ] **Step 4: Run tests, build**

Run: `cd frontend && npm run test && npm run build`
Expected: all tests pass; build green.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: gym primitives (sheet, stepper, ring, rune, empty)"
```

---

### Task 6: i18n (ES/EN) and units utility

**Files:**
- Create: `frontend/src/i18n/index.ts`, `frontend/src/i18n/es.ts`, `frontend/src/i18n/en.ts`
- Create: `frontend/src/utils/units.ts`
- Create: `frontend/src/composables/useLocale.ts`
- Test: `frontend/src/utils/__tests__/units.spec.ts`, `frontend/src/i18n/__tests__/messages.spec.ts`

**Interfaces:**
- Produces: `createI18nInstance(locale: 'es'|'en')` returning a vue-i18n instance (`legacy: false`); message trees with identical key structure in both languages covering: `app.*` (name, nav labels hoy/calendario/entreno/progresion/perfil), `auth.*` (login/bootstrap copy, fields, actions), `errors.*` (every backend slug shipped so far: `not_authenticated, invalid_credentials, wrong_password, admin_only, already_bootstrapped, username_taken, invite_invalid, user_not_found, cannot_share_self, already_shared, grant_not_found, not_found, timezone_invalid, password_too_long, generic`), `common.*` (save/cancel/delete/close/loading/retry).
- `utils/units.ts`: `kgToDisplay(kg: number, units: 'kg'|'lb') -> number` (lb = kg × 2.20462, rounded to 1 decimal), `displayToKg(value, units)` (inverse, 2 decimals), `formatWeight(kg, units) -> string` ("102.5 kg" / "226 lb").
- `useLocale()`: `{ locale, setLocale(l) }` — updates the i18n instance and persists via `PATCH /users/me` when authenticated (fire-and-forget; falls back silently offline). NOTE: depends on the API client from Task 7 — to keep this task self-contained, `useLocale` accepts an injectable `persist` callback with default no-op; Task 7 wires the real one.

- [ ] **Step 1: Write the failing tests**

`frontend/src/utils/__tests__/units.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { displayToKg, formatWeight, kgToDisplay } from '../units'

describe('units', () => {
  it('kg passthrough', () => {
    expect(kgToDisplay(102.5, 'kg')).toBe(102.5)
    expect(formatWeight(102.5, 'kg')).toBe('102.5 kg')
  })

  it('lb conversion round-trips within tolerance', () => {
    expect(kgToDisplay(100, 'lb')).toBe(220.5)
    expect(displayToKg(220.5, 'lb')).toBeCloseTo(100, 1)
    expect(formatWeight(100, 'lb')).toBe('220.5 lb')
  })
})
```

`frontend/src/i18n/__tests__/messages.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest'

import { en } from '../en'
import { es } from '../es'

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

describe('i18n messages', () => {
  it('es and en share the exact same key tree', () => {
    expect(flatten(es).sort()).toEqual(flatten(en).sort())
  })

  it('covers every backend error slug plus generic fallback', () => {
    const keys = flatten(es)
    for (const slug of [
      'not_authenticated', 'invalid_credentials', 'wrong_password', 'admin_only',
      'already_bootstrapped', 'username_taken', 'invite_invalid', 'user_not_found',
      'cannot_share_self', 'already_shared', 'grant_not_found', 'not_found',
      'timezone_invalid', 'password_too_long', 'generic',
    ]) {
      expect(keys).toContain(`errors.${slug}`)
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL — missing modules.

- [ ] **Step 3: Implement**

`frontend/src/utils/units.ts`:

```typescript
// El backend siempre habla en kg; lb existe solo en la capa de presentación.
const LB_PER_KG = 2.20462

export function kgToDisplay(kg: number, units: 'kg' | 'lb'): number {
  return units === 'kg' ? kg : Math.round(kg * LB_PER_KG * 10) / 10
}

export function displayToKg(value: number, units: 'kg' | 'lb'): number {
  return units === 'kg' ? value : Math.round((value / LB_PER_KG) * 100) / 100
}

export function formatWeight(kg: number, units: 'kg' | 'lb'): string {
  return `${kgToDisplay(kg, units)} ${units}`
}
```

`frontend/src/i18n/es.ts`:

```typescript
export const es = {
  app: {
    name: 'berserk',
    nav: { today: 'Hoy', calendar: 'Calendario', workout: 'Entreno', progress: 'Progresión', profile: 'Perfil' },
    placeholder: 'Próximamente',
  },
  auth: {
    loginTitle: 'Entra al clan',
    username: 'Usuario',
    password: 'Contraseña',
    login: 'Entrar',
    bootstrapTitle: 'Forja tu cuenta',
    bootstrapHint: 'Primera cuenta de la instancia: será la administradora.',
    create: 'Crear cuenta',
  },
  errors: {
    not_authenticated: 'Tu sesión ha caducado. Entra de nuevo.',
    invalid_credentials: 'Usuario o contraseña incorrectos.',
    wrong_password: 'La contraseña actual no es correcta.',
    admin_only: 'Solo el administrador puede hacer esto.',
    already_bootstrapped: 'Esta instancia ya tiene cuentas.',
    username_taken: 'Ese usuario ya existe.',
    invite_invalid: 'La invitación no es válida o ya se usó.',
    user_not_found: 'No existe ese usuario.',
    cannot_share_self: 'No puedes compartir contigo.',
    already_shared: 'Ya compartes con ese usuario.',
    grant_not_found: 'Ese permiso no existe.',
    not_found: 'No encontrado.',
    timezone_invalid: 'Zona horaria no válida.',
    password_too_long: 'La contraseña es demasiado larga (máx. 72 bytes).',
    generic: 'Algo ha fallado. Inténtalo de nuevo.',
  },
  common: { save: 'Guardar', cancel: 'Cancelar', delete: 'Borrar', close: 'Cerrar', loading: 'Cargando…', retry: 'Reintentar' },
} as const
```

`frontend/src/i18n/en.ts`:

```typescript
export const en = {
  app: {
    name: 'berserk',
    nav: { today: 'Today', calendar: 'Calendar', workout: 'Workout', progress: 'Progress', profile: 'Profile' },
    placeholder: 'Coming soon',
  },
  auth: {
    loginTitle: 'Enter the clan',
    username: 'Username',
    password: 'Password',
    login: 'Sign in',
    bootstrapTitle: 'Forge your account',
    bootstrapHint: 'First account of this instance: it will be the admin.',
    create: 'Create account',
  },
  errors: {
    not_authenticated: 'Your session expired. Sign in again.',
    invalid_credentials: 'Wrong username or password.',
    wrong_password: 'Current password is incorrect.',
    admin_only: 'Only the admin can do this.',
    already_bootstrapped: 'This instance already has accounts.',
    username_taken: 'That username is taken.',
    invite_invalid: 'Invite is invalid or already used.',
    user_not_found: 'No such user.',
    cannot_share_self: 'You cannot share with yourself.',
    already_shared: 'Already sharing with that user.',
    grant_not_found: 'That grant does not exist.',
    not_found: 'Not found.',
    timezone_invalid: 'Invalid timezone.',
    password_too_long: 'Password is too long (max 72 bytes).',
    generic: 'Something went wrong. Try again.',
  },
  common: { save: 'Save', cancel: 'Cancel', delete: 'Delete', close: 'Close', loading: 'Loading…', retry: 'Retry' },
} as const
```

`frontend/src/i18n/index.ts`:

```typescript
import { createI18n } from 'vue-i18n'

import { en } from './en'
import { es } from './es'

export type Locale = 'es' | 'en'

export function createI18nInstance(locale: Locale = 'es') {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'es',
    messages: { es, en },
  })
}
```

`frontend/src/composables/useLocale.ts`:

```typescript
import { useI18n } from 'vue-i18n'

import type { Locale } from '@/i18n'

// persist es inyectable: la Task 7 conecta el PATCH /users/me real; los tests
// y el arranque sin sesión usan el no-op
export function useLocale(persist: (locale: Locale) => void = () => {}) {
  const { locale } = useI18n()

  function setLocale(next: Locale) {
    locale.value = next
    document.documentElement.lang = next
    persist(next)
  }

  return { locale, setLocale }
}
```

- [ ] **Step 4: Run tests, build**

Run: `cd frontend && npm run test && npm run build`
Expected: tests pass; build green.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: i18n es/en and units utility"
```

---

### Task 7: API client, auth store, router and real screens (login/bootstrap/shell)

**Files:**
- Create: `frontend/src/api/client.ts`, `frontend/src/api/auth.ts`
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/router/index.ts`
- Create: `frontend/src/views/LoginView.vue`, `frontend/src/views/BootstrapView.vue`, `frontend/src/views/ShellView.vue`, `frontend/src/views/PlaceholderView.vue`
- Modify: `frontend/src/App.vue`, `frontend/src/main.ts` (wire pinia/router/i18n/toast)
- Test: `frontend/src/api/__tests__/client.spec.ts`, `frontend/src/stores/__tests__/auth.spec.ts`

**Interfaces:**
- Produces:
  - `api<T>(path, options?) -> Promise<T>` in `client.ts`: same-origin fetch with `credentials: 'same-origin'`, JSON in/out; on non-2xx throws `ApiError {status, slug}` where slug comes from `detail` when it is a string, else `'generic'`; 204 → undefined. `ApiError` class exported.
  - `api/auth.ts`: `getStatus() -> {bootstrapped}`, `login(username, password) -> UserOut`, `bootstrap(...)`, `logout()`, `me() -> UserOut`, `updateSettings(partial) -> UserOut`. `UserOut` TS interface `{id, username, is_admin, locale, units, timezone}`.
  - `useAuthStore()`: state `{user: UserOut | null, ready: boolean}`; actions `init()` (status→me flow, sets `bootstrapped`), `login`, `bootstrapAccount`, `logout`; getter `isAuthenticated`. On any `ApiError` with status 401 during `me()` the store just leaves `user` null (no toast).
  - Router: routes `/login`, `/bootstrap`, and `/` (ShellView) with children `today|calendar|workout|progress|profile` all rendering `PlaceholderView` (Phase 4 replaces them); global guard: wait for `auth.init()` once; unauthenticated → `/login` (or `/bootstrap` when not bootstrapped); authenticated visiting login/bootstrap → `/`.
  - ShellView: top identity bar (BkRune `berserk` + wordmark) and bottom nav — 5 `RouterLink`s with rune-ish icons (use BkRune names: today→`streak`, calendar→`core`, workout→`berserk` center CTA raised slab, progress→`pr`, profile→`shoulders`), aurora active state, safe-area padding, desktop ≥sm: top bar nav.
  - Views use i18n exclusively (no literal copy) and Bk* primitives; the toast store surfaces `ApiError` slugs via `errors.<slug>`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/api/__tests__/client.spec.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from '../client'

function mockFetch(status: number, body?: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    body === undefined ? null : JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } },
  )))
}

afterEach(() => vi.unstubAllGlobals())

describe('api client', () => {
  it('returns parsed json on 200', async () => {
    mockFetch(200, { ok: true })
    await expect(api('/health')).resolves.toEqual({ ok: true })
  })

  it('returns undefined on 204', async () => {
    mockFetch(204)
    await expect(api('/auth/logout', { method: 'POST' })).resolves.toBeUndefined()
  })

  it('throws ApiError with slug from string detail', async () => {
    mockFetch(401, { detail: 'invalid_credentials' })
    const error = await api('/auth/login', { method: 'POST', body: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(401)
    expect(error.slug).toBe('invalid_credentials')
  })

  it('falls back to generic slug on non-string detail (422 pydantic)', async () => {
    mockFetch(422, { detail: [{ msg: 'password_too_long' }] })
    const error = await api('/auth/bootstrap', { method: 'POST', body: {} }).catch((e) => e)
    expect(error.slug).toBe('generic')
  })
})
```

`frontend/src/stores/__tests__/auth.spec.ts`:

```typescript
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/auth', () => ({
  getStatus: vi.fn(),
  me: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  bootstrap: vi.fn(),
  updateSettings: vi.fn(),
}))

import * as authApi from '@/api/auth'
import { ApiError } from '@/api/client'
import { useAuthStore } from '../auth'

const user = { id: 1, username: 'thor', is_admin: true, locale: 'es', units: 'kg', timezone: 'Europe/Madrid' }

describe('auth store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('init resolves session when cookie is valid', async () => {
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockResolvedValue(user)
    const store = useAuthStore()
    await store.init()
    expect(store.ready).toBe(true)
    expect(store.isAuthenticated).toBe(true)
    expect(store.user?.username).toBe('thor')
  })

  it('init leaves user null on 401 without throwing', async () => {
    vi.mocked(authApi.getStatus).mockResolvedValue({ bootstrapped: true })
    vi.mocked(authApi.me).mockRejectedValue(new ApiError(401, 'not_authenticated'))
    const store = useAuthStore()
    await store.init()
    expect(store.ready).toBe(true)
    expect(store.isAuthenticated).toBe(false)
  })

  it('login sets the user', async () => {
    vi.mocked(authApi.login).mockResolvedValue(user)
    const store = useAuthStore()
    await store.login('thor', 'secret123')
    expect(store.isAuthenticated).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npm run test`
Expected: FAIL — missing modules.

- [ ] **Step 3: Implement**

`frontend/src/api/client.ts`:

```typescript
export class ApiError extends Error {
  constructor(
    public status: number,
    public slug: string,
  ) {
    super(slug)
  }
}

const BASE = '/api/v1'

// los 422 de pydantic traen detail como lista de objetos: para el usuario son
// un fallo de validación genérico, los slugs útiles siempre son string
function toSlug(detail: unknown): string {
  return typeof detail === 'string' ? detail : 'generic'
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new ApiError(response.status, toSlug((payload as { detail?: unknown }).detail))
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
```

`frontend/src/api/auth.ts`:

```typescript
import { api } from './client'

export interface UserOut {
  id: number
  username: string
  is_admin: boolean
  locale: string
  units: string
  timezone: string
}

export const getStatus = () => api<{ bootstrapped: boolean }>('/auth/status')
export const login = (username: string, password: string) =>
  api<UserOut>('/auth/login', { method: 'POST', body: { username, password } })
export const bootstrap = (username: string, password: string) =>
  api<UserOut>('/auth/bootstrap', { method: 'POST', body: { username, password } })
export const logout = () => api<void>('/auth/logout', { method: 'POST' })
export const me = () => api<UserOut>('/auth/me')
export const updateSettings = (partial: Partial<Pick<UserOut, 'locale' | 'units' | 'timezone'>>) =>
  api<UserOut>('/users/me', { method: 'PATCH', body: partial })
```

`frontend/src/stores/auth.ts`:

```typescript
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import * as authApi from '@/api/auth'
import type { UserOut } from '@/api/auth'
import { ApiError } from '@/api/client'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<UserOut | null>(null)
  const bootstrapped = ref(true)
  const ready = ref(false)

  const isAuthenticated = computed(() => user.value !== null)

  async function init() {
    if (ready.value) return
    try {
      bootstrapped.value = (await authApi.getStatus()).bootstrapped
      if (bootstrapped.value) {
        user.value = await authApi.me()
      }
    } catch (error) {
      // sin sesión no hay usuario: el guard redirige a login sin ruido
      if (!(error instanceof ApiError && error.status === 401)) throw error
    } finally {
      ready.value = true
    }
  }

  async function login(username: string, password: string) {
    user.value = await authApi.login(username, password)
  }

  async function bootstrapAccount(username: string, password: string) {
    user.value = await authApi.bootstrap(username, password)
    bootstrapped.value = true
  }

  async function logout() {
    await authApi.logout()
    user.value = null
  }

  return { user, bootstrapped, ready, isAuthenticated, init, login, bootstrapAccount, logout }
})
```

`frontend/src/router/index.ts`:

```typescript
import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '@/stores/auth'
import BootstrapView from '@/views/BootstrapView.vue'
import LoginView from '@/views/LoginView.vue'
import PlaceholderView from '@/views/PlaceholderView.vue'
import ShellView from '@/views/ShellView.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/bootstrap', name: 'bootstrap', component: BootstrapView },
    {
      path: '/',
      component: ShellView,
      redirect: { name: 'today' },
      children: [
        { path: 'today', name: 'today', component: PlaceholderView },
        { path: 'calendar', name: 'calendar', component: PlaceholderView },
        { path: 'workout', name: 'workout', component: PlaceholderView },
        { path: 'progress', name: 'progress', component: PlaceholderView },
        { path: 'profile', name: 'profile', component: PlaceholderView },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.init()
  const isPublic = to.name === 'login' || to.name === 'bootstrap'
  if (!auth.bootstrapped && to.name !== 'bootstrap') return { name: 'bootstrap' }
  if (auth.bootstrapped && to.name === 'bootstrap') return auth.isAuthenticated ? { name: 'today' } : { name: 'login' }
  if (!auth.isAuthenticated && !isPublic) return { name: 'login' }
  if (auth.isAuthenticated && isPublic) return { name: 'today' }
})
```

`frontend/src/views/LoginView.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value, password.value)
    router.push({ name: 'today' })
  } catch (e) {
    error.value = e instanceof ApiError ? `errors.${e.slug}` : 'errors.generic'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-dvh flex flex-col items-center justify-center gap-8 px-6">
    <Transition name="bk-pop" appear>
      <div class="flex flex-col items-center gap-3">
        <BkRune name="berserk" :size="64" carve tone="aurora" />
        <h1 class="font-display font-bold text-3xl tracking-widest uppercase">
          {{ $t('app.name') }}
        </h1>
      </div>
    </Transition>
    <Transition name="bk-rise" appear>
      <form class="bk-slab w-full max-w-sm p-6 flex flex-col gap-4" @submit.prevent="submit">
        <h2 class="font-display font-semibold uppercase tracking-wider text-sm text-ink-muted">
          {{ $t('auth.loginTitle') }}
        </h2>
        <BkField v-model="username" :label="$t('auth.username')" autocomplete="username" />
        <BkField
          v-model="password"
          :label="$t('auth.password')"
          type="password"
          autocomplete="current-password"
          :error="error ? $t(error) : undefined"
        />
        <BkButton type="submit" :loading="loading" block>{{ $t('auth.login') }}</BkButton>
      </form>
    </Transition>
  </main>
</template>
```

`frontend/src/views/BootstrapView.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

import { ApiError } from '@/api/client'
import BkButton from '@/lib/BkButton.vue'
import BkField from '@/lib/BkField.vue'
import BkRune from '@/lib/BkRune.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.bootstrapAccount(username.value, password.value)
    router.push({ name: 'today' })
  } catch (e) {
    error.value = e instanceof ApiError ? `errors.${e.slug}` : 'errors.generic'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <main class="min-h-dvh flex flex-col items-center justify-center gap-8 px-6">
    <Transition name="bk-pop" appear>
      <BkRune name="berserk" :size="64" carve tone="ember" />
    </Transition>
    <Transition name="bk-rise" appear>
      <form class="bk-slab w-full max-w-sm p-6 flex flex-col gap-4" @submit.prevent="submit">
        <div>
          <h2 class="font-display font-semibold uppercase tracking-wider text-sm">
            {{ $t('auth.bootstrapTitle') }}
          </h2>
          <p class="text-sm text-ink-faint mt-1">{{ $t('auth.bootstrapHint') }}</p>
        </div>
        <BkField v-model="username" :label="$t('auth.username')" autocomplete="username" />
        <BkField
          v-model="password"
          :label="$t('auth.password')"
          type="password"
          autocomplete="new-password"
          :error="error ? $t(error) : undefined"
        />
        <BkButton type="submit" variant="ember" :loading="loading" block>
          {{ $t('auth.create') }}
        </BkButton>
      </form>
    </Transition>
  </main>
</template>
```

`frontend/src/views/ShellView.vue`:

```vue
<script setup lang="ts">
import BkRune from '@/lib/BkRune.vue'
import type { RuneName } from '@/lib/runes'

const items: { name: string; label: string; rune: RuneName }[] = [
  { name: 'today', label: 'app.nav.today', rune: 'streak' },
  { name: 'calendar', label: 'app.nav.calendar', rune: 'core' },
  { name: 'workout', label: 'app.nav.workout', rune: 'berserk' },
  { name: 'progress', label: 'app.nav.progress', rune: 'pr' },
  { name: 'profile', label: 'app.nav.profile', rune: 'shoulders' },
]
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <header class="flex items-center gap-2 px-4 py-3 border-b border-line sm:justify-center">
      <BkRune name="berserk" :size="20" tone="aurora" />
      <span class="font-display font-bold tracking-widest uppercase text-sm">
        {{ $t('app.name') }}
      </span>
    </header>
    <main class="flex-1 px-4 py-4 pb-24 sm:pb-4 max-w-3xl w-full mx-auto">
      <RouterView v-slot="{ Component }">
        <Transition name="bk-rise" mode="out-in">
          <component :is="Component" />
        </Transition>
      </RouterView>
    </main>
    <nav
      class="fixed inset-x-0 bottom-0 z-(--bk-z-nav) border-t border-line bg-stone pb-[env(safe-area-inset-bottom)] sm:static sm:border-t-0 sm:bg-transparent sm:pb-0 sm:order-first sm:hidden"
      :aria-label="$t('app.name')"
    >
      <ul class="flex justify-around max-w-3xl mx-auto">
        <li v-for="item in items" :key="item.name" class="flex-1">
          <RouterLink
            :to="{ name: item.name }"
            class="flex flex-col items-center gap-1 py-2 text-ink-faint"
            active-class="text-aurora"
          >
            <span
              :class="item.name === 'workout' && 'bk-slab -mt-5 p-2.5 border-aurora text-aurora'"
            >
              <BkRune :name="item.rune" :size="item.name === 'workout' ? 26 : 20" />
            </span>
            <span class="text-[0.65rem] uppercase tracking-wide">{{ $t(item.label) }}</span>
          </RouterLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
```

Note: `text-[0.65rem]` is rem-based (allowed by the guard — only `px` literals are banned). The `sm:hidden` on the bottom nav is intentional for this phase: desktop nav becomes a proper top nav in Phase 4; for now desktop uses the same routes via URL, and the mobile-first bar is the deliverable.

`frontend/src/views/PlaceholderView.vue`:

```vue
<script setup lang="ts">
import BkEmpty from '@/lib/BkEmpty.vue'
</script>

<template>
  <BkEmpty :message="$t('app.placeholder')" />
</template>
```

`frontend/src/App.vue`:

```vue
<script setup lang="ts">
import BkToast from '@/lib/BkToast.vue'
</script>

<template>
  <RouterView />
  <BkToast />
</template>
```

`frontend/src/main.ts` (final form):

```typescript
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource-variable/inter'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/600.css'
import './styles/base.css'
import './styles/animations.css'

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import { createI18nInstance } from './i18n'
import { router } from './router'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(createI18nInstance())
app.mount('#app')
```

- [ ] **Step 4: Run tests, build, and boot against the backend**

```bash
cd frontend
npm run test
npm run build
```

Expected: all tests pass; build green. If a dev backend is reachable on :8000, `npm run dev` should show the login screen (or bootstrap on a fresh DB) with the carved rune entry animation — capture any console error in the report.

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: api client, auth store, router and login/bootstrap/shell screens"
```

---

### Task 8: PWA (manifest, icons, shell precache)

**Files:**
- Create: `frontend/public/icons/berserk.svg` (source icon), `frontend/public/icons/pwa-192.png`, `frontend/public/icons/pwa-512.png`, `frontend/public/icons/maskable-512.png`
- Modify: `frontend/vite.config.ts` (vite-plugin-pwa), `frontend/index.html` (manifest link handled by plugin — verify)
- Test: `frontend/src/__tests__/pwa.spec.ts` (config assertions)

**Interfaces:**
- Produces: installable PWA — standalone display, `#0A0C0F` theme/background, app name "berserk", rune icon; `registerType: 'autoUpdate'`; precache limited to the app shell (default globPatterns for js/css/html/fonts — NO runtime caching of `/api/**`: the app is online-only by design).

- [ ] **Step 1: Create the icon assets**

`frontend/public/icons/berserk.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0A0C0F"/>
  <path d="M256 64 L256 448 M256 136 L400 232 M256 136 L112 232 M256 312 L400 408 M256 312 L112 408"
        stroke="#4FD8C4" stroke-width="36" stroke-linecap="square" fill="none"/>
</svg>
```

Generate the PNGs from the SVG (no new npm deps — use a one-off npx):

```bash
cd frontend
npx --yes sharp-cli@5 -i public/icons/berserk.svg -o public/icons/pwa-192.png resize 192 192
npx --yes sharp-cli@5 -i public/icons/berserk.svg -o public/icons/pwa-512.png resize 512 512
npx --yes sharp-cli@5 -i public/icons/berserk.svg -o public/icons/maskable-512.png resize 512 512
```

If `sharp-cli` fails in this environment, fall back to a tiny node one-off with `npx --yes @resvg/resvg-js-cli` — and if neither works, report BLOCKED with the error rather than committing empty PNGs. Verify each PNG is non-empty and square (`file public/icons/*.png`).

- [ ] **Step 2: Write the failing config test**

`frontend/src/__tests__/pwa.spec.ts`:

```typescript
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const config = readFileSync(
  fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  'utf-8',
)

describe('pwa config', () => {
  it('declares standalone manifest with rune icons and void theme', () => {
    expect(config).toContain("display: 'standalone'")
    expect(config).toContain("theme_color: '#0A0C0F'")
    expect(config).toContain('pwa-512.png')
    expect(config).toContain("purpose: 'maskable'")
  })

  it('does not runtime-cache the api (online-only by design)', () => {
    expect(config).not.toContain('runtimeCaching')
    // el proxy de dev legítimamente contiene '/api'; lo prohibido es cachearlo
    expect(config).not.toMatch(/urlPattern.*api/)
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm run test`
Expected: FAIL — vite.config.ts has no manifest yet.

- [ ] **Step 4: Implement**

`frontend/vite.config.ts` (full new content):

```typescript
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // shell precacheado, datos siempre online: sin runtimeCaching del API
      manifest: {
        name: 'berserk',
        short_name: 'berserk',
        description: 'Workout tracker',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0A0C0F',
        background_color: '#0A0C0F',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: { '/api': 'http://localhost:8000' },
  },
})
```

- [ ] **Step 5: Run tests and build; verify sw + manifest emitted**

```bash
cd frontend
npm run test
npm run build
ls dist/sw.js dist/manifest.webmanifest
```

Expected: tests pass; build emits service worker and manifest (the Phase-1 backend SPA fallback already serves both with `Cache-Control: no-cache`).

- [ ] **Step 6: Commit**

```bash
git add frontend/
git commit -m "feat: installable pwa with rune icon and shell precache"
```

---

### Task 9: CI integration and phase exit checks

**Files:**
- Modify: `.github/workflows/ci.yml` (frontend job: add guard + tests before build)
- Test: full local pipeline run

**Interfaces:**
- Produces: frontend CI job = `npm ci` → `npm run guard:tokens` → `npm run test` → `npm run build`. (The `build` script already chains the guard, but the explicit step gives it its own CI line/failure signal.)

- [ ] **Step 1: Update the workflow**

In `.github/workflows/ci.yml`, replace the frontend job's steps `npm ci` / `npm run build` with:

```yaml
      - run: npm ci --no-audit --no-fund
      - run: npm run guard:tokens
      - run: npm run test
      - run: npm run build
```

Validate YAML parses (from `backend/`): `uv run --with pyyaml python -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('../.github/workflows/ci.yml').read_text()); print('yaml ok')"`

- [ ] **Step 2: Full local verification of the phase**

```bash
cd frontend
npm run build:tokens && git diff --exit-code src/styles/tokens.css
npm run guard:tokens
npm run test
npm run build
```

Expected: no token drift, guard clean, all tests green, build green.

- [ ] **Step 3: Commit**

```bash
git add .github/ frontend/
git commit -m "ci: frontend guard and tests in pipeline"
```

---

## Phase 3 exit criteria

- `npm run test` / `npm run build` (guard + vue-tsc + vite) green; token pipeline deterministic (`build:tokens` produces no diff).
- Booting `npm run dev` against the backend shows: bootstrap screen on a fresh DB / login otherwise, carved-rune entry animation, working session flow into the shell with bottom nav and placeholder tabs, toasts for API errors, ES/EN messages complete.
- PWA: `dist/` contains manifest + sw; installable standalone with rune icon.
- **User visual checkpoint** (the one agreed mid-phase gate): the design direction — palette, type, slabs, runes, motion — reviewed at localhost:5173 before Phase 4 builds the five real views on top.



