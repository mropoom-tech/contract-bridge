# Contract Bridge Online — Claude Development Kit

เอกสารกำหนดงานสำหรับสร้าง **Contract Bridge Online (4 Players, 2 Teams)** ด้วย React + TypeScript + Hono + Cloudflare Workers + SQLite-backed Durable Objects + D1 + GitHub Actions

> เวอร์ชันเอกสาร: 2026-11-17 · สถานะ: Phase 0–1 เสร็จ (local) · ยังเล่นออนไลน์ไม่ได้ ดู `docs/PROJECT_STATE.md`

## เริ่มต้นใช้งานกับ Claude

1. ดาวน์โหลดและแตก ZIP ลงใน root ของ GitHub repository ใหม่ (หรือโปรเจกต์ที่มีอยู่แล้ว)
2. เปิด Claude Code ใน root ของโปรเจกต์
3. ให้ Claude อ่าน [`CLAUDE_START_HERE.md`](./CLAUDE_START_HERE.md) ก่อน
4. คัดลอก [`MASTER_PROMPT.md`](./MASTER_PROMPT.md) ไปเป็นคำสั่งเริ่มต้น หรือสั่งสั้น ๆ ว่า `อ่าน CLAUDE_START_HERE.md และเริ่ม Phase 0-1 ตามเอกสาร`
5. ให้ Claude ตรวจโค้ดจริงก่อนทุกครั้ง; แก้ไข `docs/PROJECT_STATE.md` เมื่อแต่ละงานผ่านการตรวจแล้ว
6. สร้าง Cloudflare resources, GitHub secrets และ deploy **เมื่อคุณเป็นผู้อนุญาตและเตรียมบัญชีแล้ว** เท่านั้น

## เป้าหมาย MVP

- Browser-based Bridge สำหรับ 4 คน/ห้อง นั่ง N/E/S/W (N–S vs E–W)
- Guest-first: สร้างห้อง รหัสเชิญ ลิงก์เข้าห้อง เลือกที่นั่ง Ready
- Server-authoritative shuffle/deal/bidding/trick play/dummy/scoring
- แสดงมือไพ่ส่วนตัวอย่างปลอดภัย; ไพ่ dummy เปิดให้เห็นหลัง opening lead
- Realtime WebSocket, resync หลัง refresh, deduplicate actions
- Duplicate contract scoring + board number/dealer/vulnerability
- เล่นต่อหลาย boards, ดู scoreboard และผลสรุป
- PC/tablet/mobile; UI ไทยเป็นค่าเริ่มต้น พร้อม English-ready strings
- CI/tests, GitHub Actions, Cloudflare deployment

## ไฟล์หลัก

| ไฟล์ | ใช้งาน |
|---|---|
| `MASTER_PROMPT.md` | Prompt ฉบับเต็มสำหรับ Claude |
| `PHASE_PROMPTS.md` | Prompt แยกแต่ละ Phase และ Prompt ต่อ Session |
| `CLAUDE_START_HERE.md` | จุดเริ่ม + ลำดับอ่าน + ข้อห้าม |
| `CLAUDE.md` | คำแนะนำระยะยาวให้ Claude Code |
| `docs/PRD.md` | Feature requirements, scope, user stories |
| `docs/GAME_RULES.md` | กติกา Bridge และ scoring พร้อมตัวอย่าง |
| `docs/ARCHITECTURE.md` | ระบบ Cloudflare, state, reliability |
| `docs/DATABASE_SCHEMA.md` | D1 tables, constraints, ownership |
| `docs/WEBSOCKET_PROTOCOL.md` | Realtime schema, events, sync |
| `docs/SECURITY.md` | Auth, hidden info, anti-cheat |
| `docs/UI_UX.md` | Pages, layout, responsive, accessibility |
| `docs/TEST_PLAN.md` | Acceptance tests และ edge cases |
| `docs/DEPLOYMENT.md` | GitHub + Cloudflare setup/checklist |
| `docs/ROADMAP.md` | เฟสการพัฒนาและ Definition of Done |
| `docs/PROJECT_STATE.md` | บันทึกสถานะจริง (ห้ามเดาความคืบหน้า) |
| `docs/REFERENCES.md` | เอกสารทางการที่ใช้ตรวจสอบ |

## Architecture at a glance

```text
Browser React/Vite SPA (4 players)
            |
    HTTPS + WebSocket
            |
Cloudflare Worker (Hono API, guest sessions, routing)
       |                         |
       v                         v
Cloudflare D1                 Durable Object per room
Identity, room index,         Authoritative game state
match summaries               & Hibernatable WebSockets
       ^                         |
       +---- idempotent result --+

GitHub -> CI (test/typecheck/build) -> Deploy Workers
```

## Decisions already agreed for MVP

- Four human players only; no AI, public queue, ranking, spectators or tournament in MVP
- Casual private rooms and Duplicate board scoring; no Rubber Bridge
- No claim/concede, undo, Director adjudication or bidding convention engine in MVP
- Four-seat authority and **server-only full deck** are mandatory
- One room -> one Durable Object; in-room authority in DO; D1 for account/index/summary
- SQLite-backed DO; hibernatable WS; persistence before ack
- Use official **current stable** Cloudflare React+Vite setup; do not mix old Cloudflare Pages recipes with Workers Vite plugin

## Developer setup

ต้องใช้ Node 24+ และ npm 11+

```bash
npm install
npm approve-scripts workerd esbuild   # npm 11 บล็อก install scripts; สองตัวนี้จำเป็นสำหรับ dev/build
npx wrangler d1 migrations apply DB --local -c apps/web/wrangler.jsonc   # สร้าง D1 บนเครื่อง (ครั้งแรก/เมื่อมี migration ใหม่)
npm run dev          # http://localhost:5173 , API ที่ /api/health
npm run test:e2e -w @bridge/web   # ต้องเปิด npm run dev ไว้ก่อน: ทดสอบ 4 client ผ่าน WebSocket จริง
npm run typecheck
npm run lint         # oxlint
npm test             # engine + worker tests
npm run test:coverage
npm run build
```

โครงสร้าง: `apps/web` (React SPA + Hono Worker), `packages/game-engine` (กติกาบริดจ์แบบ pure TypeScript) ดูสถานะจริงที่ `docs/PROJECT_STATE.md`

## Practical notes

All shell commands and config patterns are examples. Verify versions and syntax against current official documentation at implementation time. Keep secrets in Cloudflare / GitHub secrets; never commit tokens or `.dev.vars`.
