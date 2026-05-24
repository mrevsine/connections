from __future__ import annotations

import json
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "games.json"


def load_games() -> list[dict[str, Any]]:
    with DATA_FILE.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)

    games = payload.get("games", []) if isinstance(payload, dict) else payload
    if not isinstance(games, list):
        raise ValueError("games.json must contain a list or an object with a games list")

    return games


def find_game(game_id: str | None) -> dict[str, Any] | None:
    games = load_games()
    if not games:
        return None

    if game_id:
        for game in games:
            if str(game.get("id")) == game_id:
                return game
        return None

    return games[0]


class ConnectionsHandler(SimpleHTTPRequestHandler):
    def _send_json(self, payload: Any, status: int = HTTPStatus.OK) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/":
            self.path = "/index.html"
            return super().do_GET()

        if path == "/api/games":
            games = load_games()
            return self._send_json(
                [
                    {
                        "id": game.get("id"),
                        "title": game.get("title", game.get("id", "Connections")),
                    }
                    for game in games
                ]
            )

        if path == "/api/game":
            query = parse_qs(parsed.query)
            game = find_game(query.get("game", [None])[0])
            if game is None:
                return self._send_json({"error": "No games available"}, HTTPStatus.NOT_FOUND)
            return self._send_json(game)

        if path.startswith("/api/game/"):
            game_id = path.rsplit("/", 1)[-1]
            game = find_game(game_id)
            if game is None:
                return self._send_json({"error": f"Game '{game_id}' not found"}, HTTPStatus.NOT_FOUND)
            return self._send_json(game)

        return super().do_GET()


def main() -> None:
    handler = partial(ConnectionsHandler, directory=str(BASE_DIR))
    server = ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    print("Connections app running at http://127.0.0.1:8000")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
