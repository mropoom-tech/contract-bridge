import { scoreBreakdown, type ScoringContract, type Strain } from '@bridge/game-engine';

/**
 * Explains a duplicate-bridge score item by item, split into
 * "below the line" (contract trick points, which count toward game) and
 * "above the line" (overtricks, bonuses and undertrick penalties).
 * Pure: every number comes from the engine's `scoreBreakdown`, the text only
 * shows how that number is produced.
 */
export type ScoreLine = 'below' | 'above';

export interface ScoreItem {
  readonly key: 'contract' | 'overtricks' | 'game' | 'partscore' | 'slam' | 'insult' | 'undertricks';
  readonly label: string;
  readonly line: ScoreLine;
  /** Signed from the declaring side's point of view. */
  readonly value: number;
  /** How this board's number was computed, with the actual figures. */
  readonly formula: string;
  /** The general rule / scoring table for this item. */
  readonly rule: string;
}

export interface ScoreExplanation {
  readonly made: boolean;
  readonly items: readonly ScoreItem[];
  readonly below: number;
  readonly above: number;
  readonly total: number;
}

const STRAIN_TH: Record<Strain, string> = { C: '♣ Clubs', D: '♦ Diamonds', H: '♥ Hearts', S: '♠ Spades', NT: 'NT' };
const isMinor = (s: Strain) => s === 'C' || s === 'D';
const perTrick = (s: Strain) => (isMinor(s) ? 20 : 30);
const dblWord = (d: 0 | 1 | 2) => (d === 1 ? ' ×2 (Double)' : d === 2 ? ' ×4 (Redouble)' : '');

const RULE = {
  contract:
    'คะแนนต่อกองที่ประมูลไว้ (เกิน 6 กอง): ♣/♦ = 20, ♥/♠ = 30, NT = 40 กองแรก และ 30 กองถัดไป · Double ×2 · Redouble ×4 · เป็นคะแนน "ล่างเส้น" ที่นับเข้า Game',
  overtricks:
    'กองที่ทำได้เกินสัญญา: ไม่ Double = คิดตามค่าดอก (20/30/30) · Double = 100 ต่อกอง (Non-vul) / 200 (Vul) · Redouble = 200 / 400',
  game: 'ถ้าคะแนนสัญญา (ล่างเส้น) ตั้งแต่ 100 ขึ้นไป = ทำ Game ได้โบนัส 300 (Non-vul) หรือ 500 (Vul)',
  partscore: 'ถ้าคะแนนสัญญาต่ำกว่า 100 = Partscore ได้โบนัส 50',
  slam: 'Small Slam (ระดับ 6) = 500 / 750 (Vul) · Grand Slam (ระดับ 7) = 1000 / 1500 (Vul)',
  insult: 'ทำสัญญาที่ถูก Double ได้ +50 · ถูก Redouble ได้ +100',
  undertricks:
    'ทำไม่ถึงสัญญา ฝ่ายป้องกันได้คะแนน · ไม่ Double: 50 ต่อกอง (Non-vul) / 100 (Vul) · Double Non-vul: กองแรก 100, กอง 2–3 กองละ 200, ตั้งแต่กอง 4 กองละ 300 · Double Vul: กองแรก 200, ถัดไปกองละ 300 · Redouble = ×2 ของ Double',
} as const;

const contractFormula = (c: ScoringContract): string => {
  const base =
    c.strain === 'NT'
      ? c.level === 1
        ? '40 (กองแรก NT)'
        : `40 + 30 × ${c.level - 1}`
      : `${perTrick(c.strain)} × ${c.level} กอง (${STRAIN_TH[c.strain]})`;
  return `${base}${dblWord(c.doubled)}`;
};

const undertrickFormula = (down: number, vul: boolean, d: 0 | 1 | 2): string => {
  if (d === 0) return `${down} กอง × ${vul ? 100 : 50}`;
  const steps: number[] = [];
  for (let i = 1; i <= down; i++) {
    steps.push(vul ? (i === 1 ? 200 : 300) : i === 1 ? 100 : i <= 3 ? 200 : 300);
  }
  return `${steps.join(' + ')}${d === 2 ? ' แล้ว ×2 (Redouble)' : ''} (Double${vul ? ', Vul' : ''})`;
};

export const explainScore = (contract: ScoringContract, vulnerable: boolean, tricks: number): ScoreExplanation => {
  const b = scoreBreakdown(contract, vulnerable, tricks);
  const items: ScoreItem[] = [];
  if (!b.made) {
    items.push({
      key: 'undertricks',
      label: 'ค่าปรับ Undertrick',
      line: 'above',
      value: b.undertrickPenalty,
      formula: undertrickFormula(-b.overUnder, vulnerable, contract.doubled),
      rule: RULE.undertricks,
    });
  } else {
    items.push({ key: 'contract', label: 'คะแนนสัญญา', line: 'below', value: b.contractPoints, formula: contractFormula(contract), rule: RULE.contract });
    if (b.overtrickPoints > 0) {
      const over = b.overUnder;
      const each = contract.doubled === 0 ? perTrick(contract.strain) : (vulnerable ? 200 : 100) * (contract.doubled === 2 ? 2 : 1);
      items.push({ key: 'overtricks', label: 'Overtrick', line: 'above', value: b.overtrickPoints, formula: `${over} กอง × ${each}`, rule: RULE.overtricks });
    }
    if (b.gameBonus > 0)
      items.push({ key: 'game', label: 'โบนัส Game', line: 'above', value: b.gameBonus, formula: `คะแนนสัญญา ${b.contractPoints} ≥ 100 · ${vulnerable ? 'Vul' : 'Non-vul'}`, rule: RULE.game });
    if (b.partscoreBonus > 0)
      items.push({ key: 'partscore', label: 'โบนัส Partscore', line: 'above', value: b.partscoreBonus, formula: `คะแนนสัญญา ${b.contractPoints} < 100`, rule: RULE.partscore });
    if (b.slamBonus > 0)
      items.push({
        key: 'slam',
        label: 'โบนัส Slam',
        line: 'above',
        value: b.slamBonus,
        formula: `${contract.level === 7 ? 'Grand' : 'Small'} Slam · ${vulnerable ? 'Vul' : 'Non-vul'}`,
        rule: RULE.slam,
      });
    if (b.insultBonus > 0)
      items.push({ key: 'insult', label: 'โบนัส Double/Redouble', line: 'above', value: b.insultBonus, formula: contract.doubled === 2 ? 'Redouble' : 'Double', rule: RULE.insult });
  }
  const below = items.filter((i) => i.line === 'below').reduce((s, i) => s + i.value, 0);
  const above = items.filter((i) => i.line === 'above').reduce((s, i) => s + i.value, 0);
  if (below + above !== b.total) throw new Error('score explanation does not add up');
  return { made: b.made, items, below, above, total: b.total };
};
