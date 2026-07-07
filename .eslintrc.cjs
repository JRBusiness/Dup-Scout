module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  env: { node: true, es2022: true },
  parserOptions: { sourceType: "module", ecmaVersion: 2022 },
  ignorePatterns: ["dist", "node_modules"],
};
