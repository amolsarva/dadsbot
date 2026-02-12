# Build Notes — Read Before You Commit

> **Attention developers (and AI agents):** Review this checklist before every
> commit. Vercel's production build is stricter than local `next dev` and will
> reject code that appears to work fine during development.

---

## Quick pre-commit check

Run the full CI pipeline locally before pushing:

```bash
npm run ci-check        # lint + type-check + build
```

If you only have time for one command, run the build — it includes the linter
pass that catches most Vercel failures:

```bash
npm run build
```

---

## Common Vercel build failures

### 1. Unescaped entities in JSX (`react/no-unescaped-entities`)

Vercel's build treats this as a **hard error**, not a warning. Curly quotes,
apostrophes, and double-quotes inside JSX text must be escaped.

| Character | Escape with                         |
|-----------|-------------------------------------|
| `"`       | `&quot;` `&ldquo;` `&rdquo;` `&#34;` |
| `'`       | `&apos;` `&lsquo;` `&rsquo;` `&#39;` |
| `>`       | `&gt;`                              |
| `}`       | `&#125;`                            |

**Bad:**
```tsx
<p>Click "Start" to begin.</p>
<p>It's ready.</p>
```

**Good:**
```tsx
<p>Click &ldquo;Start&rdquo; to begin.</p>
<p>It&apos;s ready.</p>
```

Alternatively, embed the string in a JS expression:

```tsx
<p>{"Click \"Start\" to begin."}</p>
```

### 2. Unused variables (`@typescript-eslint/no-unused-vars`)

Vercel's lint pass **fails the build on warnings** that `next dev` silently
ignores. The ESLint rule requires unused identifiers to start with `_`.

```ts
// Bad — build will fail
const data = await someCall()   // 'data' never read

// Good
const _data = await someCall()  // prefixed with _
```

The same applies to:
- Destructured properties you don't need:
  `const { unused, ...rest } = obj` -> `const { unused: _unused, ...rest } = obj`
- Function parameters:
  `function handler(req, res)` -> `function handler(_req, res)` (if `req` is unused)
- Imported names you haven't used yet.

### 3. TypeScript strict-mode errors

`next build` runs `tsc` in strict mode. Watch for:
- Missing return types on exported functions that Vercel's build infers differently.
- `any` casts that hide type mismatches only caught during full compilation.
- Enum or interface changes that haven't been propagated to all call sites.

### 4. Build-time environment variables

Vercel injects environment variables at build time for `VERCEL`, `VERCEL_ENV`,
`NODE_ENV`, etc. Code that reads `process.env` at the top level during the
build will see Vercel's values, not your local `.env`. If a variable is
missing in Vercel's project settings, it will be `undefined` at build time.

Check `ENV_KEYS.txt` and `docs/env-audit.txt` for the required set.

---

## Vercel vs. local `next dev` — key differences

| Behavior | `next dev` | Vercel `next build` |
|---|---|---|
| ESLint warnings | Shown in terminal, non-blocking | **Fail the build** |
| `react/no-unescaped-entities` | Warning | **Error** |
| `@typescript-eslint/no-unused-vars` | Warning | **Fails build** |
| Missing env vars | Runtime error on first request | Build may succeed but routes throw at runtime |
| Static page generation | Skipped | Runs — can surface data-fetching bugs |

---

## Recommended workflow

1. Write your code.
2. Run `npm run build` locally (or `npm run ci-check` for the full suite).
3. Fix every warning and error — Vercel will reject them.
4. Commit and push.

When in doubt, treat every ESLint warning as a build-breaking error, because
on Vercel it is.
