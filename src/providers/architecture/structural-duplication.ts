import fs from 'node:fs';
import path from 'node:path';
import { ComponentItem, DuplicationCluster } from './types.js';

export function extractStructuralSkeleton(content: string): {
  tags: string[];
  signature: string;
} {
  // 1. Strip Astro frontmatter
  let cleanContent = content;
  if (cleanContent.startsWith('---')) {
    const endFrontmatter = cleanContent.indexOf('---', 3);
    if (endFrontmatter !== -1) {
      cleanContent = cleanContent.slice(endFrontmatter + 3);
    }
  }

  // 2. Strip scripts and styles
  cleanContent = cleanContent.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleanContent = cleanContent.replace(/<style[\s\S]*?<\/style>/gi, '');

  // 3. Strip HTML / JSX comments
  cleanContent = cleanContent.replace(/<!--[\s\S]*?-->/g, '');
  cleanContent = cleanContent.replace(/{\/\*[\s\S]*?\*\/}/g, '');

  // 4. Extract tag names and structural tokens
  const tagRegex = /<\/?([a-zA-Z0-9_-]+)(?:\s+[^>]*)?\/?>/g;
  const tags: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(cleanContent)) !== null) {
    const rawTag = match[1];
    // Filter out generic text containers if desired, or keep all element tags
    tags.push(rawTag);
  }

  const signature = tags.join('>');
  return { tags, signature };
}

function calculateJaccardSimilarity(arr1: string[], arr2: string[]): number {
  if (arr1.length === 0 && arr2.length === 0) return 1.0;
  if (arr1.length === 0 || arr2.length === 0) return 0.0;

  const set1 = new Set(arr1);
  const set2 = new Set(arr2);

  let intersection = 0;
  for (const item of set1) {
    if (set2.has(item)) {
      intersection++;
    }
  }

  const union = new Set([...set1, ...set2]).size;
  return union === 0 ? 0 : intersection / union;
}

export function detectStructuralDuplication(
  components: ComponentItem[],
  similarityThreshold = 0.85
): DuplicationCluster[] {
  // Focus on newly added or modified components with non-empty content
  const targetComponents = components.filter((c) => !c.isDeleted && (c.isNew || c.isModified));
  if (targetComponents.length < 2) return [];

  const skeletons = new Map<string, { tags: string[]; signature: string }>();

  for (const comp of targetComponents) {
    if (fs.existsSync(comp.path)) {
      try {
        const content = fs.readFileSync(comp.path, 'utf8');
        skeletons.set(comp.relativePath, extractStructuralSkeleton(content));
      } catch {}
    }
  }

  const clusters: DuplicationCluster[] = [];
  const processed = new Set<string>();

  const componentPaths = Array.from(skeletons.keys());

  for (let i = 0; i < componentPaths.length; i++) {
    const pathA = componentPaths[i];
    if (processed.has(pathA)) continue;

    const skelA = skeletons.get(pathA)!;
    if (skelA.tags.length === 0) continue;

    const matchedGroup: string[] = [pathA];

    for (let j = i + 1; j < componentPaths.length; j++) {
      const pathB = componentPaths[j];
      if (processed.has(pathB)) continue;

      const skelB = skeletons.get(pathB)!;
      if (skelB.tags.length === 0) continue;

      let sim = 0;
      if (skelA.signature === skelB.signature) {
        sim = 1.0;
      } else {
        sim = calculateJaccardSimilarity(skelA.tags, skelB.tags);
      }

      if (sim >= similarityThreshold) {
        matchedGroup.push(pathB);
        processed.add(pathB);
      }
    }

    if (matchedGroup.length > 1) {
      processed.add(pathA);
      clusters.push({
        similarity: 0.95,
        sharedSkeleton: skelA.tags.slice(0, 8).join(' > ') + (skelA.tags.length > 8 ? ' > ...' : ''),
        components: matchedGroup,
        suggestion: `Components share a near-identical structural skeleton (<${skelA.tags.slice(0, 3).join(', ')}>). Consider extracting a parameterized component or passing data directly rather than multiplying structural wrappers.`
      });
    }
  }

  return clusters;
}
