/**
 * Synchronous, deterministic tree id derived from the FlowNode tree.
 *
 * Used by the studio to key per-tree canvas state in localStorage. FNV-1a
 * (64-bit) is chosen over SHA-256 because `crypto.subtle.digest` is
 * unconditionally async; that would force an `await` through the otherwise
 * synchronous render path. Collision resistance is unnecessary for a
 * localStorage key — see spec.md §3 and research F8.
 */

import type { FlowNode } from './schemas.js';

const FNV_OFFSET_BASIS_64 = 0xcbf29ce484222325n;
const FNV_PRIME_64 = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function fnv1a_64(input: string): bigint {
  let hash = FNV_OFFSET_BASIS_64;
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    hash ^= BigInt(code & 0xff);
    hash = (hash * FNV_PRIME_64) & MASK_64;
    if (code > 0xff) {
      hash ^= BigInt((code >> 8) & 0xff);
      hash = (hash * FNV_PRIME_64) & MASK_64;
    }
  }
  return hash;
}

export function tree_id(root: FlowNode): string {
  const serialized = JSON.stringify(root);
  const digest = fnv1a_64(serialized);
  return digest.toString(36);
}
