// ESLint flat config — dev tooling only (npm run lint).
import js from "@eslint/js";
import globals from "globals";

export default [
    { ignores: ["dist/", "node_modules/"] },
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            globals: globals.browser,
        },
        rules: {
            "no-unused-vars": ["error", { ignoreRestSiblings: true }],
            "array-callback-return": "error",
            "eqeqeq": ["error", "smart"],
            "no-self-compare": "error",
            "no-template-curly-in-string": "error",
            "no-throw-literal": "error",
            "no-unmodified-loop-condition": "error",
            "no-useless-concat": "error",
            "no-var": "error",
            "object-shorthand": "error",
            "prefer-const": "error",
        },
    },
    {
        files: ["tools/**/*.js", "tests/run.js", "tests/unit/**/*.js", "eslint.config.js"],
        languageOptions: { globals: globals.node },
    },
];
