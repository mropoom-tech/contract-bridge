import {
  cardSuit,
  partnerOf,
  nextSeat,
  resolveTrick,
  scoreBreakdown,
  trumpOf,
  validateCall,
  type AuctionState,
  type BidLevel,
  type Call,
  type Card,
  type DoubleStatus,
  type PlayedCard,
  type Seat,
  type Strain,
} from '@bridge/game-engine';

/**
 * Tutorial content. Every practice answer is computed by the real game engine
 * (trick winner, follow-suit, legal calls, scoring), so lessons can never
 * disagree with how the game is actually played and scored.
 */

export type Exercise =
  | {
      readonly kind: 'choice';
      readonly prompt: string;
      readonly options: readonly string[];
      readonly answer: number;
      readonly explain: string;
    }
  | {
      /** Which seat wins this complete trick? */
      readonly kind: 'trick';
      readonly prompt: string;
      readonly strain: Strain;
      readonly cards: readonly PlayedCard[];
      readonly explain: string;
    }
  | {
      /** Select every card you may legally play. */
      readonly kind: 'follow';
      readonly prompt: string;
      readonly hand: readonly Card[];
      readonly lead: Card;
      readonly explain: string;
    }
  | {
      /** Select every call that is legal for `seat` now. */
      readonly kind: 'bid';
      readonly prompt: string;
      readonly dealer: Seat;
      readonly history: readonly Call[];
      readonly options: readonly Call[];
      readonly explain: string;
    }
  | {
      /** Type the declaring side's duplicate score. */
      readonly kind: 'score';
      readonly prompt: string;
      readonly level: BidLevel;
      readonly strain: Strain;
      readonly doubled: DoubleStatus;
      readonly vulnerable: boolean;
      readonly tricks: number;
      readonly explain: string;
    };

export interface Lesson {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly icon: string;
  readonly sections: readonly { readonly heading: string; readonly body: readonly string[] }[];
  readonly exercises: readonly Exercise[];
}

// ---------- answer keys (engine-backed) ----------

export const trickWinner = (ex: Extract<Exercise, { kind: 'trick' }>): Seat => resolveTrick(ex.cards, trumpOf(ex.strain));

/** Follow suit if you can; otherwise any card is legal (Law 44). */
export const legalFollow = (ex: Extract<Exercise, { kind: 'follow' }>): Card[] => {
  const led = cardSuit(ex.lead);
  const same = ex.hand.filter((c) => cardSuit(c) === led);
  return same.length > 0 ? same : [...ex.hand];
};

/** Seat whose turn it is after `history`, starting from the dealer. */
export const bidSeat = (ex: Extract<Exercise, { kind: 'bid' }>): Seat =>
  ex.history.reduce<Seat>((s) => nextSeat(s), ex.dealer);

const buildAuction = (ex: Extract<Exercise, { kind: 'bid' }>): AuctionState => {
  let seat = ex.dealer;
  const calls = ex.history.map((call) => {
    const entry = { seat, call };
    seat = nextSeat(seat);
    return entry;
  });
  return { dealer: ex.dealer, calls };
};

export const legalBidOptions = (ex: Extract<Exercise, { kind: 'bid' }>): number[] => {
  const auction = buildAuction(ex);
  const seat = bidSeat(ex);
  return ex.options.flatMap((c, i) => (validateCall(auction, seat, c).ok ? [i] : []));
};

export const expectedScore = (ex: Extract<Exercise, { kind: 'score' }>): number =>
  scoreBreakdown({ level: ex.level, strain: ex.strain, doubled: ex.doubled }, ex.vulnerable, ex.tricks).total;

// ---------- content ----------

const P = (seat: Seat, card: Card): PlayedCard => ({ seat, card });
const bid = (level: BidLevel, strain: Strain): Call => ({ type: 'BID', level, strain });
const PASS: Call = { type: 'PASS' };
const DBL: Call = { type: 'DOUBLE' };
const RDBL: Call = { type: 'REDOUBLE' };

