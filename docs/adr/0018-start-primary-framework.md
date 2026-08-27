# S.T.A.R.T. as primary script framework, AI Outline as HITL tool input

S.T.A.R.T. (15-source verified) is the sole primary framework for video script structure. AI Outline (TikTok official tool) is a HITL tool input — consumed via a mapping table when the user brings back output, not used as a structural skeleton. Retention engine mechanisms (open loop, pattern interrupt, loop closure) are enforced as optional `retentionMechanism` fields in scene-data, checked by W7/W8/W9 in preflight.

## Considered Options

- **AI Outline as primary framework** (rejected): 6-segment structure conflicts with S.T.A.R.T. 5-segment; AI Outline output format is unstable (no API, mobile-only); lacks creator community consensus.
- **Three frameworks as peers** (rejected): "fusion formula" approach caused "reference but not enforcement" — Agent could claim compliance without structural verification.

## Consequences

- `narrativeRole` and `retentionMechanism` are optional scene-data fields; legacy scene-data without them skips W7/W8/W9.
- `video-script-writing-guide.md` is the single authority for S.T.A.R.T. scene templates and AI Outline consumption mapping.
