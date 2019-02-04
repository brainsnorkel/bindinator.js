module.exports = {
  "env": {
    "browser": true,
    "es6": true
  },
  "extends": "eslint:recommended",
  "parserOptions": {
    "ecmaVersion": 2018,
    "sourceType": "module"
  },
  "rules": {
    /*
    "indent": [
      "warn",
      2
    ],
    */
    "linebreak-style": [
      "error",
      "unix"
    ],
    "quotes": [
      "error",
      "single"
    ],
    "semi": [
      "error",
      "always"
    ]
  },
  "overrides": {
    "files": [
      "source/*.js",
      "lib/*.js",
    ],
    "excludedFiles": [
      "third-party/*",
      "*.min.js",
    ],
  },
};