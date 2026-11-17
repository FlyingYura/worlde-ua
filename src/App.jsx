import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WORDS } from "./words.js";

const ROWS = 6;
const MODES = [5, 6, 7];

const KEYBOARD = [
  ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ", "з", "х", "ї"],
  ["ф", "і", "в", "а", "п", "р", "о", "л", "д", "ж", "є", "ґ"],
  ["Enter", "я", "ч", "с", "м", "и", "т", "ь", "б", "ю", "⌫"],
];

// Щоб гра працювала і з англійською розкладкою — мапимо фізичні клавіші
const CODE_MAP = {
  KeyQ: "й", KeyW: "ц", KeyE: "у", KeyR: "к", KeyT: "е", KeyY: "н", KeyU: "г",
  KeyI: "ш", KeyO: "щ", KeyP: "з", BracketLeft: "х", BracketRight: "ї",
  KeyA: "ф", KeyS: "і", KeyD: "в", KeyF: "а", KeyG: "п", KeyH: "р", KeyJ: "о",
  KeyK: "л", KeyL: "д", Semicolon: "ж", Quote: "є", Backquote: "ґ",
  KeyZ: "я", KeyX: "ч", KeyC: "с", KeyV: "м", KeyB: "и", KeyN: "т", KeyM: "ь",
  Comma: "б", Period: "ю",
};

// Детермінований вибір слова: однаковий для всіх у певний день і на певному рівні
const hashSeed = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const todayKey = () => Math.floor(Date.now() / 86400000);
const levelKey = (m) => `wordle-level-${todayKey()}-${m}`;
const hintKey = (m) => `wordle-hint-${todayKey()}-${m}`;
const HINT_INTERVAL = 4; // 1 підказка на 4 рівні

// Детермінований ГПВЧ: однаковий у всіх користувачів для одного насіння
const mulberry32 = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Перемішаний список слів на день: Fisher–Yates з насінням (дата + довжина).
// Однаковий у всіх гравців, слова не повторюються, доки не скінчаться всі.
const dailyListCache = new Map();
const getDailyList = (len) => {
  const key = `${todayKey()}-${len}`;
  if (!dailyListCache.has(key)) {
    if (dailyListCache.size > 50) dailyListCache.clear();
    const arr = [...WORDS[len]];
    const rand = mulberry32(hashSeed(key));
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    dailyListCache.set(key, arr);
  }
  return dailyListCache.get(key);
};

const pickAnswer = (len, level) => {
  const list = getDailyList(len);
  return list[(level - 1) % list.length];
};

// Класичний алгоритм Wordle з правильною обробкою повторюваних літер
function evaluate(guess, answer) {
  const len = answer.length;
  const result = Array(len).fill("absent");
  const left = {};
  for (let i = 0; i < len; i++) {
    if (guess[i] === answer[i]) result[i] = "correct";
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < len; i++) {
    if (result[i] !== "correct" && left[guess[i]] > 0) {
      result[i] = "present";
      left[guess[i]]--;
    }
  }
  return result;
}

const RANK = { absent: 1, present: 2, correct: 3 };

