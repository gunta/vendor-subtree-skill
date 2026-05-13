import { describe, expect, test } from "bun:test"

import { Option } from "effect"

import {
  artifactRemoteWithCredentials,
  buildImportRequest,
  cloudflareArtifactsConfigFromEnv,
  cloudflareImportBody,
  cloudflareImportEndpoint,
  isCloudflareImportableRemote
} from "../src/services/cloudflare-artifacts.ts"

describe("Cloudflare Artifacts", () => {
  test("derives REST configuration from Cloudflare environment", () => {
    const config = cloudflareArtifactsConfigFromEnv({
      ACCOUNT_ID: "acc_123",
      ARTIFACTS_NAMESPACE: "agents",
      CLOUDFLARE_API_TOKEN: "cf_token"
    })

    expect(config).toEqual({
      apiToken: "cf_token",
      baseUrl: "https://api.cloudflare.com/client/v4/accounts/acc_123/artifacts/namespaces/agents"
    })
  })

  test("returns null when CLOUDFLARE_API_TOKEN is missing", () => {
    expect(cloudflareArtifactsConfigFromEnv({})).toBeNull()
    expect(cloudflareArtifactsConfigFromEnv({ ACCOUNT_ID: "acc_123" })).toBeNull()
  })

  test("returns null when token is present but no base URL or account id", () => {
    expect(cloudflareArtifactsConfigFromEnv({ CLOUDFLARE_API_TOKEN: "cf_token" })).toBeNull()
  })

  test("prefers ARTIFACTS_BASE_URL over account-derived URL and strips trailing slash", () => {
    const config = cloudflareArtifactsConfigFromEnv({
      ACCOUNT_ID: "acc_ignored",
      ARTIFACTS_BASE_URL: "https://artifacts.example.com/v1/",
      CLOUDFLARE_API_TOKEN: "cf_token"
    })

    expect(config).toEqual({
      apiToken: "cf_token",
      baseUrl: "https://artifacts.example.com/v1"
    })
  })

  test("falls back to CLOUDFLARE_ACCOUNT_ID when ACCOUNT_ID is absent", () => {
    const config = cloudflareArtifactsConfigFromEnv({
      CLOUDFLARE_ACCOUNT_ID: "acc_456",
      CLOUDFLARE_API_TOKEN: "cf_token"
    })

    expect(config?.baseUrl).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acc_456/artifacts/namespaces/default"
    )
  })

  test("buildImportRequest produces a POST request with bearer token and JSON body", () => {
    const config = {
      apiToken: "cf_token",
      baseUrl: "https://api.cloudflare.com/client/v4/accounts/a/artifacts/namespaces/default"
    }
    const request = buildImportRequest({
      branch: "main",
      config,
      depth: Option.some(100),
      name: "effect",
      url: "https://github.com/Effect-TS/effect.git"
    })

    expect(request.method).toBe("POST")
    expect(request.url).toBe(
      "https://api.cloudflare.com/client/v4/accounts/a/artifacts/namespaces/default/repos/effect/import"
    )
    expect(request.headers).toMatchObject({
      authorization: "Bearer cf_token",
      "content-type": "application/json"
    })
  })

  test("cloudflareImportEndpoint encodes the repo name segment", () => {
    expect(
      cloudflareImportEndpoint({
        config: {
          apiToken: "t",
          baseUrl: "https://api.example.com"
        },
        name: "my repo/name"
      })
    ).toBe("https://api.example.com/repos/my%20repo%2Fname/import")
  })

  test("cloudflareImportBody serialises required fields and omits absent depth", () => {
    expect(
      JSON.parse(
        cloudflareImportBody({
          branch: "main",
          depth: Option.none(),
          url: "https://github.com/Effect-TS/effect.git"
        })
      )
    ).toEqual({
      url: "https://github.com/Effect-TS/effect.git",
      branch: "main",
      read_only: true
    })

    expect(
      JSON.parse(
        cloudflareImportBody({
          branch: "main",
          depth: Option.some(50),
          url: "https://github.com/Effect-TS/effect.git"
        })
      )
    ).toEqual({
      url: "https://github.com/Effect-TS/effect.git",
      branch: "main",
      read_only: true,
      depth: 50
    })
  })

  test("embeds short-lived artifact tokens only in the clone URL", () => {
    expect(
      artifactRemoteWithCredentials({
        remote: "https://abc.artifacts.cloudflare.net/git/default/effect.git",
        token: "art_v1_secret?expires=1760000000"
      })
    ).toBe(
      "https://x:art_v1_secret%3Fexpires%3D1760000000@abc.artifacts.cloudflare.net/git/default/effect.git"
    )
  })

  test("accepts only HTTPS remotes for REST imports", () => {
    expect(isCloudflareImportableRemote("https://github.com/Effect-TS/effect.git")).toBe(true)
    expect(isCloudflareImportableRemote("git@github.com:Effect-TS/effect.git")).toBe(false)
    expect(isCloudflareImportableRemote("http://example.com/repo.git")).toBe(false)
    expect(isCloudflareImportableRemote("not a url")).toBe(false)
  })
})
