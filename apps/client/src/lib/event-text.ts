import type { GameEvent, PublicPlayerView } from '@nomercy/shared';
import { cardName, COLOR_LABEL } from './cards';

export type NameLookup = (playerId: string) => string;

export function nameLookup(players: PublicPlayerView[], meId: string): NameLookup {
  const names = new Map(players.map((p) => [p.id, p.name]));
  return (id) => (id === meId ? 'You' : (names.get(id) ?? 'Someone'));
}

const verb = (subject: string, you: string, other: string) => (subject === 'You' ? you : other);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One-line description of a public event for the action feed. */
export function describeEvent(event: GameEvent, name: NameLookup): string {
  switch (event.type) {
    case 'gameStarted':
      return `${name(event.dealerId)} dealt. ${name(event.firstPlayerId)} ${verb(name(event.firstPlayerId), 'go', 'goes')} first.`;
    case 'cardPlayed':
      return `${name(event.playerId)} played ${cardName(event.card)}${
        event.chosenColor ? ` → ${COLOR_LABEL[event.chosenColor]}` : ''
      }`;
    case 'cardsDrawn': {
      const reason = {
        noPlayableCard: 'from the draw pile',
        penalty: 'as a penalty',
        unoPenalty: 'for not calling UNO',
        roulette: 'from Color Roulette',
      }[event.reason];
      return `${name(event.playerId)} drew ${plural(event.count, 'card')} ${reason}`;
    }
    case 'drawStackGrew':
      return `Penalty stack is now +${event.total} → ${name(event.targetId)}`;
    case 'penaltyAccepted':
      return `${name(event.playerId)} took the +${event.total} penalty`;
    case 'turnSkipped':
      return `${name(event.playerId)} ${verb(name(event.playerId), 'are', 'is')} skipped`;
    case 'directionReversed':
      return `Direction reversed (${event.direction === 1 ? 'clockwise' : 'counterclockwise'})`;
    case 'everyoneSkipped':
      return `${name(event.playerId)} skipped everyone and goes again`;
    case 'discardedAll':
      return `${name(event.playerId)} discarded ${plural(event.count, 'extra card')} (${COLOR_LABEL[event.color]})`;
    case 'handsSwapped':
      return `${name(event.playerId)} swapped hands with ${name(event.targetId)}`;
    case 'handsPassed':
      return `Everyone passed their hand ${event.direction === 1 ? 'clockwise' : 'counterclockwise'}`;
    case 'rouletteStarted':
      return `${name(event.playerId)} spun Color Roulette on ${name(event.victimId)}`;
    case 'rouletteColorNamed':
      return `${name(event.victimId)} named ${COLOR_LABEL[event.color]} for Color Roulette`;
    case 'rouletteCardRevealed':
      return `${name(event.victimId)} turned over ${cardName(event.card)}`;
    case 'rouletteResolved':
      return event.matched
        ? `${name(event.victimId)} hit ${COLOR_LABEL[event.color]} after ${plural(event.revealed, 'card')}`
        : `${name(event.victimId)} never hit ${COLOR_LABEL[event.color]} and kept ${plural(event.revealed, 'card')}`;
    case 'drawPileReshuffled':
      return `Discards reshuffled into a new draw pile (${event.cards})`;
    case 'drawPileExhausted':
      return `No cards left to draw for ${name(event.playerId)}`;
    case 'unoCalled':
      return `${name(event.playerId)} called UNO!`;
    case 'unoCaught':
      return `${name(event.catcherId)} caught ${name(event.playerId)} without UNO (+2)`;
    case 'playerEliminated':
      return event.reason === 'mercy'
        ? `${name(event.playerId)} hit ${event.handSize} cards — knocked out by the Mercy Rule`
        : `${name(event.playerId)} left the game`;
    case 'gameWon':
      return event.reason === 'emptyHand'
        ? `${name(event.playerId)} played their last card and won!`
        : `${name(event.playerId)} is the last one standing and won!`;
  }
}

export interface BannerSpec {
  title: string;
  subtitle?: string;
  tone: 'danger' | 'info' | 'success' | 'warning';
}

/** Big center-screen banner for dramatic events. Cosmetic only. */
export function bannerFor(event: GameEvent, name: NameLookup): BannerSpec | null {
  switch (event.type) {
    case 'handsSwapped':
      return {
        title: 'Hands swapped!',
        subtitle: `${name(event.playerId)} ⇄ ${name(event.targetId)}`,
        tone: 'info',
      };
    case 'handsPassed':
      return {
        title: 'Pass your hand!',
        subtitle: event.direction === 1 ? 'Clockwise' : 'Counterclockwise',
        tone: 'info',
      };
    case 'playerEliminated':
      return {
        title: event.reason === 'mercy' ? 'No mercy!' : 'Player left',
        subtitle:
          event.reason === 'mercy'
            ? `${name(event.playerId)} is out with ${event.handSize} cards`
            : `${name(event.playerId)} forfeited`,
        tone: 'danger',
      };
    case 'everyoneSkipped':
      return {
        title: 'Skip everyone!',
        subtitle: `${name(event.playerId)} goes again`,
        tone: 'warning',
      };
    case 'turnSkipped':
      return { title: 'Skipped!', subtitle: name(event.playerId), tone: 'warning' };
    case 'directionReversed':
      return {
        title: 'Reverse!',
        subtitle: event.direction === 1 ? 'Clockwise' : 'Counterclockwise',
        tone: 'info',
      };
    case 'drawStackGrew':
      return {
        title: `+${event.total}`,
        subtitle: `Incoming for ${name(event.targetId)}`,
        tone: 'danger',
      };
    case 'unoCaught':
      return { title: 'Caught!', subtitle: `${name(event.playerId)} draws 2`, tone: 'danger' };
    case 'unoCalled':
      return { title: 'UNO!', subtitle: name(event.playerId), tone: 'success' };
    case 'discardedAll':
      return event.count > 0
        ? {
            title: 'Discard all!',
            subtitle: `${name(event.playerId)} dumped ${event.count} more`,
            tone: 'info',
          }
        : null;
    default:
      return null;
  }
}
