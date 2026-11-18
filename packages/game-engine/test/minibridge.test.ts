import { describe, expect, it } from 'vitest';
import {
  boardDeclareMini,
  boardPlay,
  createMiniBoard,
  createMiniBoardWithDeal,
  createSeededRandom,
  deal,
  handHcp,
  isValidDeal,
  legalCards,
  miniInfo,
  miniLevel,
  projectBoardForSeat,
  seatToPlay,
  controllingSeat,
  type Card,
  type Hands,
} from '../src/index.js';

// N: all 4 aces + 4 kings (28 HCP) → NS declares, N is declarer.
const STRONG_N: Hands = {
  N: ['AS', 'AH', 'AD', 'AC', 'KS', 'KH', 'KD', 'KC', '2S', '3S', '4S', '5S', '6S'],
  E: ['QS', 'QH', 'QD', 'QC', '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', 'TH'],
  S: ['JS', 'JH', 'JD', 'JC', '2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D', 'TD'],
  W: ['7S', '8S', '9S', 'TS', '2C', '3C', '4C', '5C', '6C', '7C', '8C', '9C', 'TC'],
};

describe('Mini Bridge', () => {
  it('counts high-card points A4 K3 Q2 J1', () => {
    expect(handHcp(['AS', 'KH', 'QD', 'JC', '2S'])).toBe(10);
    expect(Object.values(miniInfo(STRONG_N, 'N').hcp).reduce((a, b) => a + b, 0)).toBe(40);
  });

  it('declarer is the stronger player of the stronger side; ties go to the seat nearer the dealer', () => {
    expect(miniInfo(STRONG_N, 'N')).toEqual({ hcp: { N: 28, E: 8, S: 4, W: 0 }, declarer: 'N' });
    // Equal points inside the declaring side: first clockwise from the dealer.
    const tie: Hands = {
      N: ['AS', 'KS', 'QS', 'JS', 'AH', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S'],
      S: ['AD', 'KD', 'QD', 'JD', 'AC', '2D', '3D', '4D', '5D', '6D', '7D', '8D', '9D'],
      E: ['KH', 'QH', 'JH', 'KC', 'QC', 'JC', '2H', '3H', '4H', '5H', '6H', '7H', '8H'],
      W: ['TS', 'TH', 'TD', 'TC', '9H', '9C', '2C', '3C', '4C', '5C', '6C', '7C', '8C'],
    };
    expect(isValidDeal(tie)).toBe(true);
    const info = miniInfo(tie, 'E'); // N=14, S=14, NS=28
    expect(info.hcp.N).toBe(info.hcp.S);
    expect(info.declarer).toBe('S'); // from E clockwise: S comes before N
    expect(miniInfo(tie, 'W').declarer).toBe('N');
  });

  it('20–20 is passed out', () => {
    for (let seed = 1; seed < 500; seed++) {
      const hands = deal(createSeededRandom(seed));
      const ns = handHcp(hands.N) + handHcp(hands.S);
      if (ns !== 20) continue;
      const b = createMiniBoardWithDeal(1, hands);
      expect(b.phase).toBe('COMPLETED');
      expect(b.result).toEqual({ kind: 'PASSED_OUT', nsScore: 0, ewScore: 0 });
      return;
    }
    throw new Error('no 20-20 deal found in seeds');
  });

  it('part-score is the 1-level; game is 3NT / 4 major / 5 minor', () => {
    expect([miniLevel('NT', false), miniLevel('NT', true), miniLevel('H', true), miniLevel('S', true), miniLevel('C', true), miniLevel('D', true)]).toEqual([
      1, 3, 4, 4, 5, 5,
    ]);
  });

  it('dummy is face up while declarer chooses; only declarer may choose; LHO leads', () => {
    const b = createMiniBoardWithDeal(1, STRONG_N);
    expect(b.phase).toBe('DECLARING');
    const eastView = projectBoardForSeat(b, 'E');
    expect(eastView.dummyHand).toEqual([...STRONG_N.S]);
    expect(eastView.toAct).toBe('N');
    expect(eastView.miniChoices).toEqual([]);
    expect(projectBoardForSeat(b, 'N').miniChoices).toHaveLength(10);
    expect(boardDeclareMini(b, 'S', 'NT', true)).toMatchObject({ ok: false, error: { code: 'NOT_YOUR_TURN' } });
    const r = boardDeclareMini(b, 'N', 'S', true);
    if (!r.ok) throw new Error(r.error.message);
    const play = r.value.play;
    expect(play?.contract).toMatchObject({ level: 4, strain: 'S', declarer: 'N', dummy: 'S', openingLeader: 'E', doubled: 0 });
    // dummy visible before the opening lead
    expect(projectBoardForSeat(r.value, 'W').dummyHand).toHaveLength(13);
    expect(boardDeclareMini(r.value, 'N', 'S', true).ok).toBe(false);
  });

  it('plays out to a scored result', () => {
    const r = boardDeclareMini(createMiniBoardWithDeal(1, STRONG_N), 'N', 'NT', false);
    if (!r.ok) throw new Error(r.error.message);
    let b = r.value;
    while (b.phase === 'PLAYING' && b.play) {
      const actor = controllingSeat(b.play);
      const card = legalCards(b.play)[0] as Card;
      if (!actor || !seatToPlay(b.play)) throw new Error('stuck');
      const n = boardPlay(b, actor, card);
      if (!n.ok) throw new Error(n.error.message);
      b = n.value;
    }
    expect(b.phase).toBe('COMPLETED');
    expect(b.result?.kind).toBe('PLAYED');
  });

  it('random deals always produce a consistent board', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const b = createMiniBoard(1 + (seed % 16), createSeededRandom(seed));
      expect(['DECLARING', 'COMPLETED']).toContain(b.phase);
      if (b.phase === 'DECLARING') {
        const d = b.mini?.declarer;
        expect(d).toBeTruthy();
      }
    }
  });
});
