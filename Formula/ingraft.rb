class Ingraft < Formula
  desc "Route repository context into coding-agent workflows"
  homepage "https://ingraft.dev"
  url "https://registry.npmjs.org/@ingraft/cli/-/cli-0.3.1.tgz"
  sha256 "8261d42fc32d5ea534ec1718fd34732a0a4c437bafa6b7d1c42e9cc535f85f9c"
  license "MIT"
  preserve_rpath

  depends_on "oven-sh/bun/bun"
  depends_on "git"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match "repository context router for coding agents", shell_output("#{bin}/ingraft --help")
  end
end
