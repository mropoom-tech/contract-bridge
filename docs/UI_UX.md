# UI_UX — Modern online Bridge table

## Visual direction

Elegant modern card-table interface; forest green / teal felt, charcoal surfaces, champagne/gold accent, warm ivory cards; minimal gaming visual clutter; readable Thai text and clear large clickable controls. Avoid copying another site's branded assets. Use CSS-drawn suit symbols or properly licensed card art.

## Pages and components

### A. Landing (`/`)

- Brand `CONTRACT BRIDGE ONLINE`, subtitle `บริดจ์ออนไลน์ 4 คน เล่นกับเพื่อนได้ทันที`
- Hero primary action `เล่นเลย`, secondary `วิธีเล่น`
- Basic feature strip: 4 players, 2 teams, 52 cards, browser only
- Optional visual showing N-S partnership and E-W partnership

### B. Guest setup (`/play`)

- Nickname 2–24 chars, trim whitespace, clear validation
- Create guest session and persist with HttpOnly cookie
- Return users to original invitation room after authentication

### C. Create / Join room (`/lobby`)

- Create private room -> choose board count (default 4, MVP fixed 4 acceptable)
- Join via 6–8 character opaque code; paste invitation URL
- Copy room invite; visible full/expired/error states

### D. Waiting room (`/room/:code`)

- Four seats: North/South blue-ish partnership, East/West warm partnership (color plus labels)
- Seat claim or leave pregame only; seat owner nickname and connected status
- Per-player Ready toggle; host Start available only when 4 valid ready seats
- Show room code, copy invitation, basic bridge tip
- User cannot impersonate another seat by modifying local UI

### E. Game table (`/room/:code/table` or equivalent)

Required visible zones:

```text
              NORTH / partner-or-opponent
           [face-down hand or dummy face-up]

 WEST                                     EAST
[card count]       ┌─────────┐       [card count]
                   │ trick 4 │
                   │ 4 cards │
                   └─────────┘

              SOUTH / your hand
          [13 fan / scrollable cards]

 Board 1 · Dealer N · Vul: None · Contract 4S · Turn: E
 [Bidding Box] [Auction History] [NS/EW Tricks] [Score]
```

- Rotate **visual seat layout** so local player's own seat always appears at bottom; true seat names still N/E/S/W.
- Own cards display 13 readable cards, orderly sort by suit and rank. Touch-friendly, horizontal scroll/fan if necessary; selectable/highlighted state.
- For defender when dummy visible, show dummy in its actual visual seat.
- Declarer may select a card from Dummy only when `turnSeat===dummySeat` and server allows; distinguish visually `กำลังเล่นจากไพ่ Dummy`.
- Show active player, contract, vulnerability, previous trick summary, won trick counts, waiting/onboarding hints.
- Card animation must not delay or change game state. Use reduced-motion preference.
- Action buttons disabled with reason if illegal; still validate on server.
- Bid history must show N/E/S/W column order accurately. Double/Redouble symbols or text explained.
- If connection lost, show `กำลังเชื่อมต่อใหม่` overlay, prohibit speculative submissions until synchronized.

### F. Board result (`/room/:code/result` or overlay)

- Contract / Declarer / Vulnerability / Target tricks / Actual tricks
- Explicit score breakdown (contract points, game/partscore, slam, overtrick, insult or undertrick penalty)
- Show `NS: +420 / EW: -420` or inverse, not two independent positive scores
- Table of completed boards and running score totals
- All players ready for next board; host ends session when target board count reached

## Interaction states

Every actionable element must support: loading, pending, success, rejected/validation, offline, disconnected, stale version/resync, and keyboard focus. No static buttons that imply a working multiplayer feature when backend is absent.

## Responsive targets

- Desktop 1440+ wide: cards + score/bidding side panel
- Tablet 768–1024: compact panels, room remains playable
- Mobile 360–430: player hand at bottom, bidding as bottom drawer/modal, card size >=44px effective touch targets; no sideways document overflow except deliberate hand strip
- Use accessible card names such as `เอซโพดำ` rather than ♠ alone; color is supplemental.

## Suggested React components

`AppShell`, `PageHeader`, `RoomCodeCard`, `SeatBadge`, `PlayerPresence`, `ReadyButton`, `BridgeTable`, `CardFace`, `CardBack`, `CardHand`, `CurrentTrick`, `DummyHand`, `AuctionGrid`, `BiddingBox`, `ContractBadge`, `VulnerabilityBadge`, `TurnIndicator`, `TrickScore`, `BoardSummary`, `ReconnectOverlay`, `Toast/ErrorBanner`.

## MVP localization hints

Use dictionary keys for labels/errors. Thai examples: `ถึงตาคุณแล้ว`, `รอผู้เล่นอีก 1 คน`, `ประมูล`, `ผ่าน`, `ดับเบิล`, `รีดับเบิล`, `เลือกไพ่`, `ลงไพ่`, `เปิดไพ่ Dummy`, `ไพ่ดอกนี้ต้องลงตามดอก`, `ผลการแข่งขัน Board 1`.

## Accessibility acceptance

- Keyboard-selectable cards; visible focus rings; aria descriptions including rank/suit and whether selectable
- Do not use only red/black to communicate suit or team
- Announce important events (contract decided, trick winner, your turn) in concise accessible live text
- Layout remains usable at 200% zoom and with `prefers-reduced-motion` enabled
