export default [
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    rules: {
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "use-isnan": "error",
    },
  },
];
