import { useState } from 'react';
import { scoreBreakdown, type Call, type Card, type DoubleStatus, type Seat } from '@bridge/game-engine';
import { CardFace } from '../components/CardFace';
import { ScoreCalculator } from '../components/ScoreCalculator';
import { Button, Panel } from '../components/ui';
import { t } from '../i18n/th';
import { callText } from '../lib/cards';
import { bidSeat, expectedScore, LESSONS, legalBidOptions, legalFollow, trickWinner, type Exercise, type Lesson } from '../lib/lessons';
import { navigate } from '../lib/router';
import { AppShell } from './AppShell';

// ---------- progress (per-browser convenience only) ----------

const KEY = 'bridge:lessons-done';
const readDone = (): string[] => {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const markDone = (id: string) => {
  try {
    const d = new Set(readDone());
    d.add(id);
    localStorage.setItem(KEY, JSON.stringify([...d]));
  } catch {
    /* storage unavailable: progress just isn't remembered */
  }
};

const Link = ({ to, children, className = '' }: { to: string; children: React.ReactNode; className?: string }) => (
  <a
    href={to}
    onClick={(e) => {
      e.preventDefault();
      navigate(to);
      window.scrollTo(0, 0);
    }}
    className={className}
  >
    {children}
  </a>
);

// ---------- index ----------

export const LearnIndexPage = () => {
  const done = readDone();
  const count = LESSONS.filter((l) => done.includes(l.id)).length;
  return (
    <AppShell wide>
      <div className="space-y-6">
        <header className="space-y-2">
          <p className="text-sm font-semibold text-gold-300">{t.learn.kicker}</p>
          <h1 className="text-3xl font-bold sm:text-4xl">{t.learn.title}</h1>
          <p className="text-ivory-200/80">{t.learn.subtitle}</p>
          <div className="flex items-center gap-3 pt-2 text-sm text-ivory-200/80">
            <span>{t.learn.progress(count, LESSONS.length)}</span>
            <div className="h-2 w-48 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={LESSONS.length} aria-valuenow={count}>
              <div className="h-full bg-gold-400 transition-all" style={{ width: `${(count / LESSONS.length) * 100}%` }} />
            </div>
          </div>
        </header>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LESSONS.map((l, i) => (
            <li key={l.id}>
              <Link
                to={`/learn/${l.id}`}
                className="group block h-full rounded-2xl border border-white/10 bg-charcoal-900/85 p-5 transition hover:-translate-y-0.5 hover:border-gold-400/60 focus-visible:outline-2 focus-visible:outline-gold-400"
              >
                <div className="flex items-start justify-between">
                  <span className="text-3xl font-bold text-gold-300">{i + 1}</span>
                  {done.includes(l.id) && <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-xs">✓ {t.learn.done}</span>}
                </div>
                <h2 className="mt-3 text-lg font-semibold">
                  <span aria-hidden="true">{l.icon}</span> {l.title}
                </h2>
                <p className="text-sm text-ivory-200/75">{l.summary}</p>
                <p className="mt-3 text-sm font-semibold text-gold-300">
                  {t.learn.start} ▸ · {t.learn.exercises(l.exercises.length)}
                </p>
              </Link>
            </li>
          ))}
          <li>
            <Link
              to="/learn/scoring"
              className="block h-full rounded-2xl border border-gold-400/40 bg-gold-400/10 p-5 transition hover:-translate-y-0.5 hover:border-gold-400 focus-visible:outline-2 focus-visible:outline-gold-400"
            >
              <span className="text-3xl" aria-hidden="true">
                📊
              </span>
              <h2 className="mt-3 text-lg font-semibold">{t.learn.scoringRef}</h2>
              <p className="text-sm text-ivory-200/75">{t.learn.scoringRefSummary}</p>
            </Link>
          </li>
        </ol>
      </div>
    </AppShell>
  );
};

// ---------- exercises ----------

type Status = 'idle' | 'right' | 'wrong';

const Feedback = ({ status, explain }: { status: Status; explain: string }) =>
  status === 'idle' ? null : (
    <div role="status" className={`rounded-lg px-3 py-2 text-sm ${status === 'right' ? 'bg-emerald-900/60 text-emerald-100' : 'bg-red-950/60 text-red-100'}`}>
      <strong>{status === 'right' ? t.learn.correct : t.learn.tryAgain}</strong>
      {status === 'right' && <p className="mt-1">{explain}</p>}
    </div>
  );

const sameSet = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((x) => b.includes(x));

const SEAT_OPTIONS: readonly Seat[] = ['N', 'E', 'S', 'W'];

const ExerciseCard = ({ ex, n, onSolved }: { ex: Exercise; n: number; onSolved: () => void }) => {
  const [status, setStatus] = useState<Status>('idle');
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState('');
  const judge = (ok: boolean) => {
    setStatus(ok ? 'right' : 'wrong');
    if (ok) onSolved();
  };
  const toggle = (i: number) => {
    setStatus('idle');
    setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  };

  let body: React.ReactNode;
  if (ex.kind === 'choice') {
    body = (
      <div className="flex flex-wrap gap-2">
        {ex.options.map((o, i) => (
          <Button key={o} variant="secondary" onClick={() => judge(i === ex.answer)}>
            {o}
          </Button>
        ))}
      </div>
    );
  } else if (ex.kind === 'trick') {
    const winner = trickWinner(ex);
    body = (
      <>
        <ol className="flex flex-wrap gap-3">
          {ex.cards.map((pc, i) => (
            <li key={pc.card} className="flex flex-col items-center gap-1 text-xs">
              <CardFace card={pc.card} size="md" />
              <span>
                {i === 0 ? `${t.learn.leads} ` : ''}
                {pc.seat}
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          {SEAT_OPTIONS.map((s) => (
            <Button key={s} variant="secondary" onClick={() => judge(s === winner)}>
              {t.seatName[s]} ({s})
            </Button>
          ))}
        </div>
      </>
    );
  } else if (ex.kind === 'follow') {
    const legal = legalFollow(ex);
    const chosen = picked.map((i) => ex.hand[i]).filter((c): c is Card => c !== undefined);
    body = (
      <>
        <div className="flex items-center gap-3 text-sm">
          <span>{t.learn.ledCard}</span>
          <CardFace card={ex.lead} size="sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          {ex.hand.map((c, i) => (
            <CardFace key={c} card={c} size="lg" onSelect={() => toggle(i)} playable selected={picked.includes(i)} />
          ))}
        </div>
        <Button variant="primary" disabled={picked.length === 0} onClick={() => judge(sameSet(chosen, legal))}>
          {t.learn.check}
        </Button>
      </>
    );
  } else if (ex.kind === 'bid') {
    const legal = legalBidOptions(ex);
    body = (
      <>
        <p className="text-sm text-ivory-200/80">
          {t.learn.turnOf} {t.seatName[bidSeat(ex)]} ({bidSeat(ex)})
        </p>
        <div className="flex flex-wrap gap-2">
          {ex.options.map((c, i) => (
            <button
              key={i}
              type="button"
              aria-pressed={picked.includes(i)}
              onClick={() => toggle(i)}
              className={`min-h-11 min-w-14 rounded-lg border px-3 font-semibold ${picked.includes(i) ? 'border-gold-400 bg-gold-400 text-charcoal-950' : 'border-white/15 bg-white/10'}`}
            >
              {callText(toPayload(c))}
            </button>
          ))}
        </div>
        <Button variant="primary" disabled={picked.length === 0} onClick={() => judge(sameSet(picked, legal))}>
          {t.learn.check}
        </Button>
      </>
    );
  } else {
    const want = expectedScore(ex);
    body = (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          judge(Number(text.trim().replace('−', '-')) === want);
        }}
      >
        <label className="sr-only" htmlFor={`score-${n}`}>
          {t.learn.yourAnswer}
        </label>
        <input
          id={`score-${n}`}
          inputMode="numeric"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setStatus('idle');
          }}
          className="min-h-11 w-32 rounded-lg border border-white/15 bg-charcoal-950 px-3 text-lg tabular-nums"
          placeholder="0"
        />
        <Button type="submit" variant="primary" disabled={text.trim() === ''}>
          {t.learn.check}
        </Button>
      </form>
    );
  }

  return (
    <Panel className={status === 'right' ? 'border-emerald-500/50' : ''}>
      <div className="space-y-3">
        <p className="font-semibold">
          <span className="mr-2 text-gold-300">
            {t.learn.exercise} {n}
          </span>
          {ex.prompt}
        </p>
        {body}
        <Feedback status={status} explain={ex.explain} />
      </div>
    </Panel>
  );
};

