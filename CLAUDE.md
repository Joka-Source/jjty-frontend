# JETT frontend execution

Product authority is the founder's latest instruction and `../human/JETT_SSOT.md`.
Engineering evidence lives in `docs/quality/PRODUCT_AUDIT.md`. Preserve unrelated
local work. Installed skills are not evidence that a workflow or test ran.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool.
If that tool is unavailable, read its installed SKILL.md and use the documented
runtime workflow. User instructions and authorized scope take precedence.

Key routing rules:
- Product ideas/brainstorming → /office-hours
- Strategy/scope → /plan-ceo-review
- Architecture → /plan-eng-review
- Design system/plan review → /design-consultation or /plan-design-review
- Full review pipeline → /autoplan
- Bugs/errors → /investigate
- QA/testing site behavior → /qa or /qa-only
- Code review/diff check → /review
- Visual polish → /design-review
- Ship/deploy/PR → /ship or /land-and-deploy within explicit publication authority
- Save progress → /context-save
- Resume context → /context-restore
- Author a backlog-ready spec/issue → /spec

For application changes, run the relevant focused checks and `npm test`; verify
the actual browser journey. Capture mocks, injected transcripts, real microphones,
physical devices and production are separate evidence classes. No hosted-service,
application deployment or external-message authority follows from this routing.
