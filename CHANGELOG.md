# @transomjs/transom-core change log

## Unreleased
- Rewritten in TypeScript, with type definitions. The compiled code is in `dist/`;
  `require("@transomjs/transom-core")` and `require("@transomjs/transom-core/wrapper")`
  return the same things as before.
- Types: `TransomServer`, `TransomPlugin<Options>`, `TransomApiDefinition`, `Registry`, and
  `RegistryMap` (extend it with declaration merging to type your own registry keys).
- The deprecated `opts`, `pre`, `rm` and `inflightRequests` methods no longer throw when the
  server has no logger; they skip the warning instead.
- The timezone warning no longer throws when there's no entry script (e.g. `node -e`).
- **Fixed: `mapParams` had no effect with Express.** The body, query and form values were
  copied onto `req.params` by middleware, and Express replaces `req.params` at every
  router layer, so no route ever saw them. With transom-sequelize that meant query
  filters, `_limit` and `_sort` were ignored, so a filtered `DELETE` deleted every row,
  unless the app copied the query itself. The values are now copied in as the first
  handler of each route registered through the server (`server.get()`, `post()`, `put()`,
  `patch()`, `del()`, `head()`, `options()`):
  - route parameters always win (a body or query value never overrides `:id`);
  - otherwise later sources override earlier ones: JSON body, then query, then form;
  - a `__proto__` key is ignored;
  - middleware added with `use()`, and routes added straight to `server.express`, don't
    get the values. Apps that worked around the bug by copying `req.query` themselves
    keep working.
- The package no longer ships `CLAUDE.md` or `.claude/`.

## 2.0.7
- More updates

## 2.0.3
- Added the CookieParser for use with cookie based JWTs. Updated deps.

## 2.0.2
- Updated serialised the initialization so that their order is preserved during startup!

## 2.0.1
- Updated dependencies

## 2.0.0
- Updated to Restify 8.x & min Node 8.

## 1.2.2
- Updated tests and fixed mis-wrapped close method

## 1.1.0
- Updated dependencies to the latest versions & rebuilt the packacge-lock.json
- Added deploy task to package.json

## earlier
- Working as documented and not previously change-logged.