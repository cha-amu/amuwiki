import { readFile } from 'node:fs/promises';
import { MAX_INDEX_BYTES, validateIndex } from '../src/domain/validation.ts';

const buffer = await readFile(new URL('../public/wiki.json', import.meta.url));
if (buffer.byteLength > MAX_INDEX_BYTES)
  throw new Error('Public index exceeds the size limit.');
const index = validateIndex(JSON.parse(buffer.toString('utf8')));
console.log(
  `Public index validated: ${index.documents.length} documents, ${index.resources.length} resources.`,
);