const toPayload = (c: Call) => (c.type === 'BID' ? { kind: 'BID' as const, level: c.level, strain: c.strain } : { kind: c.type });

// ---------- lesson ----------

const LessonBody = ({ lesson, index }: { lesson: Lesson; index: number }) => {
  const [solved, setSolved] = useState<Set<number>>(new Set());
  const allSolved = solved.size === lesson.exercises.length;
  const next = LESSONS[index + 1];
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link to="/learn" className="text-sm text-gold-300 hover:underline">
        ← {t.learn.backToLessons}
      </Link>
      <header>
        <p className="text-sm text-gold-300">
          {t.learn.lesson} {index + 1}/{LESSONS.length}
        </p>
        <h1 className="text-3xl font-bold">
          <span aria-hidden="true">{lesson.icon}</span> {lesson.title}
        </h1>
      </header>
      {lesson.sections.map((s) => (
        <section key={s.heading} className="space-y-2">
          <h2 className="text-xl font-semibold text-gold-300">{s.heading}</h2>
          {s.body.map((p) => (
            <p key={p} className="leading-relaxed text-ivory-100/90">
              {p}
            </p>
          ))}
        </section>
      ))}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-gold-300">{t.learn.practice}</h2>
        {lesson.exercises.map((ex, i) => (
          <ExerciseCard
            key={`${lesson.id}-${i}`}
            ex={ex}
            n={i + 1}
            onSolved={() =>
              setSolved((s) => {
                const n = new Set(s).add(i);
                if (n.size === lesson.exercises.length) markDone(lesson.id);
                return n;
              })
            }
          />
        ))}
      </section>
      {allSolved && (
        <Panel className="border-emerald-500/50 text-center">
          <p className="mb-3 text-lg font-semibold">🎉 {t.learn.lessonComplete}</p>
          {next ? (
            <Button variant="primary" onClick={() => navigate(`/learn/${next.id}`)}>
              {t.learn.nextLesson}: {next.title}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => navigate('/learn/scoring')}>
              {t.learn.scoringRef}
            </Button>
          )}
        </Panel>
      )}
    </div>
  );
};

