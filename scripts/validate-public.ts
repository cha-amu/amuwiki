import { access, readFile } from 'node:fs/promises';
import { MAX_INDEX_BYTES, validateIndex } from '../src/domain/validation.ts';

const indexFile = new URL('../public/wiki.json', import.meta.url);
try {
  await access(indexFile);
} catch {
  throw new Error(
    'public/wiki.json is missing. Run "gh release download wiki-data --pattern wiki.json --dir public" or copy tests/fixtures/public-wiki.json for local checks.',
  );
}
const buffer = await readFile(indexFile);
if (buffer.byteLength > MAX_INDEX_BYTES)
  throw new Error('Public index exceeds the size limit.');
const index = validateIndex(JSON.parse(buffer.toString('utf8')));
console.log(
  `Public index validated: ${index.documents.length} documents, ${index.resources.length} resources.`,
);
