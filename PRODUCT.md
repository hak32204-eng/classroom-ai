# Classroom AI: product and launch plan

Updated 2026-10-30. This is a working product plan, not a claim of market leadership or a launched paid offer.

## Positioning

For students who use Google Classroom and already work in ChatGPT: turn a selected assignment into a clear, reusable preparation brief with the right context, formatting and title-page details. Stay inside the AI client. Focus on practical reports and coursework formatting before expanding to every education workflow.

Proposed promise: **«Выберите задание. Примените свой образец. Подготовьте работу без повторного ввода требований»**.

The connector reads source context and prepares a brief/template. The host AI handles explanations, draft writing and supported artifact creation. Do not advertise guaranteed DOCX/PDF exports, attachment understanding, persistent style memory, full patronymics, grades or successful submission until each capability is actually implemented and verified.

## Implemented foundation

- Authenticated, read-only Classroom MCP; Google credentials encrypted; no stored coursework.
- Live ChatGPT connection and course listing verified. Claude remains unverified in-client.
- Cross-course search, local-day deadline filters, undated work, pagination and explicit partial failures.
- Preparation wizard with work/file type, formatting requirements, personal target date, title-page fields, outline and review checklist.
- Client-supplied reference style profile; host tools must inspect the original sample and later render/compare actual output.
- Optional teacher-name lookup with explicit extra Google consent, selection among multiple teachers and manual fallback.
- Public explanation/privacy/deletion pages. Closed Google pilot; public MIT source code; no billing or advertising campaigns activated.

## Next release gates

1. Verify refreshed tool discovery and real wizard/search calls in ChatGPT. Complete Claude compatibility after account verification.
2. Test a user-provided DOCX reference end to end: extract observed styles with host tools, build a brief, create an actual document, render pages, compare title page and body, and obtain user feedback. PDF/image references must show uncertainty where exact style is unrecoverable.
3. Verify optional teacher lookup on real Google data after new consent; ensure course identity and student identity remain isolated. Test missing names, multiple teachers, denied permission and revoked access.
4. Read assignment attachments through a narrowly scoped, reviewed design before claiming full material understanding. Do not add broad Drive access by default.
5. Define an opt-in personal style/profile storage design and deletion/export controls before claiming persistent reuse across chats. Current profiles are transient.
6. Prepare a production Google project, verified branding/domain and applicable OAuth verification before open enrollment. Keep development and production separate. In Testing, Google refresh tokens with these scopes expire after seven days; do not sell this as a permanent connection.
7. Add real export acceptance checks and operational latency/error measurements before scaling. Collect aggregate technical outcomes only; never send coursework or identities to marketing analytics by default.

Google sources: [OAuth production readiness](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), [testing token lifetime](https://developers.google.com/identity/protocols/oauth2), [Classroom scopes](https://developers.google.com/workspace/classroom/guides/auth), [teacher lookup scopes](https://developers.google.com/workspace/classroom/reference/rest/v1/courses.teachers/list).

## Competitive context

As of this review, [SalShah20/classroom_mcp](https://github.com/SalShah20/classroom_mcp) documents student read-only tools including grades and missing work. [zainf2327/mcp-classroom](https://github.com/zainf2327/mcp-classroom) targets broader educator workflows. Google documents an [official Classroom MCP in Developer Preview](https://developers.google.com/workspace/classroom/guides/mcp/configure-mcp-server).

These are capability comparisons from primary documentation, not independent security/performance benchmarks. Do not claim first, unique, best, teacher-approved, or better security without evidence. Compete on a complete measured student workflow, reference fidelity and time saved.

## Pilot: first 10–20 participants

- Recruit adult volunteers who already use Classroom; start with one narrow course/report format. Invitations should go through owner-selected communities with their permission; no scraping or unsolicited mass messaging.
- Demo with synthetic assignments and fictional names. Use real coursework only with permission; show a clean source-to-brief-to-file flow.
- Give each participant three tasks: find one assignment, prepare a brief, reuse a reference style for a second assignment. Observe where they need help.
- Proposed go/no-go targets, not achieved metrics: 80% connect without help; 80% complete the preparation flow; median time to a usable brief below three minutes; no incorrect identity substitutions; all tested deadlines match source/timezone; every claimed export opens and renders correctly.
- Ask for feedback after use: what was confusing, how much manual correction remained, whether they returned for a second work. Keep sensitive feedback out of public GitHub issues.
- Do not optimize retention or paid conversion before the basic flow meets these criteria.

## Launch sequence

1. Finish the pilot and publish an honest 60–90 second synthetic-data walkthrough, setup guide and known limitations.
2. Prepare channel-specific drafts for student communities, study creators and the repository README. The owner chooses destinations and reviews real testimonials before anything is posted externally.
3. After Google production readiness and host compatibility, open a limited public beta and measure onboarding failures, support load and time saved.
4. Consider a platform listing only when its current requirements and account eligibility are verified. Do not imply listing approval or partnership.
5. Expand templates/course types based on repeated user needs, not a long unvalidated feature list.

## Monetization hypothesis

Keep the original free connector foundation. Test whether people value optional managed setup, a polished template workflow, reusable profiles and reliable document checks. Public MIT code can be reused by others; the proposed commercial value is the hosted experience, support and maintained workflow, not exclusivity of the connector code. No price, payment provider, subscription or commercial launch has been approved or enabled.

Suggested validation: interview pilot users about the problem and current alternatives, then test willingness to pay for a concrete demonstrated feature bundle. Set pricing only after operating cost and retention are measured. Never sell Google educational data or use it as advertising inventory.

## Draft announcement (not posted)

«Тратите время на перенос задания из Classroom и оформление отчёта? Мы тестируем Classroom AI: он помогает найти нужную работу в ChatGPT, собрать требования и подготовить план с титульным листом. Можно применить параметры вашего образца. Сейчас идёт закрытый пилот; автоматической сдачи нет, а возможности экспорта зависят от AI-клиента. Ищем участников, которые готовы попробовать процесс и рассказать, где ещё приходится исправлять вручную».
