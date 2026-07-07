# SRE Scan Report Template

Use this structure for the chat report.

```markdown
## SRE Scan: <branch> vs <base>

**Files reviewed:** <n> changed (<app / config / ci / deps breakdown>)
**Verdict:** <Blocker(s) found | Issues to address | Looks safe>

### Summary
| Severity | Count |
|---|---|
| Critical | <n> |
| High | <n> |
| Medium | <n> |
| Low | <n> |

### Findings

#### [CRITICAL] <short title>
- **Where:** `path:line`
- **Introduced:** <what the change added/changed>
- **Risk:** <the concrete failure mode in production>
- **Fix:** <specific, actionable recommendation>

<code reference showing the offending lines>

#### [HIGH] <short title>
...

(repeat per finding, ordered Critical → Low)

### Recommended next steps
- [ ] <fix / add monitor / add test / etc.>
```

Rules:
- Order findings by severity, Critical first.
- Every finding needs Where, Introduced, Risk, and Fix.
- Show offending lines with a `startLine:endLine:filepath` code reference.
- If nothing was found, state "No SRE issues introduced" and list the categories
  and files you checked.
