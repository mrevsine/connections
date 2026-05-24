const DIFFICULTY_ORDER = ["yellow", "green", "blue", "purple"];
const DIFFICULTY_LABELS = {
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
};

const DIFFICULTY_COLORS = {
  yellow: "var(--yellow)",
  green: "var(--green)",
  blue: "var(--blue)",
  purple: "var(--purple)",
};

const state = {
  game: null,
  selected: new Set(),
  solved: [],
  mistakes: 0,
  locked: false,
  submitting: false,
  shuffledOrder: [],
};

const elements = {};

function normalize(value) {
  return value.trim().toLowerCase();
}

function getQueryGameId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("game") || window.__INITIAL_GAME_ID__ || "";
}

function updateUrl(gameId) {
  const url = new URL(window.location.href);
  if (gameId) {
    url.searchParams.set("game", gameId);
  } else {
    url.searchParams.delete("game");
  }
  window.history.replaceState({}, "", url);
}

async function fetchGameList() {
  const response = await fetch("data/games.json");
  if (!response.ok) {
    throw new Error("Unable to load games");
  }
  const data = await response.json();
  return data.games;
}

async function fetchGame(gameId) {
  const response = await fetch("data/games.json");
  if (!response.ok) {
    throw new Error("Unable to load games");
  }
  const data = await response.json();
  const game = data.games.find(g => g.id === gameId);
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }
  return game;
}

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function resetRound(game) {
  state.game = game;
  state.selected.clear();
  state.solved = [];
  state.mistakes = 0;
  state.locked = false;
  state.submitting = false;
  state.shuffledOrder = shuffleArray(
    game.groups.flatMap((group) => group.terms.map((term) => ({ term, difficulty: group.difficulty })))
  ).map((entry) => entry.term);

  syncSolvedGroups();
  render();
}

function sortedGroups() {
  return [...state.solved].sort((a, b) => DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty));
}

function allGroups() {
  return state.game ? state.game.groups : [];
}

function remainingTerms() {
  const solvedTerms = new Set(state.solved.flatMap((group) => group.terms.map(normalize)));
  const terms = allGroups().flatMap((group) => group.terms);
  const available = terms.filter((term) => !solvedTerms.has(normalize(term)));
  const remaining = [];
  const seen = new Set();

  for (const term of state.shuffledOrder) {
    if (available.some((item) => normalize(item) === normalize(term)) && !seen.has(normalize(term))) {
      remaining.push(term);
      seen.add(normalize(term));
    }
  }

  for (const term of available) {
    if (!seen.has(normalize(term))) {
      remaining.push(term);
      seen.add(normalize(term));
    }
  }

  return remaining;
}

function syncSolvedGroups() {
  const solvedTerms = new Set(state.solved.flatMap((group) => group.terms.map(normalize)));
  state.selected = new Set([...state.selected].filter((term) => !solvedTerms.has(normalize(term))));
}

function setStatus(message, tone = "neutral") {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.remove("message-neutral", "message-success", "message-danger");
  elements.statusMessage.classList.add(`message-${tone}`);
}

function showOverlayMessage(text) {
  const overlay = elements.overlayMessage;
  overlay.textContent = text;
  overlay.classList.add("show");
  
  setTimeout(() => {
    overlay.classList.remove("show");
  }, 2000);
}

function isSelected(term) {
  return [...state.selected].some((selected) => normalize(selected) === normalize(term));
}

function toggleTerm(term) {
  if (state.locked || state.submitting || isTermSolved(term)) {
    return;
  }

  const existing = [...state.selected].find((selected) => normalize(selected) === normalize(term));
  if (existing) {
    state.selected.delete(existing);
  } else if (state.selected.size < 4) {
    state.selected.add(term);
  }

  renderBoard();
  updateControls();
}

function clearSelection() {
  if (state.locked || state.submitting || state.selected.size === 0) {
    return;
  }

  state.selected.clear();
  setStatus("Selection cleared.", "neutral");
  render();
}

function isTermSolved(term) {
  return state.solved.some((group) => group.terms.some((groupTerm) => normalize(groupTerm) === normalize(term)));
}

function selectedArray() {
  return [...state.selected];
}

