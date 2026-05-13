# Voice and Vocabulary

## Tone

Ingraft is a developer tool. Speak the way good developer-tool docs speak.

- **Precise.** Name the exact thing. "Vendor the repo as a subtree" beats "bring the code in."
- **Technical-friendly.** Assume the reader knows git, npm, and basic CLI conventions. Don't over-explain.
- **Agent-aware.** Half of Ingraft's users are humans driving agents; the other half are agents themselves. Write copy that reads correctly in both contexts.
- **Quiet.** No exclamation marks, no marketing froth, no emoji in product copy. Reserve enthusiasm for the changelog and the launch tweet.
- **Confident.** "Ingraft vendors upstream source into your repo" — not "Ingraft can help you vendor..." or "Ingraft aims to..."

Think: the README for `ripgrep`, `bun`, or `astro`. Not the homepage of a B2B SaaS.

## Glossary

The vocabulary inside Ingraft reuses the horticulture metaphor consistently. Use these terms in docs and copy where they fit; do not invent synonyms.

| Term                             | Meaning                                                                                 |
| -------------------------------- | --------------------------------------------------------------------------------------- |
| **graft** / **ingraft** _(verb)_ | The operation of inserting upstream source into the host repo.                          |
| **scion**                        | The upstream repository being vendored — the piece grafted _in_.                        |
| **rootstock**                    | The host project — the repo that receives the graft.                                    |
| **vendor/**                      | The directory where ingrafts land (Go-style vendoring convention).                      |
| **strategy**                     | The mechanism used to ingraft: `subtree`, `submodule`, `clone-ignore`, or `cache-link`. |
| **refresh**                      | Re-emit agent docs, tool ignores, and project surfaces from the current vendor state.   |
| **doctor**                       | Diagnose drift between vendor state and project configuration.                          |

## What to call the tool

- The product/brand: **Ingraft**
- The CLI command: `ingraft`
- The agent skill: `@ingraft/skill` (npm) / `ingraft` (skill name)
- The vendoring activity it performs: "vendoring" (the verb stays generic; Ingraft is the tool that does it)

## What NOT to call it

- ❌ "the subtree tool" — leaks the mechanism; we support multiple strategies
- ❌ "the vendoring tool" — fine in introductory bridge sentences ("Ingraft, the vendoring tool from the Effect article"), but the name is `Ingraft`, not "the vendoring tool"
- ❌ "INGRAFT" / "in-graft" / "Ingraft.io" — wrong forms
