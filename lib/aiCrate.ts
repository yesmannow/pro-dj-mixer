import type { Track } from '@/lib/db';
import { getCompatibleKeys } from '@/lib/harmonicKeys';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'crates', 'crate', 'deck', 'for', 'house', 'in', 'instant', 'me', 'playlist',
  'prompt', 'set', 'show', 'studio', 'the', 'to', 'tracks', 'with'
]);

const tokenize = (prompt: string) => prompt.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const isVaultTrack = (track: Track) =>
  track.sourceId?.startsWith('vault:') || Boolean(track.audioUrl && /r2\.dev\/audio/i.test(track.audioUrl));

export interface AICrateCriteria {
  bpmTarget: number | null;
  bpmRange: [number, number] | null;
  key: string | null;
  compatibleKeys: string[];
  harmonicRange: string[];
  keywords: string[];
  vaultOnly: boolean;
}

export interface AICrateMatch {
  track: Track;
  score: number;
  reasons: string[];
}

export interface AICrateResult {
  criteria: AICrateCriteria;
  matches: AICrateMatch[];
}

export const parseAICratePrompt = (prompt: string, vaultOnly = true): AICrateCriteria => {
  const bpmRangeMatch = prompt.match(/(\d{2,3})\s*(?:-|to)\s*(\d{2,3})\s*bpm/i);
  const bpmTargetMatch = prompt.match(/(\d{2,3})\s*bpm/i);
  const keyMatch = prompt.match(/\b(1[0-2]|[1-9])[ab]\b/i);
  const bpmRange = bpmRangeMatch
    ? [Math.min(Number(bpmRangeMatch[1]), Number(bpmRangeMatch[2])), Math.max(Number(bpmRangeMatch[1]), Number(bpmRangeMatch[2]))] as [number, number]
    : null;
  const bpmTarget = bpmRange
    ? Math.round((bpmRange[0] + bpmRange[1]) / 2)
    : bpmTargetMatch
      ? Number(bpmTargetMatch[1])
      : null;
  const key = keyMatch ? keyMatch[0].toUpperCase() : null;
  const harmonicRange = key ? Array.from(new Set([key, ...getCompatibleKeys(key)])) : [];
  const keywords = tokenize(prompt).filter((token) => {
    if (STOP_WORDS.has(token) || token === 'bpm') return false;
    if (/^\d+$/.test(token)) return false;
    if (/^(1[0-2]|[1-9])[ab]$/.test(token)) return false;
    return token.length > 2;
  });

  return {
    bpmTarget,
    bpmRange,
    key,
    compatibleKeys: key ? getCompatibleKeys(key) : [],
    harmonicRange,
    keywords,
    vaultOnly,
  };
};

export const buildAICrate = (
  tracks: Track[],
  prompt: string,
  options: { limit?: number; vaultOnly?: boolean } = {}
): AICrateResult => {
  const criteria = parseAICratePrompt(prompt, options.vaultOnly ?? true);
  const bpmTolerance = criteria.bpmRange ? Math.max(1, criteria.bpmRange[1] - criteria.bpmRange[0]) : 4;
  const limit = options.limit ?? 8;

  const matches = tracks
    .filter((track) => !criteria.vaultOnly || isVaultTrack(track))
    .map<AICrateMatch | null>((track) => {
      const reasons: string[] = [];
      let score = 0;
      const bpm = Number(track.bpm);
      const normalizedKey = track.key.toUpperCase();
      const searchHaystack = `${track.title} ${track.artist} ${track.energy}`.toLowerCase();

      if (criteria.bpmRange && Number.isFinite(bpm)) {
        if (bpm >= criteria.bpmRange[0] && bpm <= criteria.bpmRange[1]) {
          score += 24;
          reasons.push(`${track.bpm} BPM`);
        } else if (criteria.bpmTarget !== null && Math.abs(bpm - criteria.bpmTarget) <= bpmTolerance) {
          score += 10;
          reasons.push(`near ${criteria.bpmTarget} BPM`);
        } else {
          score -= 24;
        }
      } else if (criteria.bpmTarget !== null && Number.isFinite(bpm)) {
        const distance = Math.abs(bpm - criteria.bpmTarget);
        if (distance <= bpmTolerance) {
          score += Math.max(10, 26 - distance * 4);
          reasons.push(`${track.bpm} BPM`);
        } else {
          score -= 18;
        }
      }

      if (criteria.key) {
        if (normalizedKey === criteria.key) {
          score += 20;
          reasons.push(`key ${normalizedKey}`);
        } else if (criteria.harmonicRange.includes(normalizedKey)) {
          score += 12;
          reasons.push(`Rekordbox harmonic range (${normalizedKey})`);
        } else if (track.key !== '--') {
          score -= 10;
        }
      }

      const keywordHits = criteria.keywords.filter((keyword) => searchHaystack.includes(keyword));
      if (keywordHits.length > 0) {
        score += keywordHits.length * 8;
        reasons.push(keywordHits.join(', '));
      }

      if (!criteria.bpmTarget && !criteria.bpmRange && !criteria.key && keywordHits.length === 0) {
        score += 1;
      }

      if (score <= 0) {
        return null;
      }

      return {
        track,
        score,
        reasons: reasons.length > 0 ? reasons : ['vault ready'],
      };
    })
    .filter((match): match is AICrateMatch => match !== null)
    .sort((left, right) => (
      right.score - left.score ||
      (Number(right.track.createdAt) || 0) - (Number(left.track.createdAt) || 0)
    ))
    .slice(0, limit);

  return { criteria, matches };
};
