import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '@nomercy/shared';
import { CardBack, PlayingCard } from '../card/PlayingCard';

/** What happened to an action that left for the host: still out, confirmed, or turned down. */
export type FlightStatus = 'pending' | 'accepted' | 'refused';

/**
 * A card standing in for an action that is still on its way to the host. `from` is where the card
 * sat (a hand card, or the draw pile) and `to` the spot it is headed for (the discard heap, or for a
 * draw the same pile: the card is only peeled off and held until the host answers). Rects are
 * viewport coordinates measured at click time, so one flight works on any screen size.
 */
export interface Flight {
  id: number;
  kind: 'play' | 'draw';
  /** The card being thrown; null for a draw, which is shown face down. */
  card: Card | null;
  from: DOMRect;
  to: DOMRect;
  /** How much ancestors shrink the target (the table is scaled down on small phones). */
  toScale: number;
  status: FlightStatus;
}

interface SendFlightProps {
  flight: Flight;
  onDone: () => void;
}

const PEEL_MS = 130;
const THROW_MS = 380;
const SETTLE_MS = 170;

/**
 * Hides the network round trip behind a real throw: the card leaves your hand on an arc, tilting
 * into the air and flattening as it drops onto the heap with a thud and a ripple, then breathes a
 * faint brass glow until the host confirms. A refusal flies it back. Purely cosmetic; the
 * game state is whatever the server says. Drawn in a portal so it floats over the hand, the table
 * and the side panel alike.
 */
