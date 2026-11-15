import { useCallback, useEffect, useRef, useState } from "react";

const ANSWER = "біфштекс"; // захардкоджене слово
const LEN = ANSWER.length;
const ROWS = 6;

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

// Класичний алгоритм Wordle з правильною обробкою повторюваних літер
function evaluate(guess) {
  const result = Array(LEN).fill("absent");
  const left = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === ANSWER[i]) result[i] = "correct";
    else left[ANSWER[i]] = (left[ANSWER[i]] || 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (result[i] !== "correct" && left[guess[i]] > 0) {
      result[i] = "present";
      left[guess[i]]--;
    }
  }
  return result;
}

const RANK = { absent: 1, present: 2, correct: 3 };

export default function App() {
  const [guesses, setGuesses] = useState([]);
  const [current, setCurrent] = useState("");
  const [status, setStatus] = useState("playing"); // playing | won | lost
  const [shake, setShake] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef();

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 1600);
  };

  const keyStates = {};
  guesses.forEach((g) => {
    evaluate(g).forEach((s, i) => {
      const ch = g[i];
      if (!keyStates[ch] || RANK[s] > RANK[keyStates[ch]]) keyStates[ch] = s;
    });
  });

  const submit = useCallback(() => {
    if (current.length < LEN) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      showToast("Недостатньо літер");
      return;
    }
    const next = [...guesses, current];
    setGuesses(next);
    setCurrent("");
    if (current === ANSWER) {
      setTimeout(() => setStatus("won"), LEN * 300 + 400);
    } else if (next.length === ROWS) {
      setTimeout(() => setStatus("lost"), LEN * 300 + 400);
    }
  }, [current, guesses]);

  const press = useCallback(
    (key) => {
      if (status !== "playing") return;
      if (key === "Enter") return submit();
      if (key === "⌫" || key === "Backspace") return setCurrent((c) => c.slice(0, -1));
      if (current.length < LEN) setCurrent((c) => c + key);
    },
    [status, submit, current.length]
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
    setGuesses([]);
    setCurrent("");
    setStatus("playing");
  };

  const rows = Array.from({ length: ROWS }, (_, r) => {
    if (r < guesses.length) return { letters: guesses[r], states: evaluate(guesses[r]), done: true };
    if (r === guesses.length) return { letters: current, states: [], done: false, active: true };
    return { letters: "", states: [], done: false };
  });

  return (
    <div className="app">
      <header>
        <h1>ПАМ ПАМ</h1>
        <p>Відгадай слово з {LEN} літер за {ROWS} спроб</p>
      </header>

      <div className="toast" aria-live="polite">{toast && <span>{toast}</span>}</div>

      <main className="board" role="grid">
        {rows.map((row, r) => (
          <div key={r} className={"row" + (row.active && shake ? " shake" : "")} role="row">
            {Array.from({ length: LEN }, (_, i) => {
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
              : <>Спроби скінчились. Слово: <b>{ANSWER.toUpperCase()}</b></>}
          </p>
          <button onClick={restart}>Грати знову</button>
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
