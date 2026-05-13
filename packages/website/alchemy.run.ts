import { Stack } from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as GitHub from "alchemy/GitHub"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"

const accountId = "6319f7fbe0ac4f1a020aae72691e9897"
const owner = "gunta"
const repository = "ingraft"

export default Stack(
  "ingraft-website",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const site = yield* Cloudflare.StaticSite("ingraft-website", {
      main: "./src/worker.ts",
      command: "bun run build",
      outdir: "dist",
      domain: "ingraft.dev",
      assetsConfig: {
        htmlHandling: "auto-trailing-slash",
        notFoundHandling: "404-page",
      },
    })

    yield* GitHub.Secret("cf-account-id", {
      owner,
      repository,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    })

    const cfApiToken = process.env.CLOUDFLARE_API_TOKEN
    if (cfApiToken) {
      yield* GitHub.Secret("cf-api-token", {
        owner,
        repository,
        name: "CLOUDFLARE_API_TOKEN",
        value: Redacted.make(cfApiToken),
      })
    }

    const alchemyPassword = process.env.ALCHEMY_PASSWORD
    if (alchemyPassword) {
      yield* GitHub.Secret("alchemy-password", {
        owner,
        repository,
        name: "ALCHEMY_PASSWORD",
        value: Redacted.make(alchemyPassword),
      })
    }

    return { url: site.url }
  }),
)
