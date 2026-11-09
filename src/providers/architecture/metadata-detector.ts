import fs from 'node:fs';
import path from 'node:path';
import { ComponentItem, MetadataDuplicateItem } from './types.js';

interface CollectionEntry {
  collection: string;
  file: string;
  fields: Record<string, string>;
}

export function extractFrontmatterFields(content: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!content.startsWith('---')) return fields;

  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return fields;

  const frontmatter = content.slice(3, endIdx);
  const lines = frontmatter.split('\n');

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
      const key = line.slice(0, colonIdx).trim();
      let val = line.slice(colonIdx + 1).trim();
      // Remove quotes
      val = val.replace(/^["']|["']$/g, '').trim();

      // Only track non-trivial string values (length >= 8) to maintain high reliability and eliminate false positives
      if (val.length >= 8 && !val.startsWith('http') && !val.startsWith('[')) {
        fields[key] = val;
      }
    }
  }

  return fields;
}

export function scanCollectionEntries(projectRoot: string): CollectionEntry[] {
  const entries: CollectionEntry[] = [];
  const contentDir = path.join(projectRoot, 'src', 'content');
  if (!fs.existsSync(contentDir)) return entries;

  const collections = fs.readdirSync(contentDir, { withFileTypes: true });
  for (const col of collections) {
    if (!col.isDirectory()) continue;
    const colDir = path.join(contentDir, col.name);
    const files = fs.readdirSync(colDir, { withFileTypes: true });

    for (const f of files) {
      if (f.isFile() && (f.name.endsWith('.md') || f.name.endsWith('.mdx'))) {
        try {
          const raw = fs.readFileSync(path.join(colDir, f.name), 'utf8');
          const fields = extractFrontmatterFields(raw);
          if (Object.keys(fields).length > 0) {
            entries.push({
              collection: col.name,
              file: path.relative(projectRoot, path.join(colDir, f.name)),
              fields
            });
          }
        } catch {}
      }
    }
  }

  return entries;
}

export function detectHardcodedCollectionMetadata(
  projectRoot: string,
  components: ComponentItem[]
): MetadataDuplicateItem[] {
  const collectionEntries = scanCollectionEntries(projectRoot);
  if (collectionEntries.length === 0) return [];

  const duplicates: MetadataDuplicateItem[] = [];
  const targetComponents = components.filter((c) => !c.isDeleted && (c.isNew || c.isModified));

  for (const comp of targetComponents) {
    if (!fs.existsSync(comp.path)) continue;

    let content: string;
    try {
      content = fs.readFileSync(comp.path, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    for (const entry of collectionEntries) {
      for (const [field, val] of Object.entries(entry.fields)) {
        // Search for exact string literal occurrence in component lines
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.includes(`"${val}"`) || line.includes(`'${val}'`) || line.includes(`\`${val}\``)) {
            duplicates.push({
              file: comp.relativePath,
              line: i + 1,
              literalValue: val,
              collection: entry.collection,
              collectionFile: entry.file,
              fieldName: field
            });
          }
        }
      }
    }
  }

  return duplicates;
}