export const LESSONS: readonly Lesson[] = [
  {
    id: 'basics',
    title: 'พื้นฐานและเป้าหมายของเกม',
    summary: 'ผู้เล่น ทีม ทิศ และสิ่งที่ต้องทำให้ได้',
    icon: '🧭',
    sections: [
      {
        heading: 'ผู้เล่นและทีม',
        body: [
          'บริดจ์เล่น 4 คน นั่งตามทิศ เหนือ (N) ตะวันออก (E) ใต้ (S) ตะวันตก (W) คนที่นั่งตรงข้ามกันเป็นคู่หู (Partner)',
          'จึงมี 2 ทีม คือ เหนือ–ใต้ (NS) และ ตะวันออก–ตะวันตก (EW) การเล่นและการประมูลวนตามเข็มนาฬิกา: N → E → S → W',
        ],
      },
      {
        heading: 'หนึ่ง Board มี 2 ช่วง',
        body: [
          'ไพ่ 52 ใบแจกคนละ 13 ใบ 1) การประมูล (Auction) เพื่อตกลงว่าทีมไหนจะรับสัญญา (Contract) ว่าจะชนะกี่กอง และใช้ดอกไหนเป็นทรัมป์ หรือไม่มีทรัมป์ (NT)',
          '2) การเล่นไพ่ (Play) 13 กอง (Trick) ทีมที่ได้สัญญาพยายามทำให้ได้ตามที่ประมูล อีกทีมพยายามขัดขวาง',
        ],
      },
    ],
    exercises: [
      {
        kind: 'choice',
        prompt: 'ใครเป็นคู่หู (Partner) ของตะวันออก (E)?',
        options: ['เหนือ (N)', 'ใต้ (S)', 'ตะวันตก (W)'],
        answer: ['N', 'S', 'W'].indexOf(partnerOf('E')),
        explain: 'คู่หูคือคนที่นั่งตรงข้าม E จึงคู่กับ W เป็นทีม EW',
      },
      {
        kind: 'choice',
        prompt: 'ถ้า S เพิ่งเล่นไพ่ คนถัดไปที่ต้องเล่นคือใคร?',
        options: ['เหนือ (N)', 'ตะวันออก (E)', 'ตะวันตก (W)'],
        answer: ['N', 'E', 'W'].indexOf(nextSeat('S')),
        explain: 'เล่นวนตามเข็มนาฬิกา N → E → S → W ต่อจาก S คือ W',
      },
    ],
  },
  {
    id: 'winning',
    title: 'แพ้ชนะอย่างไร และเกมจบเมื่อไหร่',
    summary: 'เป้าหมายของแต่ละ Board และการตัดสินผลทั้งแมตช์',
    icon: '🏆',
    sections: [
      {
        heading: 'เป้าหมายในแต่ละ Board',
        body: [
          'แต่ละ Board จะมีทีมหนึ่งได้เป็น "ฝ่ายเล่นสัญญา" (Declarer กับ Dummy) อีกทีมเป็น "ฝ่ายป้องกัน"',
          'ฝ่ายเล่นสัญญาต้องชนะให้ได้อย่างน้อย 6 + ระดับที่ประมูล เช่น สัญญา 4♠ ต้องชนะ 10 กองจาก 13 กอง',
          'ทำได้ตามสัญญา → ฝ่ายเล่นสัญญาได้คะแนน · ทำไม่ได้ → ฝ่ายป้องกันได้คะแนนค่าปรับ ฝ่ายป้องกันจึงชนะ Board นั้นได้ด้วยการ "ขัด" ไม่ให้ทำถึง',
          'ยิ่งประมูลสูงแล้วทำได้ ยิ่งได้คะแนนมาก (โบนัส Game / Slam) แต่ถ้าประมูลสูงเกินแล้วทำไม่ได้จะเสียคะแนน จึงต้องประมูลให้พอดีกับไพ่ของทีม',
        ],
      },
      {
        heading: 'Board จบเมื่อไหร่',
        body: [
          'เล่นครบ 13 กอง (ไพ่หมดมือ) แล้วคิดคะแนน Board นั้นทันที',
          'ถ้าทุกคนผ่านตั้งแต่ต้น (Pass 4 ครั้ง) Board นั้นจบเลย ไม่มีใครได้คะแนน',
        ],
      },
      {
        heading: 'ทั้งแมตช์จบเมื่อไหร่ และใครชนะ',
        body: [
          'Contract Bridge (Duplicate scoring) และ Mini Bridge: เล่นครบจำนวน Board ที่ตั้งไว้ตอนสร้างห้อง แล้วรวมคะแนนทุก Board — ทีมที่คะแนนรวมมากกว่าชนะ',
          'Rubber Bridge: เล่นไปเรื่อย ๆ จนทีมใดทีมหนึ่งชนะ 2 Game (คะแนนล่างเส้นครบ 100 = 1 Game) → ได้โบนัส Rubber 700 หรือ 500 แล้วจบ — ทีมที่คะแนนรวมทั้งหมดมากกว่าเป็นผู้ชนะ',
          'Duplicate แบบทีม 2 โต๊ะ: ทั้งสองโต๊ะเล่นไพ่ชุดเดียวกันจนครบทุก Board แล้วเทียบผลทีละ Board เป็น IMPs — ทีมที่รวม IMPs มากกว่าชนะ',
        ],
      },
    ],
    exercises: [
      {
        kind: 'choice',
        prompt: 'สัญญา 3NT ฝ่ายเล่นสัญญาต้องชนะอย่างน้อยกี่กอง?',
        options: ['3 กอง', '7 กอง', '9 กอง'],
        answer: 2,
        explain: '6 + 3 = 9 กอง (กองที่เกิน 6 คือระดับที่ประมูล)',
      },
      {
        kind: 'choice',
        prompt: 'สัญญา 4♥ ฝ่ายเล่นสัญญาชนะได้ 8 กอง ใครได้คะแนน Board นี้?',
        options: ['ฝ่ายเล่นสัญญา', 'ฝ่ายป้องกัน', 'ไม่มีใครได้'],
        answer: 1,
        explain: 'ต้องทำ 10 กองแต่ได้ 8 ขาด 2 กอง ฝ่ายป้องกันได้คะแนนค่าปรับ',
      },
      {
        kind: 'choice',
        prompt: 'ใน Rubber Bridge แมตช์จบเมื่อไหร่?',
        options: ['เล่นครบ 4 Board', 'ทีมใดทีมหนึ่งชนะ 2 Game', 'ทีมใดทีมหนึ่งได้ 1,000 แต้ม'],
        answer: 1,
        explain: 'Rubber คือแข่งชนะ 2 ใน 3 Game ทีมแรกที่ชนะ 2 Game ได้โบนัส Rubber แล้วแมตช์จบ',
      },
    ],
  },
  {
    id: 'tricks',
    title: 'กอง (Trick) และลำดับไพ่',
    summary: 'ไพ่ใบไหนชนะกอง เมื่อไม่มีทรัมป์',
    icon: '🃏',
    sections: [
      {
        heading: 'ลำดับไพ่',
        body: ['ในแต่ละดอก A สูงสุด แล้ว K, Q, J, 10, 9 … ลงไปจนถึง 2 ต่ำสุด'],
      },
      {
        heading: 'การชนะกอง',
        body: [
          'แต่ละกองทุกคนลงไพ่คนละ 1 ใบ ดอกของไพ่ใบแรกเรียกว่า "ดอกที่นำ" (Led suit)',
          'ในสัญญา NT (ไม่มีทรัมป์) ไพ่ที่สูงที่สุด "ของดอกที่นำ" ชนะ ไพ่ดอกอื่นแม้จะเป็น A ก็ไม่ชนะ',
          'ผู้ชนะกองเป็นคนนำไพ่ใบแรกของกองถัดไป',
        ],
      },
    ],
    exercises: [
      {
        kind: 'trick',
        prompt: 'สัญญา NT — W นำ ♥5 ใครชนะกองนี้?',
        strain: 'NT',
        cards: [P('W', '5H'), P('N', 'KH'), P('E', 'AS'), P('S', '9H')],
        explain: 'ดอกที่นำคือ ♥ ไพ่ ♥ สูงสุดคือ K ของ N ส่วน ♠A ของ E เป็นคนละดอกจึงไม่ชนะ',
      },
      {
        kind: 'trick',
        prompt: 'สัญญา NT — N นำ ♦10 ใครชนะกองนี้?',
        strain: 'NT',
        cards: [P('N', 'TD'), P('E', '2D'), P('S', 'JD'), P('W', 'QC')],
        explain: 'ไพ่ ♦ สูงสุดคือ J ของ S',
      },
    ],
  },
  {
    id: 'follow',
    title: 'การตามดอก (Follow suit)',
    summary: 'กติกาสำคัญที่สุดในการเล่นไพ่',
    icon: '♣',
    sections: [
      {
        heading: 'ต้องตามดอกถ้ามี',
        body: [
          'ถ้าในมือมีไพ่ดอกเดียวกับที่นำ ต้องเล่นดอกนั้น (เลือกใบไหนก็ได้ในดอกนั้น)',
          'ถ้าไม่มีดอกที่นำเลย จะทิ้งไพ่ดอกอื่น (Discard) หรือตัดด้วยทรัมป์ (Ruff) ก็ได้',
          'ในเกมนี้ ไพ่ที่เล่นได้จะถูกไฮไลต์ และระบบจะไม่ยอมให้เล่นผิดกติกา',
        ],
      },
    ],
    exercises: [
      {
        kind: 'follow',
        prompt: 'มีคนนำ ♠7 เลือกไพ่ทุกใบที่คุณเล่นได้',
        hand: ['AS', '4S', 'KH', 'QD', '3C'],
        lead: '7S',
        explain: 'มี ♠ อยู่ในมือ (A และ 4) จึงต้องเล่น ♠ ใบใดใบหนึ่ง',
      },
      {
        kind: 'follow',
        prompt: 'มีคนนำ ♥Q เลือกไพ่ทุกใบที่คุณเล่นได้',
        hand: ['KS', '8S', 'AD', '5C', '2C'],
        lead: 'QH',
        explain: 'ไม่มี ♥ เลย จึงเล่นใบไหนก็ได้',
      },
    ],
  },
  {
    id: 'trumps',
    title: 'ทรัมป์ (Trump)',
    summary: 'ดอกพิเศษที่ชนะดอกอื่นทั้งหมด',
    icon: '👑',
    sections: [
      {
        heading: 'ทรัมป์ชนะทุกดอก',
        body: [
          'ถ้าสัญญามีดอกทรัมป์ เช่น 4♥ ไพ่ ♥ ทุกใบชนะไพ่ดอกอื่นทุกใบ',
          'เล่นทรัมป์ได้เมื่อไม่มีดอกที่นำ (การตัด / Ruff) หรือเมื่อทรัมป์เป็นดอกที่นำเอง',
          'ถ้ามีหลายคนลงทรัมป์ในกองเดียวกัน ทรัมป์ที่สูงที่สุดชนะ ถ้าไม่มีใครลงทรัมป์ ใช้กติกาเดิม: ไพ่สูงสุดของดอกที่นำชนะ',
        ],
      },
    ],
    exercises: [
      {
        kind: 'trick',
        prompt: 'สัญญา 4♥ — N นำ ♠A ใครชนะกองนี้?',
        strain: 'H',
        cards: [P('N', 'AS'), P('E', '2H'), P('S', 'KS'), P('W', '3S')],
        explain: 'E ไม่มี ♠ จึงตัดด้วย ♥2 ซึ่งเป็นทรัมป์ ทรัมป์ใบเล็กก็ชนะ ♠A ได้',
      },
      {
        kind: 'trick',
        prompt: 'สัญญา 3♣ — E นำ ♦K ใครชนะกองนี้?',
        strain: 'C',
        cards: [P('E', 'KD'), P('S', '4C'), P('W', 'AD'), P('N', '9C')],
        explain: 'ทั้ง S และ N ตัดด้วยทรัมป์ ♣ ใบที่สูงกว่าคือ ♣9 ของ N',
      },
    ],
  },
  {
    id: 'auction',
    title: 'การประมูล (Auction)',
    summary: 'ระดับ ลำดับดอก ผ่าน ดับเบิล รีดับเบิล',
    icon: '📣',
    sections: [
      {
        heading: 'การ Bid',
        body: [
          'Bid = ระดับ 1–7 + ดอก เช่น 2♥ หมายถึงสัญญาว่าจะชนะ 6 + 2 = 8 กอง โดยมี ♥ เป็นทรัมป์',
          'ลำดับดอกจากต่ำไปสูง: ♣ < ♦ < ♥ < ♠ < NT การ Bid ใหม่ต้องสูงกว่า Bid ล่าสุดเสมอ (ระดับสูงกว่า หรือระดับเดียวกันแต่ดอกสูงกว่า)',
          'ผู้แจก (Dealer) ประมูลก่อน แล้ววนตามเข็มนาฬิกา',
        ],
      },
      {
        heading: 'Pass, Double, Redouble',
        body: [
          'Pass (ผ่าน) ทำได้ทุกเมื่อ',
          'Double (X) ทำได้เฉพาะเมื่อ Bid ล่าสุดเป็นของฝ่ายตรงข้าม และยังไม่ถูก Double',
          'Redouble (XX) ทำได้เฉพาะเมื่อ Bid ของฝ่ายเราถูกฝ่ายตรงข้าม Double ไว้ และยังไม่มี Bid ใหม่',
          'การประมูลจบเมื่อมี Pass ติดกัน 3 ครั้งหลังจากมี Bid ถ้าทุกคน Pass ตั้งแต่ต้น 4 ครั้ง Board นั้นจะ Passed out ไม่มีคะแนน',
        ],
      },
    ],
    exercises: [
      {
        kind: 'bid',
        prompt: 'N เป็นผู้แจก ประมูลมาแล้ว: N 1♥ · E ผ่าน — ตอนนี้ตา S เลือก Call ทุกตัวที่ถูกกติกา',
        dealer: 'N',
        history: [bid(1, 'H'), PASS],
        options: [bid(1, 'D'), bid(1, 'S'), bid(2, 'C'), DBL, PASS],
        explain: '1♦ ต่ำกว่า 1♥ จึงไม่ได้ · Double ไม่ได้เพราะ 1♥ เป็นของคู่หู (N) · 1♠, 2♣ และ Pass ถูกกติกา',
      },
      {
        kind: 'bid',
        prompt: 'E เป็นผู้แจก: E 1NT · S Double — ตอนนี้ตา W เลือก Call ทุกตัวที่ถูกกติกา',
        dealer: 'E',
        history: [bid(1, 'NT'), DBL],
        options: [RDBL, DBL, bid(1, 'S'), bid(2, 'C'), PASS],
        explain: 'Redouble ได้เพราะ 1NT ของคู่หูถูกฝ่ายตรงข้าม Double · Double ซ้ำไม่ได้ · 1♠ ต่ำกว่า 1NT · 2♣ และ Pass ได้',
      },
    ],
  },
  {
    id: 'roles',
    title: 'Declarer, Dummy และการนำไพ่แรก',
    summary: 'หลังประมูลจบ ใครทำหน้าที่อะไร',
    icon: '🎭',
    sections: [
      {
        heading: 'Declarer',
        body: [
          'Declarer คือคนในทีมที่ชนะการประมูล ที่ "เอ่ยดอกของสัญญาเป็นคนแรก" ไม่จำเป็นต้องเป็นคนที่ Bid สุดท้าย',
          'ตัวอย่าง: N 1♥ … S 4♥ → Declarer คือ N เพราะ N เอ่ย ♥ ก่อน',
        ],
      },
      {
        heading: 'การนำไพ่แรกและ Dummy',
        body: [
          'คนที่นั่งทางซ้ายของ Declarer (ถัดไปตามเข็มนาฬิกา) เป็นผู้นำไพ่ใบแรก (Opening lead)',
          'หลังไพ่ใบแรกลง คู่หูของ Declarer กลายเป็น Dummy เปิดไพ่ทั้งมือให้ทุกคนเห็น และ Declarer เป็นคนเลือกไพ่ทั้งสองมือ',
        ],
      },
    ],
    exercises: [
      {
        kind: 'choice',
        prompt: 'การประมูล: N 1♠ · E ผ่าน · S 2♥ · W ผ่าน · N 4♥ · ผ่าน 3 ครั้ง ใครเป็น Declarer?',
        options: ['N', 'S', 'E'],
        answer: 1,
        explain: 'สัญญาคือ ♥ คนแรกในทีม NS ที่เอ่ย ♥ คือ S (2♥) จึงเป็น Declarer แม้ N จะ Bid 4♥ เป็นคนสุดท้าย',
      },
      {
        kind: 'choice',
        prompt: 'ถ้า S เป็น Declarer ใครนำไพ่ใบแรก และใครเป็น Dummy?',
        options: ['W นำ · N เป็น Dummy', 'E นำ · N เป็น Dummy', 'N นำ · W เป็น Dummy'],
        answer: nextSeat('S') === 'W' && partnerOf('S') === 'N' ? 0 : -1,
        explain: 'ผู้นำไพ่แรกคือคนทางซ้ายของ Declarer (S → W) Dummy คือคู่หูของ Declarer (N)',
      },
    ],
  },
  {
    id: 'score-basics',
    title: 'การคิดคะแนน',
    summary: 'คะแนนสัญญา Game โบนัส และค่าปรับ',
    icon: '🧮',
    sections: [
      {
        heading: 'ทำสัญญาได้',
        body: [
          'คะแนนสัญญา (ล่างเส้น): ♣/♦ กองละ 20 · ♥/♠ กองละ 30 · NT กองแรก 40 กองต่อไป 30 (นับเฉพาะกองที่เกิน 6)',
          'ถ้าคะแนนสัญญาถึง 100 = Game ได้โบนัส 300 (ไม่ Vul) / 500 (Vul) ถ้าไม่ถึง = Partscore ได้ 50',
          'Game ที่พบบ่อย: 3NT (100), 4♥/4♠ (120), 5♣/5♦ (100)',
          'Overtrick คิดตามค่าดอก · Slam: ระดับ 6 = 500/750 · ระดับ 7 = 1000/1500',
        ],
      },
      {
        heading: 'ทำสัญญาไม่ได้',
        body: [
          'ฝ่ายป้องกันได้คะแนนตามจำนวนกองที่ขาด: ไม่ Double กองละ 50 (ไม่ Vul) / 100 (Vul)',
          'ดูตารางเต็มทั้งกรณี Double/Redouble ได้ที่หน้า "ตารางคะแนน"',
        ],
      },
    ],
    exercises: [
      {
        kind: 'score',
        prompt: '4♠ ไม่ Vul ทำได้พอดี 10 กอง ฝ่าย Declarer ได้กี่คะแนน?',
        level: 4,
        strain: 'S',
        doubled: 0,
        vulnerable: false,
        tricks: 10,
        explain: '30 × 4 = 120 (ถึง Game) + โบนัส Game 300 = 420',
      },
      {
        kind: 'score',
        prompt: '2♦ Vul ทำได้ 9 กอง (เกิน 1) ได้กี่คะแนน?',
        level: 2,
        strain: 'D',
        doubled: 0,
        vulnerable: true,
        tricks: 9,
        explain: '20 × 2 = 40 + Overtrick 20 + Partscore 50 = 110',
      },
      {
        kind: 'score',
        prompt: '3NT Vul ทำได้แค่ 7 กอง (ขาด 2) ฝ่าย Declarer ได้กี่คะแนน? (ใส่ค่าติดลบ)',
        level: 3,
        strain: 'NT',
        doubled: 0,
        vulnerable: true,
        tricks: 7,
        explain: 'ขาด 2 กอง × 100 (Vul) = −200',
      },
    ],
  },
];