export const LessonPage = ({ id }: { id: string }) => {
  const index = LESSONS.findIndex((l) => l.id === id);
  const lesson = LESSONS[index];
  return (
    <AppShell>
      {lesson ? (
        <LessonBody key={lesson.id} lesson={lesson} index={index} />
      ) : (
        <div className="space-y-4">
          <p>{t.notFound}</p>
          <Button onClick={() => navigate('/learn')}>{t.learn.backToLessons}</Button>
        </div>
      )}
    </AppShell>
  );
};

// ---------- scoring reference (all figures computed by the engine) ----------

type Lv = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const total = (level: Lv, strain: 'C' | 'D' | 'H' | 'S' | 'NT', doubled: DoubleStatus, vul: boolean, tricks: number) =>
  scoreBreakdown({ level, strain, doubled }, vul, tricks).total;
const isGame = (level: Lv, strain: 'C' | 'H' | 'NT') => scoreBreakdown({ level, strain, doubled: 0 }, false, 6 + level).gameBonus > 0;

const Th = ({ children, className = '', colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) => (
  <th colSpan={colSpan} className={`px-2 py-2 text-center text-xs font-semibold sm:text-sm ${className}`}>
    {children}
  </th>
);
const Td = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <td className={`px-2 py-2 text-center tabular-nums ${className}`}>{children}</td>
);

const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-20 space-y-3">
    <h2 className="text-xl font-bold text-gold-300">{title}</h2>
    {children}
  </section>
);

