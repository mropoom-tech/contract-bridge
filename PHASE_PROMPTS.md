# PHASE_PROMPTS — Copy/paste after MASTER_PROMPT

ใช้เมื่อต้องการสั่ง Claude ทีละช่วง หรือเมื่อเปิด Session ใหม่ ไม่ควรข้ามขั้นโดยไม่ได้ทดสอบ

## A. เริ่มโปรเจกต์ใหม่ (Phase 0)

```text
อ่าน CLAUDE_START_HERE.md และเอกสารอ้างอิงทั้งหมดก่อน จากนั้นตรวจ Repository จริง
ถ้าโปรเจกต์ว่างให้ Scaffold React+TypeScript+Vite บน Cloudflare Workers ตามเอกสารล่าสุด
ติดตั้ง Hono, Tailwind, Zustand, Zod, Vitest และจัด Workspace ให้มี game-engine/shared
สร้าง Health API, gitignore, scripts typecheck/lint/test/build และ Wrangler config ใช้ SQLite-backed Durable Objects แบบใหม่
รันทุกคำสั่งที่ทำได้จริง ซ่อม Error และอัปเดต docs/PROJECT_STATE.md
อย่าพึ่ง Deploy หรือสร้าง Resource ใน Cloudflare โดยไม่ได้รับอนุญาต
```

## B. Game Engine (Phase 1)

```text
เริ่ม Phase 1 โดยอ่าน docs/GAME_RULES.md และ docs/TEST_PLAN.md แบบละเอียด
สร้าง Pure TypeScript Bridge Engine ที่รองรับ Deal 52 ใบ, Bidding Pass/Bid/Double/Redouble,
Declarer/Dummy/Opening Lead, 13 Tricks/Follow Suit/Trump และ Duplicate Scoring + Vulnerability
สร้าง Unit Tests ขอบเขตครบ โดยใช้ Golden Score Vectors จริง ห้ามจำลองคะแนนแบบ hardcoded
รัน tests/typecheck/build ซ่อมจนผ่าน หากยังมีบั๊กให้บันทึกตามจริงใน PROJECT_STATE.md
```

## C. Multiplayer & Server (Phase 2)

```text
เริ่ม Phase 2 ตรวจสอบ Backend ที่มีจริงก่อน
ทำ Guest Session แบบ HttpOnly Cookie, D1 Migrations, Private Room CRUD, Seat Claim, Ready
และ Durable Object 1 ห้องต่อ 1 Object ใช้ WebSocket Hibernation
คำสั่งทุกอันต้องตรวจ Session/Seat/Phase/Turn/Legality/Version/Idempotency
ทำ per-seat snapshot ป้องกันข้อมูลไพ่ลับ และ integration test 4 clients
ทดสอบ local แบบใช้ DO จริง ห้ามแค่ mock WS แล้วสรุปว่า Multiplayer สำเร็จ
อัปเดต PROJECT_STATE.md ตามผลทดสอบ
```

## D. Game UI (Phase 3)

```text
เริ่ม Phase 3 ด้วย UI ที่เล่นผ่าน Backend จริง ไม่ใช้ปุ่ม Mock
สร้าง Landing / Guest / Join Room / Lobby / Table / Bidding Box / Auction History /
Dummy display / Trick zone / Scoreboard / Board Result / Next Board
ออกแบบธีม Dark Emerald + Gold + Ivory Cards รองรับมือถือ 360px และ PC
สำหรับแต่ละ UI ให้ทำ loading/error/reconnect/accessibility และ test แบบ 4 sessions
เมื่อจบต้องสามารถเล่นครบหนึ่ง Board จริงผ่าน UI ได้
```

## E. Reliability & Deployment (Phase 4)

```text
เริ่ม Phase 4 ตรวจสอบ event protocol / state persistence / auth threats
เพิ่ม reconnect + authoritative snapshot, duplicate request protection, stale version recovery,
DO state recovery after hibernation, idempotent DO->D1 result sync, security tests,
4-browser Playwright E2E และ CI GitHub Actions
เตรียม Cloudflare Wrangler deploy config ตาม docs/DEPLOYMENT.md
ถ้าจำเป็นต้องใช้ token, สร้าง D1 production, apply remote migration, push repo หรือ deploy
ให้บอกสิ่งที่ต้องเตรียมอย่างเฉพาะเจาะจงและรอผู้ใช้อนุญาต ไม่สร้าง/ใช้ credential เทียม
บันทึก URL/commit/test outcomes จริงใน PROJECT_STATE.md
```

## F. สั่งต่อจาก Session เดิม

```text
อ่าน CLAUDE_START_HERE.md และ docs/PROJECT_STATE.md แล้วตรวจโค้ด/Tests ใน Repository จริง
สรุป 1) สิ่งที่ทำสำเร็จยืนยันด้วยหลักฐาน 2) งานค้าง 3) บั๊ก/ความเสี่ยง
เลือกงานถัดไปที่เล็กที่สุดตาม ROADMAP แล้วลงมือพัฒนาจริงทันที
รัน typecheck/lint/test/build ที่เกี่ยวข้อง แก้ไข และอัปเดต PROJECT_STATE.md
ห้ามสรุปว่าทำเสร็จโดยดูเฉพาะ checkbox ในเอกสาร
```

## G. ตรวจคุณภาพก่อนเปิดให้ผู้เล่นใช้

```text
ทำ pre-release audit โดยเทียบ implementation กับ PRD, GAME_RULES, SECURITY,
WEBSOCKET_PROTOCOL, TEST_PLAN, DEPLOYMENT และ ROADMAP
ค้นหากฎบริดจ์ผิด, ไพ่รั่วใน response, vulnerability/score ผิด,
ผู้เล่นควบคุม dummy ผิด, reconnect state สูญหาย, WS origin ตรวจไม่ครบ,
duplicate action, fake buttons และ GitHub CI/Cloudflare binding misconfiguration
แก้เฉพาะสิ่งที่ตรวจพบ พร้อม regression tests ไม่อ้างว่าผ่านหากยังไม่ได้ทดสอบ
```
