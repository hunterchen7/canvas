# Changelog

## [0.12.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.12.0...canvas-v0.12.1) (2026-07-18)


### Bug Fixes

* **example:** restore draggable hover expansion ([b8beec7](https://github.com/hunterchen7/canvas/commit/b8beec7b858bc5633164d1b3cadb3ba4ea616415))
* make window dimensions hydration-safe ([8ba2789](https://github.com/hunterchen7/canvas/commit/8ba2789edef5af21860b0c5711cb1cb5321a0d69))
* **perf:** load fixture identity from virtual module ([d012bfa](https://github.com/hunterchen7/canvas/commit/d012bfa27ac0821d81528380603b0b17bde1f086))


### Performance Improvements

* avoid pinch gesture allocations ([e12e696](https://github.com/hunterchen7/canvas/commit/e12e696b8239f301205c281176531c949fa45e8c))
* avoid unused toolbar renders ([21eb249](https://github.com/hunterchen7/canvas/commit/21eb249a5f52f8fb2216fb4d78b5cfab8859214d))
* benchmark and optimize Canvas hot paths ([acf64f7](https://github.com/hunterchen7/canvas/commit/acf64f79bf577ffed13232df347f593afb2632dc))
* enable safe module tree shaking ([ca7bd7c](https://github.com/hunterchen7/canvas/commit/ca7bd7c37167f7552bc4aabb568710a4e5aa8765))
* reduce wheel and pan hot-path reads ([6f061de](https://github.com/hunterchen7/canvas/commit/6f061de00a09f649a862d6244aa80c067e18aeed))
* render static intro logo without motion ([dcf751d](https://github.com/hunterchen7/canvas/commit/dcf751d0280c546d01a97b83e4dd987e0cf841c5))
* reuse draggable hit-test geometry ([788630e](https://github.com/hunterchen7/canvas/commit/788630ea7d916fdae8fb674cb8d819e777bd1262))
* reuse internal window dimensions ([620c7c2](https://github.com/hunterchen7/canvas/commit/620c7c2b8e68d97eb9b0b5fcdc22c54b7c4740ed))
* share window resize subscriptions ([094f4bd](https://github.com/hunterchen7/canvas/commit/094f4bd85f64e2e134c734a82e8d8042c51a98aa))
* skip unused high-mode visibility subscriptions ([363f6ee](https://github.com/hunterchen7/canvas/commit/363f6ee0dbc58da48125012322477f3ed946cda8))
* stop loading updates after intro ([ceec911](https://github.com/hunterchen7/canvas/commit/ceec911fc45653e564bd8b068ef1169439d0a7d7))


### Documentation

* **perf:** explain paired profiling workflows ([dc6b92f](https://github.com/hunterchen7/canvas/commit/dc6b92fccecf7f9a2f3fceba661e7c83efc33a02))
* **perf:** preserve benchmark evidence ([8740f0c](https://github.com/hunterchen7/canvas/commit/8740f0c356cc252bea0b0457ee9384afd0df17c2))


### Miscellaneous Chores

* **deps:** update benchmark tooling ([3c414ab](https://github.com/hunterchen7/canvas/commit/3c414abc0b819b485e7b8d1afb7c4903accc23e2))


### Tests

* **perf:** add benchmark and parity suites ([1dc00ed](https://github.com/hunterchen7/canvas/commit/1dc00ed1cf9e49b114be4f1072d5cbc44e9a1126))
* **perf:** add opt-in deep profiling ([9be6e2a](https://github.com/hunterchen7/canvas/commit/9be6e2a6fecae8a4adad85214d7323052931d603))
* **perf:** amplify draggable hit testing ([eaf4980](https://github.com/hunterchen7/canvas/commit/eaf49800aab7743108f2135d51d6a9f55ef7c877))
* **perf:** amplify wheel pan workload ([f517ded](https://github.com/hunterchen7/canvas/commit/f517ded86066d7d45b9ebfe48cc3dac177365c0a))
* **perf:** benchmark default intro content ([f435142](https://github.com/hunterchen7/canvas/commit/f43514264df3ce1d7954e4e34b29d49cbf559e6f))
* **perf:** benchmark production runtime bundles ([3cc7d1f](https://github.com/hunterchen7/canvas/commit/3cc7d1f47ad198f81abd3961def50a2f4278c160))
* **perf:** benchmark two-pointer pinch hot path ([23fe64b](https://github.com/hunterchen7/canvas/commit/23fe64b471f4b2cc02413625095003b22d1e2473))
* **perf:** compare forced-GC live heap ([f1009eb](https://github.com/hunterchen7/canvas/commit/f1009eb0a25c416298d07972d0f159c62da70ff8))
* **perf:** compare paired profile distributions ([b474560](https://github.com/hunterchen7/canvas/commit/b47456081e6a91205e29fa0d805d8cd29d990783))
* **perf:** compare settled drag transforms ([269f414](https://github.com/hunterchen7/canvas/commit/269f414bf48e18852616c4c65ec1c2da1dcaf790))
* **perf:** cover custom toolbar formatters ([93e247b](https://github.com/hunterchen7/canvas/commit/93e247b0435bb59a13b9cf1d250fb624f5921f9a))
* **perf:** cover dynamic toolbar formatters ([3fdd4e7](https://github.com/hunterchen7/canvas/commit/3fdd4e70b8d3eee58a763d533288e5f73a9cd9ad))
* **perf:** harden paired browser profiling ([28a6d0f](https://github.com/hunterchen7/canvas/commit/28a6d0f31c2385a66b654232fd91fac7453caa35))
* **perf:** instrument wheel hot paths ([8924aba](https://github.com/hunterchen7/canvas/commit/8924aba9470ceaeaa1e412404caf58d584bd414a))
* **perf:** isolate and amplify pinch timing ([acbd818](https://github.com/hunterchen7/canvas/commit/acbd8182e0063274903223e550d8eb59d26fdba1))
* **perf:** load historical source in runtime benchmarks ([1722f51](https://github.com/hunterchen7/canvas/commit/1722f51e9fd48aa5bb3684cc60d5254c84cc7960))
* **perf:** make browser parity fail closed ([4f7c8ac](https://github.com/hunterchen7/canvas/commit/4f7c8ac9d91249abd65381ee768a219f9fe1dc9b))
* **perf:** make parity tracing opt in ([2170b51](https://github.com/hunterchen7/canvas/commit/2170b51dc4db1e3ec2ab468e56b50d051c1a1ddd))
* **perf:** make runtime captures fail closed ([1a86c4a](https://github.com/hunterchen7/canvas/commit/1a86c4a7571bc20b926636c4ac3a2aaa7b0bb25b))
* **perf:** measure draggable hit testing ([ec4e3e5](https://github.com/hunterchen7/canvas/commit/ec4e3e58556c68acd2f152d595f4701690ee7cd3))
* **perf:** measure window dimension fanout ([c355408](https://github.com/hunterchen7/canvas/commit/c355408dcabe1f1187c3e82a39b7ef28b37e8d3a))
* **perf:** profile amplified browser hot paths ([4056c7b](https://github.com/hunterchen7/canvas/commit/4056c7b2f5320657a52fa445dad8682a19330988))
* **perf:** run paired benchmark distributions ([1d41a0c](https://github.com/hunterchen7/canvas/commit/1d41a0c12ceff88a4cc66e08c13031625088d9aa))
* **perf:** separate package artifact budget ([a2d7f4e](https://github.com/hunterchen7/canvas/commit/a2d7f4eef8fe2be62f62b8d00e34b1fa1a0145ff))
* **perf:** support dependency-free reference worktrees ([d6eed3c](https://github.com/hunterchen7/canvas/commit/d6eed3cc83d4148d1550606cb3edad41e901fe6a))


### Continuous Integration

* validate performance pull requests ([4b479bd](https://github.com/hunterchen7/canvas/commit/4b479bdb9fa08f0e04295f0f887d6a3169d73f62))

## [0.12.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.11.1...canvas-v0.12.0) (2026-02-25)


### Features

* add configurable zoom multipliers via zoomConfig prop ([#47](https://github.com/hunterchen7/canvas/issues/47)) ([d8aa866](https://github.com/hunterchen7/canvas/commit/d8aa866d6e105b07613f726ed71cebbc90d2001c))

## [0.11.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.11.0...canvas-v0.11.1) (2026-02-24)


### Bug Fixes

* resize off-screen canvas to match image for alpha detection ([#45](https://github.com/hunterchen7/canvas/issues/45)) ([ee2b982](https://github.com/hunterchen7/canvas/commit/ee2b98200a140bdfc4b287250794b6c4a06f61ac)), closes [#44](https://github.com/hunterchen7/canvas/issues/44)

## [0.11.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.10.1...canvas-v0.11.0) (2026-02-23)


### Features

* add navigateToSection to canvas context ([#42](https://github.com/hunterchen7/canvas/issues/42)) ([2037274](https://github.com/hunterchen7/canvas/commit/203727423b1d7c7d91aa3a0dbfe4f3a702cae512))

## [0.10.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.10.0...canvas-v0.10.1) (2026-02-22)


### Bug Fixes

* skip all animations when skipIntro is true ([#39](https://github.com/hunterchen7/canvas/issues/39)) ([406cd91](https://github.com/hunterchen7/canvas/commit/406cd912f89543a368da090cde3d42772c43e615))

## [0.10.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.9.0...canvas-v0.10.0) (2026-02-05)


### Features

* add panTransition prop for customizable pan-to-home animation timing ([#37](https://github.com/hunterchen7/canvas/issues/37)) ([24d33cd](https://github.com/hunterchen7/canvas/commit/24d33cd8a6fed4118e50347dbfe2a93476014104))

## [0.9.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.8.0...canvas-v0.9.0) (2026-02-03)


### Features

* add rolldown bundler for library builds ([#35](https://github.com/hunterchen7/canvas/issues/35)) ([b88611d](https://github.com/hunterchen7/canvas/commit/b88611d0df261ae837c1979874705bf094343dbf))

## [0.8.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.7.0...canvas-v0.8.0) (2026-01-31)


### Features

* customizable navbar styling ([#34](https://github.com/hunterchen7/canvas/issues/34)) ([3b978ba](https://github.com/hunterchen7/canvas/commit/3b978ba8b35e3df7feff8d3e4dbe69a44b1faa26))


### Documentation

* add claude.md for AI assistant guidelines ([#32](https://github.com/hunterchen7/canvas/issues/32)) ([3f42e85](https://github.com/hunterchen7/canvas/commit/3f42e85428f77a01f88ca942f7454c9308ea1d97))

## [0.7.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.6.0...canvas-v0.7.0) (2026-01-15)


### Features

* Add customizable canvas size ([#26](https://github.com/hunterchen7/canvas/issues/26)) ([d959255](https://github.com/hunterchen7/canvas/commit/d9592557a3eab44cf686e70fb8b090b09e4d08b6))

## [0.6.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.5.0...canvas-v0.6.0) (2026-01-15)


### Features

* toolbar styling ([#29](https://github.com/hunterchen7/canvas/issues/29)) ([063f2e8](https://github.com/hunterchen7/canvas/commit/063f2e88d0dd33fa4e95e48a8f549ba1a25273a2))

## [0.5.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.4.1...canvas-v0.5.0) (2026-01-14)


### Features

* example demo ([#24](https://github.com/hunterchen7/canvas/issues/24)) ([2acdef6](https://github.com/hunterchen7/canvas/commit/2acdef69509177c5c41aec5e6655bccabfec14a9))

## [0.4.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.4.0...canvas-v0.4.1) (2026-01-14)


### Bug Fixes

* npm downloads badge to show total downloads ([#23](https://github.com/hunterchen7/canvas/issues/23)) ([b49c7f7](https://github.com/hunterchen7/canvas/commit/b49c7f7f33454bd08d4356c8a7cef49be678e12d))


### Miscellaneous Chores

* Add npm downloads badge to README ([#21](https://github.com/hunterchen7/canvas/issues/21)) ([71c44e2](https://github.com/hunterchen7/canvas/commit/71c44e2d79b46a6098a9a96b8ad46e60e24c0a6b))

## [0.4.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.3.1...canvas-v0.4.0) (2026-01-13)


### Features

* allow customizable backgrounds ([#18](https://github.com/hunterchen7/canvas/issues/18)) ([9614433](https://github.com/hunterchen7/canvas/commit/9614433ec8349d048e3f1f3e3c1fbd5bddfbadca))

## [0.3.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.3.0...canvas-v0.3.1) (2026-01-13)


### Miscellaneous Chores

* remove `next.js` as dependency ([#13](https://github.com/hunterchen7/canvas/issues/13)) ([a2a727c](https://github.com/hunterchen7/canvas/commit/a2a727c9d9c9800794411ef7b0864292297725a0))

## [0.3.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.2.1...canvas-v0.3.0) (2026-01-12)


### Features

* generic navbar ([#11](https://github.com/hunterchen7/canvas/issues/11)) ([5c85950](https://github.com/hunterchen7/canvas/commit/5c85950dae9ec03135e10065de6ef826241a6fb2))

## [0.2.1](https://github.com/hunterchen7/canvas/compare/canvas-v0.2.0...canvas-v0.2.1) (2026-01-12)


### Bug Fixes

* add repo url to `package.json` ([#9](https://github.com/hunterchen7/canvas/issues/9)) ([687731a](https://github.com/hunterchen7/canvas/commit/687731ae0779004e61f97e91240d70ee126a7709))

## [0.2.0](https://github.com/hunterchen7/canvas/compare/canvas-v0.1.3...canvas-v0.2.0) (2026-01-12)


### Features

* compiled styles ([7293473](https://github.com/hunterchen7/canvas/commit/7293473a2bec90d846235c3e2b22a2f21fa28603))
* release please auto publishing ([0f162ec](https://github.com/hunterchen7/canvas/commit/0f162ec89b6396ff085f8732f918233251860c32))

## [0.1.3](https://github.com/hunterchen7/canvas/releases/tag/v0.1.3) (2026-01-11)

Initial version tracked by release-please.
