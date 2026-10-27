import type { ReactNode } from 'react';
import type { Card, CardFace } from '@nomercy/shared';
import { PlayingCard } from '../card/PlayingCard';
import { Modal } from '../ui/Modal';

const sample = (card: CardFace): Card => ({ ...card, id: `crule${card.kind}` }) as Card;

const CARD_RULES: Array<{ card: Card; text: ReactNode }> = [
  { card: sample({ kind: 'skip', color: 'blue' }), text: 'Next player loses their turn.' },
  {
    card: sample({ kind: 'reverse', color: 'green' }),
    text: 'Reverse direction. With 2 players it acts as a Skip.',
  },
  {
    card: sample({ kind: 'draw2', color: 'red' }),
    text: 'Next player draws 2 and loses their turn (stackable).',
  },
  {
    card: sample({ kind: 'draw4', color: 'yellow' }),
    text: 'Next player draws 4 and loses their turn (stackable).',
  },
  {
    card: sample({ kind: 'discardAll', color: 'blue' }),
    text: 'Also discard any or all other cards of this color in your hand — you choose which to keep.',
  },
  {
    card: sample({ kind: 'skipEveryone', color: 'red' }),
    text: 'Skip all other players and take another turn.',
  },
  {
    card: sample({ kind: 'wildReverseDraw4' }),
    text: 'Reverse, then the next player draws 4. With 2 players, YOU draw 4 — unless you stack it back.',
  },
  {
    card: sample({ kind: 'wildDraw6' }),
    text: 'Next player draws 6 and loses their turn (stackable).',
  },
  {
    card: sample({ kind: 'wildDraw10' }),
    text: 'Next player draws 10 and loses their turn. Only +10 answers +10.',
  },
  {
    card: sample({ kind: 'wildColorRoulette' }),
    text: 'Next player names a color, then reveals cards until that color appears (wilds don’t count). They keep them all and lose their turn.',
  },
];

export function RulesPanel({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="How to play" onClose={onClose} wide>
      <div className="space-y-5 text-sm leading-relaxed text-white/85">
        <section>
          <h3 className="mb-1 font-semibold text-white">Goal</h3>
          <p>
            Empty your hand — or be the last player standing after everyone else is knocked out.
            Playing with computers? Once every person at the table is knocked out, the round ends
            with no winner.
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-white">Your turn</h3>
          <p>
            Play one card matching the top card&apos;s color, number or symbol. Wild cards can be
            played on anything. If you have no match you must keep drawing until you get one — then
            you must play it.
          </p>
        </section>
        <section>
          <h3 className="mb-1 font-semibold text-white">Stacking</h3>
          <p>
            When a Draw card hits you, answer with a Draw card of equal or higher value (+2 &lt; +4
            &lt; +6 &lt; +10, any color) to add to the total and pass it on. Otherwise take the
            whole stack and lose your turn.
          </p>
        </section>
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <PlayingCard card={sample({ kind: 'number', color: 'yellow', value: 7 })} size="sm" />
            <div>
              <h3 className="mb-1 font-semibold text-white">7 — Swap</h3>
              <p>Swap your whole hand with another player of your choice. Mandatory.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <PlayingCard card={sample({ kind: 'number', color: 'blue', value: 0 })} size="sm" />
            <div>
              <h3 className="mb-1 font-semibold text-white">0 — Pass</h3>
              <p>Everyone passes their hand to the next player in the current direction.</p>
            </div>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <h3 className="mb-1 font-semibold text-white">Mercy Rule</h3>
            <p>
              Reach 25 or more cards and you are knocked out immediately. One last chance: if a draw
              you chose to make is your 25th card and it can be played, play it straight away and
              you stay in.
            </p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <h3 className="mb-1 font-semibold text-white">UNO!</h3>
            <p>
              Down to one card? Hit UNO. If someone catches you before the next player acts, you
              draw 2.
            </p>
          </div>
        </section>
        <section>
          <h3 className="mb-2 font-semibold text-white">Action cards</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {CARD_RULES.map(({ card, text }) => (
              <li key={card.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-2">
                <PlayingCard card={card} size="sm" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}
