class Ingraft < Formula
  desc "Route repository context into coding-agent workflows"
  homepage "https://ingraft.dev"
  url "https://registry.npmjs.org/ingraft/-/ingraft-0.3.0.tgz"
  sha256 "d4b4555592bbd70ce4a43ac8d5d74260398f3901b1bcc04089b55d9402f1432e"
  license "MIT"

  depends_on "bun"
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