const NAV = [
  ['calc', '🧮 เครื่องคิดเลข'],
  ['steps', '① วิธีคิด 3 ขั้น'],
  ['tricks', '② คะแนนต่อกอง'],
  ['bonus', '③ โบนัส'],
  ['made', '④ ตารางเมื่อทำได้'],
  ['down', '⑤ ค่าปรับ'],
] as const;

export const ScoringReferencePage = () => {
  const levels: readonly Lv[] = [1, 2, 3, 4, 5, 6, 7];
  const downs = [1, 2, 3, 4, 5, 6] as const;
  const groups = [
    ['C', '♣ ♦'],
    ['H', '♥ ♠'],
    ['NT', 'NT'],
  ] as const;
  return (
    <AppShell wide>
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="space-y-2">
          <Link to="/learn" className="text-sm text-gold-300 hover:underline">
            ← {t.learn.backToLessons}
          </Link>
          <h1 className="text-3xl font-bold">{t.learn.scoringRef}</h1>
          <p className="text-ivory-200/80">{t.learn.scoringRefIntro}</p>
          <nav aria-label="สารบัญ" className="flex flex-wrap gap-2 pt-1">
            {NAV.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-sm hover:border-gold-400">
                {label}
              </a>
            ))}
          </nav>
        </div>

        <div id="calc" className="scroll-mt-20">
          <ScoreCalculator />
        </div>

        <Section id="steps" title="① วิธีคิดคะแนน 3 ขั้น">
          <ol className="grid gap-3 md:grid-cols-3">
            {[
              ['1', 'คะแนนสัญญา', 'ล่างเส้น', 'นับเฉพาะกองที่ประมูลไว้ (เกิน 6 กอง) ตามค่าของดอก — ถ้ารวมได้ 100 ขึ้นไปคือ "Game"', 'border-sky-400/50'],
              ['2', 'โบนัส', 'บนเส้น', 'Game หรือ Partscore, Slam, Overtrick และโบนัสเมื่อทำได้ทั้งที่ถูก Double', 'border-emerald-400/50'],
              ['3', 'ถ้าทำไม่ได้', 'ค่าปรับ', 'ไม่ได้คะแนนสัญญาเลย ฝ่ายป้องกันได้คะแนนตามจำนวนกองที่ขาด', 'border-red-400/50'],
            ].map(([n, title, tag, body, border]) => (
              <li key={n} className={`rounded-xl border-l-4 bg-charcoal-900/85 p-4 ${border}`}>
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-white/15 text-sm font-bold">{n}</span>
                  <h3 className="font-semibold">{title}</h3>
                  <span className="ml-auto rounded-full bg-black/30 px-2 text-xs text-ivory-200/80">{tag}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ivory-200/85">{body}</p>
              </li>
            ))}
          </ol>
          <Panel>
            <p className="text-sm">
              <strong className="text-gold-300">ตัวอย่าง:</strong> 4♥ ไม่ Vul ทำได้พอดี 10 กอง → คะแนนสัญญา 4 × 30 = <strong>120</strong> (ถึง 100 = Game)
              + โบนัส Game <strong>300</strong> = <strong className="text-emerald-300">420</strong>
            </p>
          </Panel>
        </Section>

        <Section id="tricks" title="② คะแนนต่อกอง (ล่างเส้น)">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['♣ ♦', 'Minor', '20', 'ต่อกอง', 'Game ที่ระดับ 5 (5 × 20 = 100)'],
              ['♥ ♠', 'Major', '30', 'ต่อกอง', 'Game ที่ระดับ 4 (4 × 30 = 120)'],
              ['NT', 'No Trump', '40 / 30', 'กองแรก / กองต่อไป', 'Game ที่ระดับ 3 (40 + 30 + 30 = 100)'],
            ].map(([sym, name, val, unit, game]) => (
              <div key={name} className="rounded-xl border border-white/10 bg-charcoal-900/85 p-4 text-center">
                <div className="text-2xl">
                  {sym.split(' ').map((x) => (
                    <span key={x} className={x === '♦' || x === '♥' ? 'text-red-400' : ''}>
                      {x}{' '}
                    </span>
                  ))}
                </div>
                <div className="text-xs text-ivory-200/60">{name}</div>
                <div className="mt-2 text-3xl font-bold text-gold-300">{val}</div>
                <div className="text-xs text-ivory-200/70">{unit}</div>
                <div className="mt-2 rounded-md bg-black/30 px-2 py-1 text-xs">{game}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-ivory-200/75">ถูก Double คะแนนสัญญา ×2 · Redouble ×4 (เช่น 2♠X = 2 × 30 × 2 = 120 → กลายเป็น Game)</p>
        </Section>

        <Section id="bonus" title="③ โบนัส (บนเส้น)">
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-charcoal-900/85">
            <table className="w-full min-w-[22rem] text-sm">
              <thead className="bg-black/30">
                <tr>
                  <Th className="text-left">{t.learn.refItem}</Th>
                  <Th>ไม่ Vul</Th>
                  <Th className="text-red-300">Vul</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {t.learn.refBonusRows.map(([k, a, b]) => (
                  <tr key={k} className="hover:bg-white/5">
                    <Td className="text-left">{k}</Td>
                    <Td className="font-semibold">{a}</Td>
                    <Td className="font-semibold text-red-200">{b}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="made" title="④ คะแนนรวมเมื่อทำได้พอดีสัญญา (ไม่ Double)">
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-white/10" /> Partscore
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-gold-400/40" /> Game
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-emerald-500/40" /> Slam
            </span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-charcoal-900/85">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-black/30">
                <tr>
                  <Th />
                  <Th colSpan={3} className="border-l border-white/10">
                    ไม่ Vul
                  </Th>
                  <Th colSpan={3} className="border-l border-white/10 text-red-300">
                    Vul
                  </Th>
                </tr>
                <tr>
                  <Th>{t.learn.refLevel}</Th>
                  {[false, true].flatMap((vul) =>
                    groups.map(([s, label], i) => (
                      <Th key={`${vul}${s}`} className={i === 0 ? 'border-l border-white/10' : ''}>
                        {label}
                      </Th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {levels.map((lv) => (
                  <tr key={lv}>
                    <Td className="font-bold">{lv}</Td>
                    {[false, true].flatMap((vul) =>
                      groups.map(([s], i) => {
                        const tone = lv >= 6 ? 'bg-emerald-500/25' : isGame(lv, s) ? 'bg-gold-400/25 font-semibold' : '';
                        return (
                          <Td key={`${vul}${s}`} className={`${tone} ${i === 0 ? 'border-l border-white/10' : ''}`}>
                            {total(lv, s, 0, vul, 6 + lv)}
                          </Td>
                        );
                      }),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ivory-200/70">{t.learn.refMadeNote}</p>
        </Section>

        <Section id="down" title="⑤ ค่าปรับเมื่อทำไม่ได้ (ฝ่ายป้องกันได้)">
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-charcoal-900/85">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="bg-black/30">
                <tr>
                  <Th />
                  <Th colSpan={3} className="border-l border-white/10">
                    ไม่ Vul
                  </Th>
                  <Th colSpan={3} className="border-l border-white/10 text-red-300">
                    Vul
                  </Th>
                </tr>
                <tr>
                  <Th>{t.learn.refDown}</Th>
                  {[false, true].flatMap((vul) =>
                    ['ปกติ', 'X', 'XX'].map((h, i) => (
                      <Th key={`${vul}${h}`} className={i === 0 ? 'border-l border-white/10' : ''}>
                        {h}
                      </Th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {downs.map((d) => (
                  <tr key={d}>
                    <Td className="font-bold">−{d}</Td>
                    {[false, true].flatMap((vul) =>
                      ([0, 1, 2] as const).map((dbl) => (
                        <Td key={`${vul}${dbl}`} className={dbl === 0 ? 'border-l border-white/10' : ''}>
                          {-total(7, 'NT', dbl, vul, 13 - d)}
                        </Td>
                      )),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ivory-200/70">{t.learn.refPenaltyNote}</p>
        </Section>

        <Panel title={t.learn.refLines}>
          <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {t.learn.refLinesBody.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </AppShell>
  );
};