function selectedGroupMatch() {
  if (state.selected.size !== 4) {
    return null;
  }

  const chosen = new Set(selectedArray().map(normalize));
  return allGroups().find((group) => {
    if (state.solved.some((solved) => solved.category === group.category)) {
      return false;
    }
    return group.terms.every((term) => chosen.has(normalize(term)));
  }) || null;
}

function oneAwayGroup() {
  if (state.selected.size !== 4) {
    return null;
  }

  const chosen = new Set(selectedArray().map(normalize));
  return allGroups().find((group) => {
    if (state.solved.some((solved) => solved.category === group.category)) {
      return false;
    }
    const matches = group.terms.filter((term) => chosen.has(normalize(term))).length;
    return matches === 3;
  }) || null;
}

function formatSelected() {
  return selectedArray().join(", ");
}

async function submitGuess() {
  if (state.locked || state.submitting) {
    return;
  }

  if (state.selected.size !== 4) {
    setStatus("Select exactly 4 terms before submitting.", "neutral");
    return;
  }

  state.submitting = true;
  updateControls();

  const chosenTerms = selectedArray();
  const chosenSet = new Set(chosenTerms.map(normalize));
  const activeTiles = [...elements.board.querySelectorAll(".tile")].filter((tile) =>
    chosenSet.has(normalize(tile.dataset.term || ""))
  );

  const match = selectedGroupMatch();
  const nearMatch = match ? null : oneAwayGroup();

  if (match) {
    activeTiles.forEach((tile, index) => {
      const cls = "shake-vertical";
      tile.classList.add(cls, "shaking");
      tile.style.animationDelay = `${index * 200}ms`;
      const handler = function onEnd(e) {
        if (e.animationName === "shake-vertical") {
          tile.classList.remove(cls, "shaking");
          tile.style.animationDelay = "";
          tile.removeEventListener("animationend", handler);
        }
      };
      tile.addEventListener("animationend", handler);
    });
  } else {
    // Ensure all incorrect tiles start shaking in perfect sync.
    // Set zero delay and clear any prior animation state, then add class in RAF.
    activeTiles.forEach((tile) => {
      tile.style.animationDelay = "0ms";
      tile.classList.remove("shake");
    });

    // Force a reflow so the browser registers the class removal/reset.
    void elements.board.offsetWidth;

    requestAnimationFrame(() => {
      activeTiles.forEach((tile) => {
        const cls = "shake";
        tile.classList.add(cls, "shaking");
        const handler = function onEnd(e) {
          if (e.animationName === "shake") {
            tile.classList.remove(cls, "shaking");
            tile.style.animationDelay = "";
            tile.removeEventListener("animationend", handler);
          }
        };
        tile.addEventListener("animationend", handler);
      });
    });
  }

  await sleep(match ? 1250 : 750);

  if (match) {
    state.solved.push(match);
    state.selected.clear();
    syncSolvedGroups();

    if (state.solved.length === allGroups().length) {
      state.locked = true;
      setStatus("", "neutral");
      showOverlayMessage("You win!");
    }

    render();
    state.submitting = false;
    updateControls();
    return;
  }

  state.mistakes += 1;
  if (nearMatch) {
    setStatus("", "neutral");
    showOverlayMessage("One away");
  } else {
    setStatus("", "neutral");
  }
  state.selected.clear();

  if (state.mistakes >= 4) {
    state.locked = true;
    setStatus("", "neutral");
    showOverlayMessage("Game over");
  }

  render();
  state.submitting = false;
  updateControls();
}

function renderSolvedGroups() {
  elements.solvedGroups.innerHTML = "";

  for (const group of state.solved) {
    const card = document.createElement("article");
    card.className = "solved-group solved-row";
    card.style.background = DIFFICULTY_COLORS[group.difficulty];

    const heading = document.createElement("div");
    heading.className = "group-title";
    heading.textContent = group.category;

    const list = document.createElement("div");
    list.className = "term-list";
    // render terms as a comma-separated, alphabetized string
    const sorted = [...group.terms].slice().sort((a, b) => a.localeCompare(b));
    list.textContent = sorted.join(", ");

    card.append(heading, list);
    elements.solvedGroups.appendChild(card);
  }
}

