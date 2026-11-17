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

const pickAnswer = (len, level) => {
  const day = todayKey(); // змінюється раз на добу
  const list = WORDS[len];
  return list[hashSeed(`${day}-${len}-${level}`) % list.length];
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
  const toastTimer = useRef();

  const len = mode;
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
    if (!wordSet.has(current)) {
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
    } else if (next.length === ROWS) {
      setTimeout(() => setStatus("lost"), len * 300 + 400);
    }
  }, [current, guesses, answer, len, wordSet]);

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

  const restart = () => {
    const next = level + 1;
    setLevel(next);
    localStorage.setItem(levelKey(mode), String(next));
    setAnswer(pickAnswer(mode, next));
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
    setToast("");
  };

  const changeMode = (m) => {
    if (m === mode) return;
    setMode(m);
    const saved = Number(localStorage.getItem(levelKey(m)));
    const lvl = saved > 0 ? saved : 1;
    setLevel(lvl);
    setAnswer(pickAnswer(m, lvl));
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
    setToast("");
  };

  const rows = Array.from({ length: ROWS }, (_, r) => {
    if (r < guesses.length) return { letters: guesses[r], states: evaluate(guesses[r], answer), done: true };
    if (r === guesses.length) return { letters: current, states: [], done: false, active: true };
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
        <p>Рівень {level} — відгадай слово з {len} літер за {ROWS} спроб</p>
        {import.meta.env.DEV && <p className="debug-word">Слово: {answer}</p>}
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
