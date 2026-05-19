class Ingraft < Formula
  desc "Route repository context into coding-agent workflows"
  homepage "https://ingraft.dev"
  url "https://registry.npmjs.org/@ingraft/cli/-/cli-0.3.2.tgz"
  sha256 "82f12c0c608ef257b600d44a92a2e419d497d2b4499b2d4fa148f5f676fa23fe"
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