export function SendFlight({ flight, onDone }: SendFlightProps) {
  const body = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const entered = useRef<Promise<void>>(Promise.resolve());
  const finish = useRef(onDone);
  finish.current = onDone;
  const size = useRef({ w: 0, h: 0 });
  const live = useRef<Animation[]>([]);

  const play = flight.kind === 'play';
  const start = center(flight.from);
  const end = play ? center(flight.to) : { x: start.x, y: start.y };
  const dir = Math.sign(end.x - start.x) || (hash(flight.id) > 0.5 ? 1 : -1);
  // Where the card comes to rest: a slightly different angle every throw, like a real toss.
  const restTilt = useRef((hash(flight.id + 3) - 0.5) * 16);

  const track = (a: Animation | undefined): Animation | undefined => {
    if (a) live.current.push(a);
    return a;
  };

  useLayoutEffect(() => {
    const el = body.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    size.current = { w, h };
    const at = (p: { x: number; y: number }, scale: number, rot: number, lift = 0, tilt = 0) =>
      `translate(${p.x - w / 2}px, ${p.y - h / 2 - lift}px) perspective(700px) rotateX(${tilt}deg) rotate(${rot}deg) scale(${scale})`;
    const s0 = flight.from.width / w;
    const s1 = play ? flight.toScale : s0;
    const glow = (blur: number, y: number, alpha: number) =>
      `drop-shadow(0 ${y}px ${blur}px rgba(0,0,0,${alpha}))`;

    if (!play) {
      // Peel: the top card lifts off the deck, flutters, and hangs there.
      const rest = at(start, s0, 0);
      const up = at(start, s0 * 1.08, -7 * dir, 26, 14);
      const bob = at(start, s0 * 1.1, 5 * dir, 34, 10);
      const peel = el.animate(
        [
          { transform: rest, filter: glow(2, 1, 0.4) },
          { transform: up, filter: glow(14, 16, 0.5), offset: 0.7 },
          { transform: at(start, s0 * 1.06, -3 * dir, 24, 12), filter: glow(12, 13, 0.5) },
        ],
        { duration: 240, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.25)', fill: 'forwards' },
      );
      track(peel);
      entered.current = peel.finished.then(() => {
        peel.commitStyles();
        peel.cancel();
        track(
          el.animate(
            [
              { transform: at(start, s0 * 1.06, -3 * dir, 24, 12) },
              { transform: bob },
              { transform: at(start, s0 * 1.06, -3 * dir, 24, 12) },
            ],
            { duration: 900, iterations: Infinity, easing: 'ease-in-out' },
          ),
        );
      });
      return;
    }

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dist = Math.hypot(dx, dy) || 1;
    // The arc rises with the distance, so a long throw from the far edge of the hand reads as a lob.
    const rise = Math.min(150, Math.max(46, dist * 0.22));
    const mid = { x: start.x + dx * 0.55, y: start.y + dy * 0.55 };
    const back = { x: start.x - (dx / dist) * 9, y: start.y - (dy / dist) * 9 };
    const tilt = Math.max(-1, Math.min(1, dx / 260)) * 14 + dir * 5;

    const lift = track(
      el.animate(
        [
          { transform: at(start, s0, 0), filter: glow(3, 2, 0.4) },
          { transform: at(back, s0 * 1.14, -dir * 5, 14), filter: glow(16, 14, 0.5) },
        ],
        { duration: PEEL_MS, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)', fill: 'forwards' },
      ),
    );
    entered.current = (lift?.finished ?? Promise.resolve()).then(async () => {
      lift?.commitStyles();
      lift?.cancel();
      const flightAnim = track(
        el.animate(
          [
            { transform: at(back, s0 * 1.14, -dir * 5, 14), filter: glow(16, 14, 0.5) },
            {
              transform: at(mid, ((s0 + s1) / 2) * 1.2, tilt, rise, 16),
              filter: glow(24, 30, 0.42),
              offset: 0.55,
              easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)',
            },
            { transform: at(end, s1 * 1.05, restTilt.current, 0, 0), filter: glow(5, 3, 0.55) },
          ],
          { duration: THROW_MS, easing: 'cubic-bezier(0.25, 0.7, 0.3, 1)', fill: 'forwards' },
        ),
      );
      await flightAnim?.finished;
      flightAnim?.commitStyles();
      flightAnim?.cancel();
      // The thud: squash into the felt, spring back, and send a ripple out across it.
      ring.current?.animate(
        [
          {
            transform: `translate(${end.x}px, ${end.y}px) translate(-50%, -50%) scale(0.5)`,
            opacity: 0.9,
          },
          {
            transform: `translate(${end.x}px, ${end.y}px) translate(-50%, -50%) scale(1.5)`,
            opacity: 0,
          },
        ],
        { duration: 460, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)', fill: 'forwards' },
      );
      const settle = track(
        el.animate(
          [
            { transform: at(end, s1 * 1.05, restTilt.current), filter: glow(5, 3, 0.55) },
            {
              transform: at(end, s1 * 0.95, restTilt.current),
              filter: glow(2, 1, 0.6),
              offset: 0.4,
            },
            { transform: at(end, s1, restTilt.current), filter: glow(3, 2, 0.55) },
          ],
          { duration: SETTLE_MS, easing: 'ease-out', fill: 'forwards' },
        ),
      );
      await settle?.finished;
      settle?.commitStyles();
      settle?.cancel();
      // Waiting for the host: a faint brass breath around the card.
      track(
        el.animate(
          [
            { filter: `${glow(3, 2, 0.55)} drop-shadow(0 0 3px rgba(255,194,46,0.2))` },
            { filter: `${glow(3, 2, 0.55)} drop-shadow(0 0 14px rgba(255,194,46,0.85))` },
          ],
          { duration: 520, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
        ),
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one flight per mount; id keys it
  }, []);

  useEffect(() => {
    if (flight.status === 'pending') return;
    const el = body.current;
    if (!el) return;
    let cancelled = false;
    void entered.current.then(async () => {
      if (cancelled) return;
      // Freeze the pose the waiting loop left it in, then play the ending from there.
      live.current.forEach((a) => {
        try {
          a.commitStyles();
        } catch {
          // already detached
        }
        a.cancel();
      });
      live.current = [];
      const { w, h } = size.current;
      if (flight.status === 'accepted') {
        const out = el.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: play ? 160 : 120,
          easing: 'ease-out',
          fill: 'forwards',
        });
        await out.finished.catch(() => undefined);
      } else {
        // Turned down: the card snaps back to where it sat, with a shake of the head.
        const s0 = flight.from.width / w;
        const here = getComputedStyle(el).transform;
        const home = `translate(${start.x - w / 2}px, ${start.y - h / 2}px) scale(${s0})`;
        const back = el.animate(
          [
            { transform: here === 'none' ? home : here },
            { transform: `${home} rotate(${-6 * dir}deg)`, offset: 0.55 },
            { transform: `${home} rotate(${3 * dir}deg)`, offset: 0.8 },
            { transform: home },
          ],
          { duration: 320, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)', fill: 'forwards' },
        );
        await back.finished.catch(() => undefined);
      }
      if (!cancelled) finish.current();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the verdict only
  }, [flight.status]);

  useEffect(
    () => () => {
      live.current.forEach((a) => a.cancel());
    },
    [],
  );

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[45] overflow-hidden">
      {play && (
        <div
          ref={ring}
          className="absolute left-0 top-0 rounded-full border-4 border-brass opacity-0"
          style={{
            width: flight.to.width * 0.6,
            height: flight.to.width * 0.6,
            boxShadow: '0 0 24px 4px rgba(255,194,46,0.55)',
          }}
        />
      )}
      <div ref={body} className="absolute left-0 top-0 will-change-transform">
        {play && flight.card ? (
          <PlayingCard card={flight.card} size="lg" />
        ) : (
          <CardBack size="lg" />
        )}
      </div>
    </div>,
    document.body,
  );
}

function center(r: DOMRect): { x: number; y: number } {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** A repeatable 0..1 from a flight's id, so each throw tilts differently but never flickers. */
function hash(n: number): number {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}
