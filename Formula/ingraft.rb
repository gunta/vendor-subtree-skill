class Ingraft < Formula
  desc "Route repository context into coding-agent workflows"
  homepage "https://ingraft.dev"
  url "https://registry.npmjs.org/@ingraft/cli/-/cli-0.3.2.tgz"
  sha256 "05fa295a407268382acc8d6bf2db197aec12d5ed97cc8d1801600cf0a57c14ec"
  license "MIT"
  preserve_rpath

  depends_on "oven-sh/bun/bun"
  depends_on "git"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
    man1.install libexec/"lib/node_modules/@ingraft/cli/man/ingraft.1"
  end

  test do
    assert_match "repository context router for coding agents", shell_output("#{bin}/ingraft --help")
    assert_predicate man1/"ingraft.1", :exist?, "ingraft.1 man page was not installed"
  end
end
