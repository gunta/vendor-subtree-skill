class Ingraft < Formula
  desc "Vendor external source repositories into projects for coding agents"
  homepage "https://ingraft.dev"
  url "https://registry.npmjs.org/ingraft/-/ingraft-0.3.0.tgz"
  sha256 "ddb1c2a9daaa623b532fcc219bbe687f298e31660f26d298b8b09c60ce539c8a"
  license "MIT"

  depends_on "bun"
  depends_on "git"
  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match "git reference manager for coding agents", shell_output("#{bin}/ingraft --help")
  end
end
