export type PortlessOutputRewriteOptions = {
  readonly host: string
  readonly port: string
  readonly publicOrigin?: string
}

export const rewritePortlessDevServerUrls = (
  output: string,
  { host, port, publicOrigin }: PortlessOutputRewriteOptions
): string => {
  if (!publicOrigin) return output

  const trimmedPort = port.trim()
  if (!trimmedPort) return output

  const localHosts = new Set([host, "127.0.0.1", "localhost", "[::1]"])
  let rewritten = output

  for (const localHost of localHosts) {
    rewritten = rewritten.split(`http://${localHost}:${trimmedPort}`).join(publicOrigin)
  }

  return rewritten
}
