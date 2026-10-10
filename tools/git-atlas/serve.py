#!/usr/bin/env python3
"""Serve only the Atlas and its JSON on loopback; no write endpoints."""
import argparse
import errno
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

from update import HERE

PREFERRED_PORT = 58044


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlsplit(self.path).path
        routes = {'/': ('index.html', 'text/html'), '/index.html': ('index.html', 'text/html'),
                  '/git-state.json': ('git-state.json', 'application/json')}
        if path not in routes:
            self.send_error(404)
            return
        name, mime = routes[path]
        try:
            content = (HERE / name).read_bytes()
        except OSError:
            self.send_error(503, 'Execute update.py para gerar o JSON.')
            return
        self.send_response(200)
        self.send_header('Content-Type', mime + '; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, format, *args):
        pass


def bind_server(port=PREFERRED_PORT, attempts=20):
    """Bind 127.0.0.1. If `port` is taken, use the next free port in range."""
    if attempts < 1:
        raise ValueError('attempts')
    for candidate in range(port, port + attempts):
        try:
            return ThreadingHTTPServer(('127.0.0.1', candidate), Handler)
        except OSError as error:
            if error.errno != errno.EADDRINUSE:
                raise
    raise OSError(errno.EADDRINUSE, 'sem porta livre entre %s e %s' % (port, port + attempts - 1))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=PREFERRED_PORT)
    args = parser.parse_args()
    try:
        server = bind_server(args.port)
    except OSError:
        parser.exit(1, 'Git Atlas: nenhuma porta livre a partir de %s.\n' % args.port)
    bound = server.server_address[1]
    if bound != args.port:
        print('Git Atlas: porta %s ocupada.' % args.port, flush=True)
    print('Git Atlas: http://127.0.0.1:' + str(bound) + '/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
