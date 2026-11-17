# GAME_RULES — Standard Contract Bridge / Duplicate Board Scoring

Authoritative rules reference: WBF **2017 Laws of Duplicate Bridge**, with published amendments effective January 1, 2024; ACBL Law 77 scoring chart. This document specifies normal **legal gameplay** in MVP; procedural irregularities/Director rulings are out of scope. Read `REFERENCES.md`.

## 1. Cards, players, board

- Exactly 4 seats: `N -> E -> S -> W` clockwise. Teams: `NS` and `EW`.
- Standard deck of 52 unique cards, suits `C` (♣), `D` (♦), `H` (♥), `S` (♠), ranks `2...9,T,J,Q,K,A`; encode `AS` (ace of spades), `TD` (ten of diamonds).
- Deal exactly 13 cards to each seat using a server-side CSPRNG. Inject deterministic randomness in tests. Never reveal unrevealed cards to unauthorized clients.
- The **board** includes board number, dealer, vulnerability, hands, auction, play history, and result.
- Seat order and dealer: board 1 `N`, board 2 `E`, board 3 `S`, board 4 `W`, repeats.
- Vulnerability schedule repeats every 16 boards:

| Board | Dealer | Vulnerability |
|---:|---|---|
| 1 | N | None |
| 2 | E | NS |
| 3 | S | EW |
| 4 | W | Both |
| 5 | N | NS |
| 6 | E | EW |
| 7 | S | Both |
| 8 | W | None |
| 9 | N | EW |
| 10 | E | Both |
| 11 | S | None |
| 12 | W | NS |
| 13 | N | Both |
| 14 | E | None |
| 15 | S | NS |
| 16 | W | EW |

## 2. Auction (Bidding)

- Dealer makes first call. The turn rotates clockwise.
- A call is `PASS`, `BID(level 1..7, strain C/D/H/S/NT)`, `DOUBLE`, `REDOUBLE`.
- **35 distinct bid ranks**: level ascending 1..7; within level `C < D < H < S < NT`.
- A new bid must outrank the highest previous **bid**; Pass/Double/Redouble do not themselves raise the bid rank.
- `DOUBLE`: only when an opponents' bid is the current contract, no higher bid has replaced it, and it is not already doubled/redoubled. Current caller must be on opposing partnership to the latest **bidder**.
- `REDOUBLE`: only a player on bidding partnership when the current contract is doubled and has not been superseded by a higher bid. Once redoubled cannot be doubled again until a new bid.
- A legal non-pass call resets consecutive pass count.
- Auction ends after **three consecutive passes following any non-PASS call**. If all four seats begin with PASS, it is `PASSED_OUT` (zero score, no play).
- Final contract: highest bid with current double status (none/doubled/redoubled); partnership of the bidder owns the contract.
- **Declarer**: the first member of winning partnership to have bid the final contract's **strain** (same suit or NT) during that auction, even if another partner made final bid.
- **Dummy**: declarer's partner. **Opening leader**: defender immediately to declarer's left (next clockwise seat).

### Examples of legality

- `1C` -> `1D` legal; `1S` -> `1H` illegal; `1NT` -> `2C` legal.
- `1H` by N -> E may Double; S may not Double; E Double -> S may Redouble.
- `1H` N, `PASS` E, `2H` S, `PASS` W, `PASS` N, `PASS` E: contract 2H, **declarer N** (first NS to bid H).
- `PASS PASS PASS PASS` from dealer: passed out.

## 3. Play period

- Once contract set, defender to left of Declarer makes opening lead. **MVP simplification:** no face-down lead/clarification interval; show face-up lead immediately (documented variant of user flow). Do not misrepresent as formal duplicate tournament procedure.
- **Reveal dummy hand to all after opening lead**. Declarer controls play of dummy when dummy's turn occurs; dummy's account cannot independently select the card.
- A trick contains exactly one legal card from each seat in clockwise order, beginning with leader.
- **Follow-suit rule**: if the acting seat holds any card in the led suit, they **must** play that suit. Otherwise any card (including a trump) is legal.
- Winner = highest card of trump suit if any trump was played; otherwise highest card in originally led suit. Rank ordering `2 < ... < T < J < Q < K < A`.
- Winner leads the next trick. Exactly 13 tricks constitute a complete board; each side's trick counts sum to 13.
- Do not allow a card from an unavailable hand, double-played card, out-of-turn action, wrong seat control, or following another suit when still holding the led suit.
- `NT` has no trump. No claim/concede or undo in MVP.

