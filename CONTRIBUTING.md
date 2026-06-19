# Contributing

DevSurface turns a Node.js repository into a local developer control panel.

## Setup

```bash
npm install
npm run build
npm test
```

## Local Smoke Test

```bash
cd examples/node-basic
npm install
node ../../dist/cli/index.js scan
node ../../dist/cli/index.js doctor
node ../../dist/cli/index.js
```

The dashboard binds to `127.0.0.1:4567`.

## Pull Requests

- Keep changes focused.
- Include tests for scanner, doctor, config, and process behavior.
- Run `npm run lint`, `npm test`, and `npm run build` before submitting.
