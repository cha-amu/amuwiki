import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const html = await readFile(
  new URL('./fixtures/embed-parent.html', import.meta.url),
);
const server = createServer((_request, response) => {
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(html);
});
server.listen(4187, '127.0.0.1');
process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