## 4. Scoring: raw Duplicate board points (signed to NS)

`targetTricks = 6 + contract.level`. Declarer's partnership is vulnerable if board's vulnerability covers that partnership.

If made:

- Undoubled base contract trick points: Clubs/Diamonds 20 per bid trick; Hearts/Spades 30 per bid trick; NT 40 first bid trick + 30 per additional bid trick.
- Doubled base = 2 × undoubled base; redoubled = 4 × undoubled base.
- Contract trick points (AFTER doubles) of **100 or more** = game bonus: 300 non-vul, 500 vul; below 100 = partscore bonus 50.
- Small slam bid and made (level 6): +500 non-vul / +750 vul. Grand slam bid and made (level 7): +1000 non-vul / +1500 vul.
- Insult bonus: doubled +50, redoubled +100.
- Overtricks: undoubled each earns suit-based trick value (NT =30); doubled each 100 non-vul / 200 vul; redoubled each 200 non-vul / 400 vul.
- Slam bonus is in addition to game bonus.

If defeated:

- Undoubled penalty per undertrick: 50 non-vul / 100 vul.
- Doubled, **non-vul**: 1st 100; 2nd/3rd additional 200 each; **4th and subsequent additional** 300 each. e.g. down 1=100, 2=300, 3=500, 4=800, 5=1100.
- Doubled, **vul**: 1st 200; each additional 300. e.g. down 1=200, 2=500, 3=800.
- Redoubled penalty = 2 × doubled penalty.
- A failed contract has a negative score for declarer's partnership; no overtrick/game/partscore/slam/insult bonuses.

**Canonical signing:** function returns signed `declarerScore`. Convert to `nsScore = declarerSide === NS ? declarerScore : -declarerScore`; `ewScore = -nsScore`. `PASSED_OUT` => both zero. Session may aggregate these raw scores casually; do not label aggregate as matchpoint/IMP tournament result.

### Golden test vectors

| Contract | Vulnerable? | Tricks won by declarer | Declarer score |
|---|---|---:|---:|
| 4S undoubled | No | 10 | +420 |
| 4S undoubled | Yes | 10 | +620 |
| 3NT undoubled | No | 9 | +400 |
| 3NT undoubled | Yes | 9 | +600 |
| 2H undoubled | No | 8 | +110 |
| 2H doubled | No | 8 | +470 |
| 1NT doubled | No | 7 | +180 |
| 4S doubled | No | 8 | -300 |
| 4S doubled | Yes | 8 | -500 |
| 3NT undoubled | Yes | 8 | -100 |
| 7NT undoubled | No | 13 | +1520 |
| 7NT undoubled | Yes | 13 | +2220 |
| Passed out | Either | — | 0 |

### Tests that MUST exist

- Every 1..7 level, each strain, vulnerability condition, double/redouble in made/defeated scenarios.
- First bidder/declarer partner switching; last auction call may be Double/Redouble.
- 4 initial passes, 3 terminal passes, pass interruptions, illegal Double/Redouble.
- Trump beats led suit (unless another higher trump), no-trump winner, void-suit off-suit, lead rotation.
- Opening lead private/public timing, dummy cannot act directly, declarer can act for dummy only on dummy turn.
- All 52 cards unique; all 4 hands 13; 13 tricks; cannot replay a consumed card.
- Exact golden scoring above; negative NS mapping when EW declares.

## 5. Convention and UI caution

A bid **legality engine** is not a bidding-advice engine. Bidding systems (Standard American, Acol, etc.) are optional partnership agreements and must never be hardcoded as a reason to reject an otherwise legal bid. Do not give private team advice or hidden-information cues during the board.

## 6. Future compliance

This MVP enforces legal normal-play paths. Formal Duplicate Laws include irregularities, face-down opening lead/clarification, director rulings, infractions, unauthorized information, and claims; tournament-grade compliance must implement these separately before advertising official tournament support.
