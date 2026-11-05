#!/usr/bin/env python3
"""Local server for the deck. It also lets the presenter screen save the speaker notes.

    python3 serve.py                # http://127.0.0.1:8000
    python3 serve.py --port 8100

Static files come from this folder with caching off, so a reload shows the latest files.
PUT /api/notes writes the notes of one slide into that slide's <aside class="notes"> in
index.html. An edit is then an ordinary change to a tracked file: commit and push it, and
everyone who pulls the repository sees the same notes and can change them.

A save carries the text that the editor started from. If index.html holds other notes for that
slide (for example after a git pull), the server writes nothing and answers 409.
Standard library only. It listens on 127.0.0.1 only and refuses requests from other sites.
"""
import argparse
import html
import json
import os
import re
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
INDEX = os.path.join(ROOT, 'index.html')
MAX_BODY = 256 * 1024
SECTION = re.compile(r'<section\b[^>]*?\bdata-title="([^"]*)"', re.S)
NOTES = re.compile(r'([ \t]*)<aside class="notes">(.*?)</aside>', re.S)
PARA = re.compile(r'<p>(.*?)</p>', re.S)
WRITE = threading.Lock()


class Conflict(Exception):
    """The slide's notes in index.html are no longer the text that the editor started from."""


def squash(text):
    return ' '.join(text.split())


def paragraphs(inner):
    """The plain text of each non-empty <p> in a notes block."""
    texts = (squash(html.unescape(re.sub(r'<[^>]+>', '', p))) for p in PARA.findall(inner))
    return [t for t in texts if t]


def write_notes(title, base, new):
    """Replace the notes of the slide titled `title` with the paragraphs `new`.

    Everything outside that slide's notes block stays byte for byte the same."""
    with WRITE:
        with open(INDEX, encoding='utf-8', newline='') as f:
            src = f.read()
        heads = [m for m in SECTION.finditer(src) if html.unescape(m.group(1)) == title]
        if len(heads) != 1:
            raise LookupError('No single slide has the title %r.' % title)
        start = heads[0].end()
        end = src.find('<section', start)
        m = NOTES.search(src, start, end if end >= 0 else len(src))
        if not m:
            raise LookupError('The slide %r has no notes block.' % title)
        if paragraphs(m.group(2)) != base:
            raise Conflict(title)
        nl = '\r\n' if '\r\n' in src else '\n'
        indent = m.group(1)
        inner = ''.join(nl + indent + '  <p>' + html.escape(p, quote=False) + '</p>' for p in new) + nl + indent
        out = src[:m.start(2)] + inner + src[m.end(2):]
        fd, tmp = tempfile.mkstemp(dir=ROOT, prefix='.index-', suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8', newline='') as f:
                f.write(out)
            os.chmod(tmp, os.stat(INDEX).st_mode & 0o777)
            os.replace(tmp, INDEX)
        except BaseException:
            if os.path.exists(tmp):
                os.unlink(tmp)
            raise


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_json(self, code, body):
        data = json.dumps(body).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def from_this_deck(self):
        # Only the deck's own pages may write: the Host must be this machine (no DNS rebinding),
        # and a browser's Origin must be that same host (no other web page).
        host = self.headers.get('Host', '')
        port = str(self.server.server_address[1])
        if host not in ('127.0.0.1:' + port, 'localhost:' + port):
            return False
        origin = self.headers.get('Origin')
        return origin is None or origin == 'http://' + host

    def do_GET(self):
        if self.path.split('?')[0] == '/api/notes':
            return self.send_json(200, {'save': True})
        return super().do_GET()

    def do_PUT(self):
        if self.path.split('?')[0] != '/api/notes':
            return self.send_json(404, {'error': 'Not found.'})
        if not self.from_this_deck():
            return self.send_json(403, {'error': 'Only the deck on this machine can save notes.'})
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if not 0 < length <= MAX_BODY:
            return self.send_json(413, {'error': 'The request is empty or too large.'})
        try:
            data = json.loads(self.rfile.read(length).decode('utf-8'))
            title, base, new = data['title'], data['base'], data['paragraphs']
            if not (isinstance(title, str) and isinstance(base, list) and isinstance(new, list)
                    and all(isinstance(p, str) for p in base + new)):
                raise TypeError
        except (ValueError, KeyError, TypeError):
            return self.send_json(400, {'error': 'The request is not valid.'})
        base = [t for t in map(squash, base) if t]
        new = [t for t in map(squash, new) if t]
        try:
            write_notes(title, base, new)
        except Conflict:
            return self.send_json(409, {'error': 'These notes changed in index.html after the deck loaded. '
                                                 'Copy your text, reload the deck, then paste it again.'})
        except LookupError as e:
            return self.send_json(404, {'error': str(e)})
        self.log_message('notes saved: %s', title)
        return self.send_json(200, {'paragraphs': new})


def main():
    parser = argparse.ArgumentParser(description='Serve the deck and save speaker notes into index.html.')
    parser.add_argument('--port', type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(Handler, directory=ROOT))
    print('Deck: http://127.0.0.1:%d   (Ctrl+C stops the server)' % args.port, flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
