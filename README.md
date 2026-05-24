# Connections Web App

A lightweight standard-library Python + vanilla JavaScript clone of the Connections puzzle.

## Features

- 4x4 board of terms
- Select 4 tiles and submit a guess
- Correct groups move to the solved section at the top
- Incorrect guesses reduce the remaining attempts from 4
- One-away feedback when 3 out of 4 tiles match a hidden group
- Loss state reveals the remaining categories
- Game data is loaded from a simple JSON file

## Files to edit for new games

Update [data/games.json](data/games.json) to add or replace puzzles.

Each game uses this structure:

- `id`: unique string
- `title`: display name
- `groups`: array of 4 objects
  - `difficulty`: `yellow`, `green`, `blue`, or `purple`
  - `category`: the category name
  - `terms`: exactly 4 terms

## Run locally

1. Start the app:
   - `python app.py`
2. Open http://127.0.0.1:8000 in your browser.

## Notes

- The app reads game content from disk every time the API is called, so changing `games.json` is enough to update puzzles.
- Query a specific puzzle with `/?game=sample-2`.