export default function App() {
  const [mode, setMode] = useState(5);
  const [level, setLevel] = useState(() => {
    const saved = Number(localStorage.getItem(levelKey(5)));
    return saved > 0 ? saved : 1;
  });
  const [answer, setAnswer] = useState(() => pickAnswer(5, level));
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState("playing"); // playing | won | lost
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState("");
  const [unlimited, setUnlimited] = useState(false); // безліміт спроб
  const [free, setFree] = useState(false);           // довільні (не лише словникові) слова
  const [hints, setHints] = useState(() => new Set()); // розкриті позиції слова
  const [lastHintLevel, setLastHintLevel] = useState(() => {
    const saved = Number(localStorage.getItem(hintKey(5)));
    return saved > 0 ? saved : 0;
  });
  const toastTimer = useRef();

  const len = mode;
  const maxRows = unlimited ? Infinity : ROWS;
  const wordSet = useMemo(() => new Set(WORDS[mode]), [mode]);

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  };

  const keyStates = {};
  guesses.forEach((g) => {
    evaluate(g, answer).forEach((s, i) => {
      const ch = g[i];
      if (!keyStates[ch] || RANK[s] > RANK[keyStates[ch]]) keyStates[ch] = s;
    });
  });

  const submit = useCallback(() => {
    if (current.length < len) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      showToast("Недостатньо літер");
      return;
    }
    if (!free && !wordSet.has(current)) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      showToast("Такого слова немає в словнику");
      return;
    }
    const next = [...guesses, current];
    setGuesses(next);
    setCurrent("");
    if (current === answer) {
      setTimeout(() => setStatus("won"), len * 300 + 400);
    } else if (next.length === ROWS && !unlimited) {
      setTimeout(() => setStatus("lost"), len * 300 + 400);
    }
  }, [current, guesses, answer, len, wordSet, free, unlimited]);

  const press = useCallback(
    (key) => {
      if (status !== "playing") return;
      if (key === "Enter") return submit();
      if (key === "⌫" || key === "Backspace") return setCurrent((c) => c.slice(0, -1));
      if (current.length < len) setCurrent((c) => c + key);
    },
    [status, submit, current.length, len]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter" || e.key === "Backspace") {
        e.preventDefault();
        return press(e.key);
      }
      const k = e.key.toLowerCase();
      if (/^[а-яіїєґ]$/.test(k)) return press(k);
      if (CODE_MAP[e.code]) press(CODE_MAP[e.code]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const newGame = (lvl, m = mode) => {
    setLevel(lvl);
    setAnswer(pickAnswer(m, lvl));
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
    setHints(new Set());
    setToast("");
  };

  const restart = () => {
    const next = level + 1;
    localStorage.setItem(levelKey(mode), String(next));
    newGame(next);
  };

  const resetLevel = () => {
    localStorage.removeItem(levelKey(mode));
    newGame(1);
  };

  const loadLevel = (m) => {
    const saved = Number(localStorage.getItem(levelKey(m)));
    return saved > 0 ? saved : 1;
  };

  const changeMode = (m) => {
    if (m === mode) return;
    setMode(m);
    const lvl = loadLevel(m);
    setLastHintLevel(Number(localStorage.getItem(hintKey(m))) || 0);
    newGame(lvl, m);
  };

  // Перемикачі-режими: безліміт і довільні слова взаємовиключні
  const toggleUnlimited = () => {
    const next = !unlimited;
    setUnlimited(next);
    if (next) setFree(false);
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
    setHints(new Set());
  };

  const toggleFree = () => {
    const next = !free;
    setFree(next);
    if (next) setUnlimited(false);
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
    setHints(new Set());
  };

  // Підказка: розкриває одну невідому літеру; доступна раз на HINT_INTERVAL рівнів
  const canHint =
    status === "playing" &&
    hints.size < len &&
    (lastHintLevel === 0 || level - lastHintLevel >= HINT_INTERVAL);

  const useHint = () => {
    if (!canHint) return;
    const hidden = Array.from({ length: len }, (_, i) => i).filter((i) => !hints.has(i));
    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    const next = new Set(hints);
    next.add(pick);
    setHints(next);
    setLastHintLevel(level);
    localStorage.setItem(hintKey(mode), String(level));
    showToast(`Відкрито літеру: ${answer[pick].toUpperCase()}`);
  };

  const rowCount = unlimited ? guesses.length + 2 : ROWS;
  const rows = Array.from({ length: rowCount }, (_, r) => {
    if (r < guesses.length) return { letters: guesses[r], states: evaluate(guesses[r], answer), done: true };
    if (r === guesses.length) return { letters: current, states: [], done: false, active: status === "playing" };
    return { letters: "", states: [], done: false };
  });

  return (
    <div className="app">
      <header>
        <h1>ПАМ ПАМ</h1>
        <div className="modes" role="group" aria-label="Кількість літер">
          {MODES.map((m) => (
            <button
              key={m}
              className={"mode-btn" + (m === mode ? " active" : "")}
              onClick={() => changeMode(m)}
            >
              {m} літер
            </button>
          ))}
        </div>
        <div className="modes toggles" role="group" aria-label="Додаткові режими">
          <button
            className={"mode-btn toggle" + (unlimited ? " active" : "")}
            onClick={toggleUnlimited}
            aria-pressed={unlimited}
          >
            Безліміт спроб
          </button>
          <button
            className={"mode-btn toggle" + (free ? " active" : "")}
            onClick={toggleFree}
            aria-pressed={free}
          >
            Довільні слова
          </button>
        </div>
        <p>
          Рівень {level} — відгадай слово з {len} літер{" "}
          {unlimited ? "без обмеження спроб" : `за ${ROWS} спроб`}
          {free ? ", можна вводити будь-які слова" : ""}
        </p>
        {hints.size > 0 && (
          <div className="hints" aria-label="Підказки">
            {Array.from({ length: len }, (_, i) => (
              <span key={i} className={"hint-letter" + (hints.has(i) ? " revealed" : "")}>
                {hints.has(i) ? answer[i].toUpperCase() : "·"}
              </span>
            ))}
          </div>
        )}
        <button className="hint-btn" onClick={useHint} disabled={!canHint}
          title={canHint ? "Відкрити одну літеру слова" : "Підказка буде доступна пізніше"}>
          💡 Підказка{lastHintLevel > 0 ? ` (наступна через ${Math.max(0, HINT_INTERVAL - (level - lastHintLevel))} рівн.)` : ""}
        </button>
        {import.meta.env.DEV && (
          <p className="debug-word">
            Слово: {answer}{" "}
            <button className="debug-reset" onClick={resetLevel} title="Повернутись на 1 рівень">
              ⟲ рівень 1
            </button>
          </p>
        )}
      </header>

      <div className="toast" aria-live="polite">{toast && <span>{toast}</span>}</div>

      <main className="board" role="grid" style={{ "--cols": len }}>
        {rows.map((row, r) => (
          <div key={r} className={"row" + (row.active && shake ? " shake" : "")} role="row">
            {Array.from({ length: len }, (_, i) => {
              const ch = row.letters[i] || "";
              const cls = ["tile"];
              if (row.done) cls.push("flip", row.states[i]);
              else if (ch) cls.push("filled");
              return (
                <div key={i} className={cls.join(" ")} style={{ "--i": i }} role="gridcell">
                  {ch}
                </div>
              );
            })}
          </div>
        ))}
      </main>

      {status !== "playing" && (
        <section className="result">
          <p>
            {status === "won"
              ? `Вгадано за ${guesses.length} ${guesses.length === 1 ? "спробу" : guesses.length < 5 ? "спроби" : "спроб"}!`
              : "Спроби скінчились."}
          </p>
          <p className="answer">Правильне слово: <b>{answer.toUpperCase()}</b></p>
          <button onClick={restart}>Наступний рівень</button>
        </section>
      )}

      <footer className="keyboard">
        {KEYBOARD.map((row, r) => (
          <div key={r} className="krow">
            {row.map((k) => (
              <button
                key={k}
                className={"key " + (keyStates[k] || "") + (k.length > 1 || k === "⌫" ? " wide" : "")}
                onClick={() => press(k)}
                aria-label={k === "⌫" ? "Видалити" : k}
              >
                {k === "Enter" ? "Ввід" : k}
              </button>
            ))}
          </div>
        ))}
      </footer>
    </div>
  );
}
