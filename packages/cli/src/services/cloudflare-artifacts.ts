import { Context, Effect, Layer, Option } from "effect"

import {
  CloudflareArtifactsConfigMissing,
  CloudflareArtifactsRequestFailed
} from "../domain/errors.ts"

export interface CloudflareArtifactsConfig {
  readonly apiToken: string
  readonly baseUrl: string
}

export interface CloudflareArtifactsImportParams {
  readonly branch: string
  readonly depth: Option.Option<number>
  readonly name: string
  readonly url: string
}

export interface CloudflareArtifactImportResult {
  readonly name: string
  readonly remote: string
  readonly token: string
}

interface CloudflareEnvelope<T> {
  readonly result: T | null
  readonly success: boolean
  readonly errors?: ReadonlyArray<{ readonly message?: string }>
  readonly messages?: ReadonlyArray<{ readonly message?: string }>
}

interface CloudflareImportResult {
  readonly name: string
  readonly remote: string
  readonly token: string
}

export const cloudflareArtifactsConfigFromEnv = (
  env: Record<string, string | undefined> = process.env
): CloudflareArtifactsConfig | null => {
  const apiToken = env.CLOUDFLARE_API_TOKEN
  if (!apiToken) return null
  const baseUrl = env.ARTIFACTS_BASE_URL
  if (baseUrl) return { apiToken, baseUrl: baseUrl.replace(/\/+$/, "") }

  const accountId = env.ACCOUNT_ID ?? env.CLOUDFLARE_ACCOUNT_ID
  if (!accountId) return null
  const namespace = env.ARTIFACTS_NAMESPACE ?? "default"
  return {
    apiToken,
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/artifacts/namespaces/${namespace}`
  }
}

export const isCloudflareImportableRemote = (url: string): boolean =>
  Option.liftThrowable((value: string) => new URL(value))(url).pipe(
    Option.match({
      onNone: () => false,
      onSome: (parsed) => parsed.protocol === "https:"
    })
  )

export const cloudflareImportRequest = ({
  branch,
  config,
  depth,
  name,
  url
}: CloudflareArtifactsImportParams & {
  readonly config: CloudflareArtifactsConfig
}) => ({
  url: `${config.baseUrl}/repos/${encodeURIComponent(name)}/import`,
  init: {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      url,
      branch,
      read_only: true,
      ...(Option.isSome(depth) ? { depth: depth.value } : {})
    })
  } satisfies RequestInit
})

export const artifactRemoteWithCredentials = ({
  remote,
  token
}: {
  readonly remote: string
  readonly token: string
}): string => {
  const parsed = new URL(remote)
  parsed.username = "x"
  parsed.password = token
  return parsed.toString()
}

const envelopeMessages = (envelope: CloudflareEnvelope<unknown>): string =>
  [...(envelope.errors ?? []), ...(envelope.messages ?? [])]
    .map((entry) => entry.message)
    .filter((message): message is string => message !== undefined)
    .join("\n")

const parseImportEnvelope = (value: unknown): Option.Option<CloudflareArtifactImportResult> => {
  if (typeof value !== "object" || value === null) return Option.none()
  const envelope = value as CloudflareEnvelope<CloudflareImportResult>
  const result = envelope.result
  if (
    envelope.success !== true ||
    typeof result !== "object" ||
    result === null ||
    typeof result.name !== "string" ||
    typeof result.remote !== "string" ||
    typeof result.token !== "string"
  ) {
    return Option.none()
  }
  return Option.some({
    name: result.name,
    remote: result.remote,
    token: result.token
  })
}

const importRepo = (params: CloudflareArtifactsImportParams) =>
  Effect.gen(function* () {
    if (!isCloudflareImportableRemote(params.url)) {
      return yield* Effect.fail(
        new CloudflareArtifactsRequestFailed({
          action: "import",
          output: `Cloudflare Artifacts import requires an HTTPS Git remote. Got: ${params.url}`
        })
      )
    }

    const config = cloudflareArtifactsConfigFromEnv()
    if (config === null) {
      return yield* Effect.fail(
        new CloudflareArtifactsConfigMissing({
          reason: "Missing Cloudflare Artifacts REST configuration for --cloudflare-artifact."
        })
      )
    }

    const request = cloudflareImportRequest({ ...params, config })
    const response = yield* Effect.tryPromise({
      try: () => fetch(request.url, request.init),
      catch: (error) =>
        new CloudflareArtifactsRequestFailed({
          action: "import",
          output: String(error)
        })
    })
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) =>
        new CloudflareArtifactsRequestFailed({
          action: "import",
          status: response.status,
          output: String(error)
        })
    })
    const parsed = yield* Effect.try({
      try: () => JSON.parse(text) as CloudflareEnvelope<CloudflareImportResult>,
      catch: () =>
        new CloudflareArtifactsRequestFailed({
          action: "import",
          status: response.status,
          output: text
        })
    })
    const result = parseImportEnvelope(parsed)
    if (!response.ok || Option.isNone(result)) {
      return yield* Effect.fail(
        new CloudflareArtifactsRequestFailed({
          action: "import",
          status: response.status,
          output: envelopeMessages(parsed) || text
        })
      )
    }
    return result.value
  })

export interface CloudflareArtifactsShape {
  readonly importRepo: (
    params: CloudflareArtifactsImportParams
  ) => Effect.Effect<
    CloudflareArtifactImportResult,
    CloudflareArtifactsConfigMissing | CloudflareArtifactsRequestFailed
  >
}

export class CloudflareArtifacts extends Context.Service<
  CloudflareArtifacts,
  CloudflareArtifactsShape
>()("ingraft/CloudflareArtifacts") {}

export const CloudflareArtifactsLive = Layer.sync(CloudflareArtifacts, () => ({
  importRepo
}))
