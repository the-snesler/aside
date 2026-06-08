let currentSeq = 0;

export function initSequence(maxSeq: number): void {
  currentSeq = maxSeq;
}

export function nextRev(): number {
  currentSeq += 1;
  return currentSeq;
}
