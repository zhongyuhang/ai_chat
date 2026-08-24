import type { WorldBookEntry } from '../../shared/contracts/canon.js';

export interface ActiveScope {
  volumeId?: string;
  chapterId?: string;
  characterIds?: string[];
  theatreSessionId?: string;
}

export interface WorldBookHit {
  entry: WorldBookEntry;
  matchedTerm?: string;
  reason: string;
  scopeSpecificity: number;
}

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '');
}

function scopeSpecificity(entry: WorldBookEntry, active: ActiveScope): number {
  const scope = entry.scope;
  if (scope.type === 'global') return 1;
  if (scope.type === 'volume') return scope.id === active.volumeId ? 2 : 0;
  if (scope.type === 'chapter') return scope.id === active.chapterId ? 4 : 0;
  if (scope.type === 'character') return active.characterIds?.includes(scope.id) ? 3 : 0;
  return scope.id === active.theatreSessionId ? 5 : 0;
}

export function retrieveWorldBook(input: {
  entries: WorldBookEntry[];
  text: string;
  scope?: ActiveScope;
  stage?: string;
}): WorldBookHit[] {
  const active = input.scope ?? {};
  const normalizedText = normalize(input.text);
  const normalizedStage = normalize(input.stage ?? '');
  const hits: WorldBookHit[] = [];

  for (const entry of input.entries) {
    if (!entry.enabled || entry.status !== 'confirmed') continue;
    const specificity = scopeSpecificity(entry, active);
    if (!specificity) continue;
    if (entry.activation.type === 'constant') {
      hits.push({ entry, reason: 'constant', scopeSpecificity: specificity });
      continue;
    }
    if (entry.activation.type === 'stage') {
      const matched = entry.activation.stages.find((stage) => normalize(stage) === normalizedStage);
      if (matched) hits.push({ entry, matchedTerm: matched, reason: `stage:${matched}`, scopeSpecificity: specificity });
      continue;
    }
    const terms = [...entry.activation.keywords, ...entry.activation.synonyms];
    const matched = terms.find((term) => normalizedText.includes(normalize(term)));
    if (matched) hits.push({ entry, matchedTerm: matched, reason: `keyword:${matched}`, scopeSpecificity: specificity });
  }

  return hits.sort((a, b) => (
    b.entry.priority - a.entry.priority
    || b.scopeSpecificity - a.scopeSpecificity
    || a.entry.id.localeCompare(b.entry.id)
  ));
}
