# PRD — Contract Bridge Online

**Product:** Contract Bridge Online  
**Target:** Casual 4-human-player private online rooms, full Contract Bridge rules, multi-board sessions  
**Status:** Requirements specification (not implemented)  
**Primary UI language:** Thai; design copy for future English support

## 1. Product intent

ผู้เล่นใหม่สามารถเปิดเว็บ ตั้งชื่อ สร้างห้อง ส่งรหัสให้เพื่อนอีกสามคน แล้วเล่น Contract Bridge จบ Board อย่างถูกต้องจนเห็นคะแนนและเล่น Board ถัดไปได้ โดยไม่ต้องติดตั้งโปรแกรมหรือจ่ายเงินสมัครสมาชิก

## 2. Core personas

- **Host:** guest/member, creates private room, shares invite, assigns/changes own seat, starts ready countdown only when 4 ready, can end room per policy
- **Player:** guest/member, joins code, controls own seat; if declarer controls dummy's cards, not partner's normal hand
- **Returning player:** resumes seat after reconnect with same authenticated session

## 3. Primary user journey

1. Landing -> `เล่นเลย` -> nickname -> create/join private room
2. Create room gives opaque `roomCode` and safe invite link; join room by code
3. Lobby shows 4 seats, team pairing and who is ready. Seat moves only if vacant, host policies applied server-side
4. All 4 ready -> server starts first board, shows private 13-card hand
5. Dealer starts auction. Legal actions only, with current call history and contract preview
6. Auction ends. If passed out: zero score and next board; otherwise left-hand opponent makes opening lead
7. Dummy's hand appears after opening lead and declarer commands dummy turns
8. Each of 13 tricks shows cards, winner, and team trick counters
9. End: contract, board number, vulnerability, tricks won, signed NS/EW duplicate scores, running totals
10. All 4 ready next board (or host ends match). Keep seat/team identities across boards

## 4. MVP scope and requirements

| ID | Requirement | Must pass |
|---|---|---|
| FR-01 | Guest nickname + resumable secure session | after refresh same identity |
| FR-02 | Room create/join via unguessable code | wrong/expired/full room errors |
| FR-03 | 4 seats N/E/S/W; NS and EW opposing teams | simultaneous seat claims not possible |
| FR-04 | 52-card CSPRNG shuffle, 13 each | no duplicates, no client full deck |
| FR-05 | Legal auction including Double/Redouble | invalid calls blocked by server |
| FR-06 | Opening lead, dummy, follow suit, trump | trick winner accurate |
| FR-07 | Complete 13 tricks, next board | pass-out and ordinary board handled |
| FR-08 | Duplicate scoring & vulnerability | numeric test cases exact |
| FR-09 | WebSocket realtime + reconnect | no lost turn/double play |
| FR-10 | Persist board summaries, session total | same result after refresh |
| FR-11 | Mobile/desktop full input parity | hand/bidding controls usable |
| FR-12 | CI/test/build and deployment | verifiable URL and smoke checks |

## 5. Non-functional requirements

- **Correctness:** rules run server-side; game engine deterministic for same inputs
- **Integrity:** one authoritative state machine per room, persisted before ack; monotonic version
- **Privacy:** opponent hands never in other players' payloads while hidden; private redacted observability
- **Reliability:** resume after page refresh/disconnect/restart; duplicate action safe
- **Performance:** send events/deltas and seat-specific snapshots on reconnect; no high-frequency timers while idle
- **Accessibility:** keyboard focus, ARIA labels for card names, suit not communicated by color alone, reduced motion support
- **Operational:** Free-tier-friendly design, useful structured logs without secret cards

## 6. Main screens

Landing; guest nickname; create/join; waiting room/lobby; bridge playing table; bidding panel/history; board result; match summary; in-game help; error and reconnect overlay.

## 7. Rules of release

A beautiful UI without a real secure engine is **not** MVP. Four human clients must complete a fully legitimate board with correct scoring and reconnection, verified with tests. Local and production environment checks must be separate.

## 8. Out of scope (MVP)

Login by Google/password, spectator, in-game private chat, matchmaking, ranked ladder, AI, tournament across multiple tables, PBN file import/export, claims/undo/director, bidding conventions and alerts, Rubber Bridge scoring. Design extension points but do not build these until MVP passes.

## 9. Product defaults

- Initial session defaults to **4 boards**; support a configurable 1–16 board count later
- Board numbers start at 1; dealer/vulnerability follow conventional board cycle
- Direction rotates visually so the local player is at bottom, but **logical seat identifiers remain N/E/S/W**
- Casual, no time limit in MVP; show turn prompt and who is offline
- Score view shows board score NS as signed value and EW as the inverse. Do not call this tournament Matchpoints or IMPs
- For passed-out board, both sides receive zero and may continue
