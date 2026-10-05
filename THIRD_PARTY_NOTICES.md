# Third-party notices and upstream terms

This document records notices and terms for third-party code included in hcscat Multi CLI. hcscat Multi CLI's own source code is licensed under Apache-2.0; see [LICENSE](LICENSE), [NOTICE](NOTICE), and [README](README.md#license-and-third-party-notices). The project license does not relicense third-party dependencies or provider marks, whose separate terms remain applicable.

## Claude Agent SDK

hcscat Multi CLI bundles the session-listing API of `@anthropic-ai/claude-agent-sdk` version **0.3.286**. That installed package declares `SEE LICENSE IN README.md` in its license field. Its upstream README refers readers to Anthropic's Commercial Terms of Service and Privacy Policy. This notice is not a determination that a particular redistribution is permitted; distribution terms remain a release-review item.

- [Package source](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Anthropic Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms)
- [Anthropic Privacy Policy](https://www.anthropic.com/legal/privacy) — a data-handling policy, not the project's software license

The upstream package README is preserved in `dist/claude-sdk-README.md`. License comments present in bundled source are preserved inline by esbuild. esbuild is a build-time dependency, not a CLI or native agent shipped in this VSIX. No Claude CLI binary is included.

Preserve the upstream README and bundled notices when packaging. Review this document against the locked dependency version when upgrading the SDK or changing what is bundled. Third-party terms continue to apply independently of any project license selected for hcscat Multi CLI.

## Provider marks

The provider names and logos belong to their respective owners. hcscat Multi CLI is an independent extension and is not endorsed by OpenAI, Google, or Anthropic. These marks identify provider session entries and terminal tabs; they are not hcscat Multi CLI's application logo and are not covered by a project software-license grant.

- **Codex:** the ChatGPT/OpenAI Blossom. The black and white SVG paths come from the official OpenAI VS Code extension (`openai.chatgpt`, version 26.930.31730, `resources/blossom-black.svg` and `resources/blossom-white.svg`). Only the display dimensions and surrounding viewport padding were adjusted; the paths and colors are unchanged. [OpenAI design guidelines and marks terms](https://openai.com/brand/).
- **Antigravity (agy):** Google's full-color gradient G, selected as the provider marker. This is not a per-session model indicator or an assertion that every agy session uses Gemini. The official `GoogleG_FullColor_RGB.png` is embedded byte-for-byte in both SVG wrappers, with a centered viewport for the icon slot. There are no runtime asset downloads. Original PNG SHA-256: `4d5cfbd85af19c003770a74f8de210156ca42c54ac0a4cb0d95572c286c882a6`. [Google brand resources](https://about.google/brand-resource-center/brand-elements/) and [gradient G announcement](https://blog.google/company-news/inside-google/company-announcements/gradient-g-logo-design/).
- **Claude Code:** the official **Claude Spark - Clay.svg** from Anthropic's press kit, keeping the original path and `#D97757` color on both themes. Only display dimensions and viewport padding were adjusted. The former eight-spoke custom glyph was not the official Spark. [Anthropic newsroom and press kit](https://www.anthropic.com/news).

Preserve these attributions and review the owners' current brand terms when distributing the extension. The inclusion of an asset does not imply a general right to reuse or relicense the trademark.
