import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// Der Linter ergaenzt den Typecheck, er wiederholt ihn nicht: tsc faengt die
// Typfehler, ESLint die Fehler, die typkorrekt sind -- vergessene Abhaengigkeiten
// in Hooks, totes `any`, ungenutzte Variablen.
export default tseslint.config(
  {
    ignores: ["dist", "src-tauri/target", "test-results", "playwright-report"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Bleibt vorerst eine Warnung: die sechs Fundstellen im Bestand
      // (App.tsx, CustomTitleBar, DebugLogPanel, TimeTrackingView) sind echte
      // Umbauten, keine Tippfehler. Auf "error" heben, sobald sie weg sind.
      "react-hooks/set-state-in-effect": "warn",
      // Ein unterstrichener Name sagt "absichtlich ungenutzt" -- fuer
      // Platzhalter in Signaturen, die eine Schnittstelle vorgibt.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Tests und Konfiguration laufen unter Node, nicht im Browser.
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.ts", "*.config.ts", "src/setupTests.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
