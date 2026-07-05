# Business Modules Spec

Business modules define domain intent, inputs, outputs, default topology, permissions, and forbidden actions. They do not directly execute agents.

| Module | Responsibility | Inputs | Outputs | Default topology | Permission | Forbidden actions |
| --- | --- | --- | --- | --- | --- | --- |
| Link Reader | Read social/video links and extract useful content. | URL, platform hint, user goal. | Metadata, transcript, highlights, timeline, 3 next-step suggestions. | Hermes + Tool, optional OpenClaw/Claude. | L1 by default. | Reading nested comment replies or exposing secrets. |
| Collaboration / Watch Tasks | Live room and market watch with checkpoints. | Watch target, interval, rules, history. | Events, checkpoints, resume state, Hermes judgment. | Hermes + OpenClaw + Tool. | L1, L2 for state-changing action. | Acting without watchdog or checkpoint. |
| E-Commerce Ops | Product, publishing, live Q&A, data analysis, ad spend suggestions. | Product/content/live/ad data. | Drafts, recommendations, guarded actions. | API first, OpenClaw fallback. | L2 for write/publish/spend/price/listing. | Bypassing Action Guard. |
| WeChat Customer Ops | OCR read, draft reply, intent and tag analysis. | Screenshot/OCR text, history, customer state. | Draft reply, question/reply library match, tags, follow-up advice. | Hermes + OCR/tool. | L1 by default; sending is L2. | Auto-sending by default. |
| Generation / PPT | Image, video, and PPT generation workflow. | Goal, use, style, assets, acceptance criteria. | Prompt, generation plan, artifacts, validation summary. | Hermes + OpenClaw + Model Adapter. | L1 planning, L2 for paid/external generation. | Letting OpenClaw memory replace Hermes instruction. |
| Live Monitor | Monitor live rooms and surface decisions. | Room target, rules, history. | Alerts, summaries, next actions. | Hermes + OpenClaw/OCR/API. | L1/L2 by action. | Reusing stale page state without validation. |
| Content Publishing | Draft and schedule publishing. | Content, channel, schedule, approval. | Draft, schedule plan, publish result. | Hermes + Platform Adapter/OpenClaw fallback. | L2 to publish. | Publishing without explicit approval. |
| Market Watch | Watch stocks or market signals. | Symbols, rules, history, data source. | Watch events, risk summary, suggestions. | Hermes + API/tool, optional OpenClaw. | L1 by default. | Financial action without explicit approval and external confirmation. |
