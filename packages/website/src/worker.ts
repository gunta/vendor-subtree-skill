interface AssetsEnv {
  readonly ASSETS: { fetch(request: Request): Promise<Response> }
}

export default {
  fetch: (request: Request, env: AssetsEnv) => env.ASSETS.fetch(request)
}
