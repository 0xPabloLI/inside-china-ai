export const meta = {
  article: "workbuddy-computer-use",
  subject: "workbuddy",
  pipelineId: "workbuddy-computer-use",
  title: "Tencent's WorkBuddy Can Click Your Mouse",
  renderer: "remotion",
  createdAt: "2026-11-20",
  // Measured from content/workbuddy-computer-use/assets/ on 2026-11-20:
  // 3 motion clips (10s + 4s + 10s = 24 counted seconds), 5 usable stills.
  // The hook is the 4s WorkBuddy desktop-app clip, marked mediaRole:"evidence"
  // so the hook renderer actually draws it (not a background role it would drop).
  videoFit: 5,
  videoFitFormat: "demo-led",
  videoFitHook: "WorkBuddy desktop app task list with the cursor at the task composer (assets/workbuddy-demo-app.mp4)",
  videoFitEvidence:
    "assets/workbuddy-demo-app.mp4 4.0s + assets/workbuddy-demo-task.mp4 10.0s + assets/workbuddy-demo-doc.mp4 10.0s = 24 counted seconds; 5 usable stills (setup, permission, browser search, Xiaohongshu, capability comparison); hook uses the WorkBuddy app clip and is mediaRole:evidence.",
  storySpine: {
    phenomenon:
      "Tencent's WorkBuddy launched Computer Use in public beta on November 20, 2026: it can read a page or a desktop client's interface, then click, type and scroll without the target app exposing an API.",
    caveat:
      "It is still a beta. Interface recognition varies by app, and UI automation can break when a button moves. To work, it needs Accessibility and Screen Recording permissions, which means the agent can see the screen and drive system input; permissions can be revoked and the task stopped.",
    storyType: "phenomenon",
  },
  topics: [
    "china-ai",
    "tencent",
    "workbuddy",
    "computer-use",
    "ai-agents",
    "desktop-automation",
    "productivity",
  ],
  keyEntities: {
    companies: ["tencent", "workbuddy"],
    people: [],
    models: [],
  },
  dataPoints: [
    "36Kr, 2026-11-20: Tencent WorkBuddy launched Computer Use; it recognizes the current page and desktop client UI, then clicks, types and scrolls; the target software does not need to expose an API; it can operate in the background.",
    "36Kr: Computer Use is in public beta on macOS and Windows; the client must be updated to 5.11.0 or above, the feature enabled, and authorizations completed; recognition quality varies by software.",
    "WorkBuddy product guide: the official 120-second demo walks through multi-step desktop work on macOS.",
    "Woshipm hands-on, 2026-11-13: enabling Computer Use requires Accessibility and Screen Recording permissions and a client restart; the task can be stopped, and permissions can be revoked in system settings.",
    "Woshipm hands-on: WorkBuddy presents three levels of control — browser tasks, remote desktop control, and full computer control.",
  ],
  hashtags: ["#chinaai", "#tencent", "#workbuddy", "#computeruse", "#ainews"],
};