function renderBoard() {
  const previousRects = new Map();
  for (const tile of elements.board.querySelectorAll(".tile")) {
    previousRects.set(tile.dataset.term, tile.getBoundingClientRect());
  }

  elements.board.innerHTML = "";

  if (state.locked) {
    return;
  }

  const terms = remainingTerms();

  for (const term of terms) {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "tile shrink";
    tile.dataset.term = term;
    tile.textContent = term;
    tile.setAttribute("aria-pressed", String(isSelected(term)));

    if (isSelected(term)) {
      tile.classList.add("selected");
    }

    if (isTermSolved(term)) {
      tile.classList.add("revealed");
    }

    tile.disabled = state.locked || isTermSolved(term);

    tile.addEventListener("click", () => toggleTerm(term));
    elements.board.appendChild(tile);
  }

  requestAnimationFrame(() => {
    for (const tile of elements.board.querySelectorAll(".tile")) {
      const term = tile.dataset.term;
      const previousRect = previousRects.get(term);
      if (!previousRect) {
        continue;
      }

      const nextRect = tile.getBoundingClientRect();
      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (deltaX === 0 && deltaY === 0) {
        continue;
      }

      tile.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      tile.style.transition = "transform 0s";
      requestAnimationFrame(() => {
        tile.style.transition = "transform 220ms cubic-bezier(0.2, 0, 0, 1)";
        tile.style.transform = "";
      });
    }
  });
}

function updateControls() {
  elements.submitButton.disabled = state.locked || state.submitting || state.selected.size !== 4;
  elements.shuffleButton.disabled = state.locked || state.submitting || remainingTerms().length <= 1;
  elements.deselectButton.disabled = state.locked || state.submitting || state.selected.size === 0;
  elements.restartButton.disabled = !state.game;

  const remainingMistakes = Math.max(0, 4 - state.mistakes);
  elements.mistakesCircles.innerHTML = "";
  for (let index = 0; index < 4; index += 1) {
    const circle = document.createElement("span");
    circle.className = "mistake-circle";
    if (index >= remainingMistakes) {
      circle.classList.add("used");
    }
    elements.mistakesCircles.appendChild(circle);
  }
}

function render() {
  renderSolvedGroups();
  renderBoard();
  updateControls();
}

function shuffleRemaining() {
  if (state.locked) {
    return;
  }
  state.shuffledOrder = shuffleArray(remainingTerms());
  renderBoard();
}

async function loadGame(gameId) {
  const game = await fetchGame(gameId);
  updateUrl(game.id);
  resetRound(game);
  setStatus("", "neutral");
  elements.gameSelect.value = game.id;
}

async function initialize() {
  elements.gameSelect = document.getElementById("game-select");
  elements.restartButton = document.getElementById("restart-button");
  elements.shuffleButton = document.getElementById("shuffle-button");
  elements.deselectButton = document.getElementById("deselect-button");
  elements.submitButton = document.getElementById("submit-button");
  elements.board = document.getElementById("board");
  elements.solvedGroups = document.getElementById("solved-groups");
  elements.mistakesCircles = document.getElementById("mistakes-circles");
  elements.statusMessage = document.getElementById("status-message");
  elements.overlayMessage = document.getElementById("overlay-message");

  const games = await fetchGameList();
  elements.gameSelect.innerHTML = "";

  for (const game of games) {
    const option = document.createElement("option");
    option.value = game.id;
    option.textContent = game.title;
    elements.gameSelect.appendChild(option);
  }

  const requestedGameId = getQueryGameId() || games[0]?.id;
  const startingGameId = games.some((game) => game.id === requestedGameId) ? requestedGameId : games[0]?.id;

  elements.gameSelect.value = startingGameId;
  elements.gameSelect.addEventListener("change", () => loadGame(elements.gameSelect.value));
  elements.restartButton.addEventListener("click", () => loadGame(elements.gameSelect.value));
  elements.shuffleButton.addEventListener("click", shuffleRemaining);
  elements.deselectButton.addEventListener("click", clearSelection);
  elements.submitButton.addEventListener("click", submitGuess);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      submitGuess();
    }
    if (event.key.toLowerCase() === "r") {
      shuffleRemaining();
    }
  });

  await loadGame(startingGameId);
}

initialize().catch((error) => {
  console.error(error);
  elements.statusMessage = document.getElementById("status-message");
  if (elements.statusMessage) {
    elements.statusMessage.textContent = "Failed to load the game.";
  }
});
