# Development Guidelines

## Core Development Philosophy

**We work LIVE on main branch.** All code changes are committed and pushed to GitHub immediately after completion. We prioritize fast iteration and can rollback if needed.

## Strict Workflow Rules

### 1. ALWAYS Push to GitHub After Each Commit
- ✅ **Required**: `git push origin main` immediately after every commit
- ✅ **No exceptions**: Even small changes must be pushed
- ✅ **Verification**: Check GitHub to confirm push succeeded
- ❌ **Never**: Leave commits unpushed - they won't be visible to the deployed environment

### 2. Commit Early and Often
- Make small, focused commits
- Use clear, descriptive commit messages
- Commit as soon as a feature/fix is complete
- Example: `git commit -m "Fix hero button contrast"` → `git push origin main`

### 3. Work on Main Branch
- All development happens on `main`
- No feature branches or staging
- Direct commits to main = faster iteration
- Rollback is available if critical issues arise

### 4. Deployment Pipeline
1. Code is committed locally
2. Code is pushed to GitHub (`git push origin main`)
3. GitHub is connected to deployment service (Vercel, etc.)
4. Changes deploy automatically (within minutes)
5. Changes are live in production

### 5. Testing & Verification
- Test changes locally before committing
- After pushing, verify changes appear in deployed environment
- Check fresh environment to confirm changes took effect
- Use browser hard refresh (Cmd+Shift+R or Ctrl+Shift+R)

## Important Notes

- **No staging branches**: We don't use intermediate branches
- **No code sitting locally**: Everything must be pushed to main
- **Immediate visibility**: Once pushed, changes go live
- **Rollback if needed**: Use `git revert` to undo if critical issues found
- **The deployed environment reflects main branch**: Always keep main production-ready

## Examples

✅ CORRECT WORKFLOW:
```bash
# Make changes
vim app/page.tsx

# Test locally
npm run dev

# Commit
git add app/page.tsx
git commit -m "Simplify hero button UI"

# PUSH TO GITHUB IMMEDIATELY
git push origin main

# Verify on GitHub and deployed environment
```

❌ INCORRECT WORKFLOW:
```bash
# Make changes
vim app/page.tsx

# Commit but forget to push
git commit -m "Simplify hero button UI"

# ❌ WRONG - Changes not visible to team or deployment
# ❌ WRONG - Deployed environment still has old code
```

## When Claude Is Assisting

**Critical Rule for Claude Code Agent**:
- Every `git commit` must be immediately followed by `git push origin main`
- Do not finish tasks without pushing
- Do not leave commits sitting locally
- If the user asks "where's my change?" - first check: "Is it pushed to main?"

## Future: Automated Build Monitoring (TODO)

When Vercel Personal Access Token is provided:
- Claude can fetch build logs directly from Vercel API
- Automatically detect build failures
- Proactively fix errors without manual log pasting
- Fully automated deployment feedback loop

**Setup needed**:
1. User provides Vercel PAT to Claude
2. Claude stores in secure context
3. After each push, Claude checks deployment status
4. Retrieves and fixes build errors automatically

---

**Remember**: We move fast by pushing live. We move safely by knowing we can always rollback.
