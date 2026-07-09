"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "jamquote-theme";

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", choice);
  }
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemeChoice | null;
    if (stored) {
      setChoice(stored);
      applyTheme(stored);
    }
  }, []);

  function choose(next: ThemeChoice) {
    setChoice(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }

  return (
    <div className={styles.toggle} role="group" aria-label="Theme">
      <button
        type="button"
        className={choice === "light" ? styles.active : styles.option}
        onClick={() => choose("light")}
        title="Light theme"
      >
        Light
      </button>
      <button
        type="button"
        className={choice === "system" ? styles.active : styles.option}
        onClick={() => choose("system")}
        title="Match system"
      >
        Auto
      </button>
      <button
        type="button"
        className={choice === "dark" ? styles.active : styles.option}
        onClick={() => choose("dark")}
        title="Dark theme"
      >
        Dark
      </button>
    </div>
  );
}
