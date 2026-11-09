import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractActionableFindings } from '../dist/providers/lighthouse.js';

describe('Actionable Lighthouse Findings', () => {
  test('normalizes failed audit with category, element snippet and severity', () => {
    const mockLhr = {
      categories: {
        seo: {
          auditRefs: [
            { id: 'is-crawlable', weight: 10 },
            { id: 'meta-description', weight: 5 }
          ]
        }
      },
      audits: {
        'is-crawlable': {
          id: 'is-crawlable',
          title: 'Page is blocked from indexing',
          description: 'Search engines are unable to crawl your page.',
          score: 0,
          numericValue: 0,
          details: {
            items: [
              {
                node: {
                  snippet: '<meta name="robots" content="noindex" />',
                  selector: 'head > meta'
                }
              }
            ]
          }
        },
        'meta-description': {
          id: 'meta-description',
          title: 'Document has a meta description',
          score: 1, // Passing audit should be omitted
          description: 'Meta description found'
        }
      }
    };

    const findings = extractActionableFindings(mockLhr);
    assert.equal(findings.length, 1);
    const f = findings[0];
    assert.equal(f.id, 'is-crawlable');
    assert.equal(f.category, 'seo');
    assert.equal(f.severity, 'failure');
    assert.equal(f.score, 0);
    assert.equal(f.weight, 10);
    assert.equal(f.element, '<meta name="robots" content="noindex" />');
    assert.match(f.description, /Search engines/);
  });
});
